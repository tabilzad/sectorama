import type { ProfileResult, BenchmarkProfile } from '@sectorama/shared';

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatBw(bps: number): string {
  const mbps = bps / 1e6;
  return mbps >= 1000
    ? `${(mbps / 1000).toFixed(2)} GB/s`
    : `${mbps.toFixed(0)} MB/s`;
}

function formatIops(iops: number): string {
  if (iops >= 1e6) return `${(iops / 1e6).toFixed(2)}M`;
  if (iops >= 1e3) return `${(iops / 1e3).toFixed(0)}K`;
  return Math.round(iops).toLocaleString();
}

function formatLatency(ns: number): string {
  if (ns < 1_000)       return `${Math.round(ns)} ns`;
  if (ns < 1_000_000)   return `${(ns / 1_000).toFixed(1)} µs`;
  return                      `${(ns / 1_000_000).toFixed(2)} ms`;
}

// ─── Per-profile display config ───────────────────────────────────────────────

interface ProfileDisplay {
  label:        string;
  primaryLabel: string;
  primary:      (r: ProfileResult) => string;
  secondaryLabel: string;
  secondary:    (r: ProfileResult) => string;
  detail:       string;
}

const PROFILE_DISPLAY: Record<BenchmarkProfile, ProfileDisplay> = {
  seq_read: {
    label:          'Sequential Read',
    primaryLabel:   'Throughput',
    primary:        r => formatBw(r.bwBps),
    secondaryLabel: 'P99 Latency',
    secondary:      r => formatLatency(r.latP99Ns),
    detail:         '1 MiB blocks · 1 job · 30 s',
  },
  rand_read_4k: {
    label:          '4K Random Read',
    primaryLabel:   'IOPS',
    primary:        r => formatIops(r.iops),
    secondaryLabel: 'P99 Latency',
    secondary:      r => formatLatency(r.latP99Ns),
    detail:         '4 KiB blocks · 8 jobs · 30 s',
  },
  latency: {
    label:          'Idle Latency',
    primaryLabel:   'Mean Latency',
    primary:        r => formatLatency(r.latMeanNs),
    secondaryLabel: 'P99.9 Latency',
    secondary:      r => formatLatency(r.latP999Ns),
    detail:         '4 KiB blocks · QD 1 · 30 s',
  },
};

// ─── ProfileCard ──────────────────────────────────────────────────────────────

function ProfileCard({ result }: { result: ProfileResult }) {
  const display = PROFILE_DISPLAY[result.profile];

  return (
    <div className="bg-surface-100 border border-surface-300 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
        {display.label}
      </p>

      {/* Primary metric */}
      <p className="text-2xl font-bold text-white tabular-nums leading-none mb-1">
        {display.primary(result)}
      </p>
      <p className="text-xs text-gray-500 mb-3">{display.primaryLabel}</p>

      {/* Latency breakdown */}
      <dl className="space-y-1 text-xs">
        {[
          ['Mean', formatLatency(result.latMeanNs)],
          ['P50',  formatLatency(result.latP50Ns)],
          ['P95',  formatLatency(result.latP95Ns)],
          ['P99',  formatLatency(result.latP99Ns)],
          ['P99.9', formatLatency(result.latP999Ns)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-gray-600">{label}</dt>
            <dd className="text-gray-300 font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-gray-700 mt-3">{display.detail}</p>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface ProfileResultsPanelProps {
  results: ProfileResult[];
}

export default function ProfileResultsPanel({ results }: ProfileResultsPanelProps) {
  if (results.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold text-white mb-3">
        fio Benchmark Profiles
        <span className="ml-2 text-xs font-normal text-gray-500">
          read-only · direct I/O
        </span>
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {results.map(r => (
          <ProfileCard key={r.profile} result={r} />
        ))}
      </div>
    </div>
  );
}
