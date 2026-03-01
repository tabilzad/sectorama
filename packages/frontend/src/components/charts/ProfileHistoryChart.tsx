import { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { BenchmarkSeries, BenchmarkProfile } from '@sectorama/shared';

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatBw(bps: number): string {
  const mbps = bps / 1e6;
  return mbps >= 1000 ? `${(mbps / 1000).toFixed(2)} GB/s` : `${mbps.toFixed(0)} MB/s`;
}

function formatIops(iops: number): string {
  if (iops >= 1e6) return `${(iops / 1e6).toFixed(2)}M`;
  if (iops >= 1e3) return `${(iops / 1e3).toFixed(0)}K`;
  return Math.round(iops).toLocaleString();
}

function formatLatency(ns: number): string {
  if (ns < 1_000)     return `${Math.round(ns)} ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)} µs`;
  return `${(ns / 1_000_000).toFixed(2)} ms`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRunDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

// ─── Delta badge ──────────────────────────────────────────────────────────────

function DeltaBadge({ delta, higherIsBetter }: { delta: number; higherIsBetter: boolean }) {
  if (Math.abs(delta) < 0.5) {
    return <span className="text-gray-600 font-mono tabular-nums">~0%</span>;
  }
  const good = higherIsBetter ? delta > 0 : delta < 0;
  const sign = delta > 0 ? '+' : '';
  return (
    <span className={`font-mono tabular-nums ${good ? 'text-brand' : 'text-danger'}`}>
      {sign}{delta.toFixed(1)}%
    </span>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

interface LatencyMetric {
  key: 'latMeanNs' | 'latP50Ns' | 'latP95Ns' | 'latP99Ns' | 'latP999Ns';
  label: string;
  color: string;
  visibleByDefault: boolean;
}

const LATENCY_METRICS: LatencyMetric[] = [
  { key: 'latMeanNs',  label: 'Mean',  color: '#90ee7e', visibleByDefault: true },
  { key: 'latP50Ns',   label: 'P50',   color: '#2b908f', visibleByDefault: true },
  { key: 'latP95Ns',   label: 'P95',   color: '#aaeeee', visibleByDefault: true },
  { key: 'latP99Ns',   label: 'P99',   color: '#f45b5b', visibleByDefault: true },
  { key: 'latP999Ns',  label: 'P99.9', color: '#ff0066', visibleByDefault: true },
];

const PROFILE_TABS: { id: BenchmarkProfile; label: string }[] = [
  { id: 'seq_read',     label: 'Seq Read'  },
  { id: 'rand_read_4k', label: '4K Random' },
  { id: 'latency',      label: 'Latency'   },
];

// ─── Chart point ──────────────────────────────────────────────────────────────

interface ChartPoint {
  idx:         number;
  runId:       number;
  startedAt:   string;
  bwBps:       number;
  iops:        number;
  latMeanNs:   number;
  latP50Ns:    number;
  latP95Ns:    number;
  latP99Ns:    number;
  latP999Ns:   number;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ProfileHistoryChartProps {
  series:  BenchmarkSeries[];
  height?: number;
}

export default function ProfileHistoryChart({ series, height = 260 }: ProfileHistoryChartProps) {
  const [activeProfile, setActiveProfile] = useState<BenchmarkProfile>('seq_read');
  const [hiddenMetrics, setHiddenMetrics] = useState<Set<string>>(
    () => new Set(LATENCY_METRICS.filter(m => !m.visibleByDefault).map(m => m.key)),
  );

  const toggleMetric = useCallback((key: string) => {
    setHiddenMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Runs with profile data, sorted oldest → newest
  const profileRuns = series
    .filter(s => s.profileResults.length > 0)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  if (profileRuns.length === 0) {
    return (
      <p className="text-sm text-gray-600 text-center py-6">
        No fio profile data found. Run a new benchmark to start collecting profile history.
      </p>
    );
  }

  // Build chart data for the active profile
  const chartData: ChartPoint[] = profileRuns
    .map((run, idx) => {
      const r = run.profileResults.find(p => p.profile === activeProfile);
      if (!r) return null;
      return {
        idx,
        runId:      run.runId,
        startedAt:  run.startedAt,
        bwBps:      r.bwBps,
        iops:       r.iops,
        latMeanNs:  r.latMeanNs,
        latP50Ns:   r.latP50Ns,
        latP95Ns:   r.latP95Ns,
        latP99Ns:   r.latP99Ns,
        latP999Ns:  r.latP999Ns,
      };
    })
    .filter((d): d is ChartPoint => d !== null);

  const isLatency = activeProfile === 'latency';
  const isSeqRead = activeProfile === 'seq_read';
  const higherIsBetter = !isLatency;

  type PrimaryKey = 'bwBps' | 'iops' | 'latMeanNs';
  const primaryKey: PrimaryKey = isSeqRead ? 'bwBps' : isLatency ? 'latMeanNs' : 'iops';
  const primaryLabel   = isSeqRead ? 'Throughput' : isLatency ? 'Mean Latency' : 'IOPS';
  const primaryFormat  = isSeqRead ? formatBw     : isLatency ? formatLatency   : formatIops;
  const yAxisUnitLabel = isSeqRead ? 'MB/s'       : isLatency ? 'Latency'       : 'IOPS';

  function yAxisFormat(val: number): string {
    if (isSeqRead) return `${(val / 1e6).toFixed(0)}`;
    if (!isLatency) {
      if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
      if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
      return String(Math.round(val));
    }
    if (val < 1_000)     return `${Math.round(val)} ns`;
    if (val < 1_000_000) return `${(val / 1_000).toFixed(0)} µs`;
    return `${(val / 1_000_000).toFixed(1)} ms`;
  }

  function pctDelta(curr: number, base: number): number {
    if (base === 0) return 0;
    return ((curr - base) / base) * 100;
  }

  const visibleLatencyMetrics = LATENCY_METRICS.filter(m => !hiddenMetrics.has(m.key));
  const hasChart = chartData.length >= 2;
  const dotR = chartData.length > 20 ? 2 : 3;

  // X-axis tick density: show at most ~7 ticks
  const xTickInterval = Math.max(0, Math.floor(chartData.length / 7) - 1);

  return (
    <div>
      {/* ── Header row ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white inline">
            Profile History
          </h3>
          <span className="ml-2 text-xs text-gray-500">
            {profileRuns.length} run{profileRuns.length !== 1 ? 's' : ''} with profile data
          </span>
        </div>
        {/* Profile tab switcher */}
        <div className="flex gap-1 bg-surface-100 p-1 rounded-lg border border-surface-300 self-start sm:self-auto">
          {PROFILE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveProfile(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeProfile === tab.id
                  ? 'bg-accent text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Not enough data ── */}
      {!hasChart && (
        <p className="text-sm text-gray-600 text-center py-8 border border-surface-300 rounded-lg mb-4">
          Run at least 2 benchmarks to see a performance trend.
        </p>
      )}

      {/* ── Latency metric toggles ── */}
      {hasChart && isLatency && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {LATENCY_METRICS.map(m => {
            const hidden = hiddenMetrics.has(m.key);
            return (
              <button
                key={m.key}
                onClick={() => toggleMetric(m.key)}
                title={hidden ? 'Click to show' : 'Click to hide'}
                className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-opacity ${
                  hidden
                    ? 'opacity-35 border-gray-700 bg-transparent'
                    : 'border-gray-600 bg-gray-800/40'
                }`}
              >
                <span
                  className="inline-block rounded-sm flex-shrink-0"
                  style={{ width: 16, height: 3, backgroundColor: m.color }}
                />
                <span className={hidden ? 'line-through text-gray-500' : 'text-gray-300'}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Trend chart ── */}
      {hasChart && (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={chartData} margin={{ top: 5, right: 24, bottom: 28, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333345" />
            <XAxis
              dataKey="idx"
              type="number"
              domain={[0, chartData.length - 1]}
              ticks={chartData.map(d => d.idx)}
              interval={xTickInterval}
              tickFormatter={idx => formatShortDate(chartData[idx as number]?.startedAt ?? '')}
              stroke="#666"
              tick={{ fill: '#999', fontSize: 10 }}
              label={{ value: 'Run date', position: 'insideBottom', offset: -14, fill: '#666', fontSize: 11 }}
            />
            <YAxis
              tickFormatter={yAxisFormat}
              stroke="#666"
              tick={{ fill: '#999', fontSize: 10 }}
              label={{ value: yAxisUnitLabel, angle: -90, position: 'insideLeft', offset: 10, fill: '#666', fontSize: 11 }}
              width={68}
            />
            <Tooltip
              contentStyle={{ background: '#1a1a24', border: '1px solid #333345', borderRadius: 6 }}
              labelStyle={{ color: '#888', marginBottom: 4 }}
              labelFormatter={idx => {
                const pt = chartData[idx as number];
                return pt ? `Run #${pt.runId} · ${formatRunDate(pt.startedAt)}` : '';
              }}
              formatter={(value, name) => {
                const n = value as number;
                if (name === 'bwBps')     return [formatBw(n),       'Throughput'];
                if (name === 'iops')      return [formatIops(n),      'IOPS'];
                if (name === 'latMeanNs') return [formatLatency(n),   'Mean'];
                if (name === 'latP50Ns')  return [formatLatency(n),   'P50'];
                if (name === 'latP95Ns')  return [formatLatency(n),   'P95'];
                if (name === 'latP99Ns')  return [formatLatency(n),   'P99'];
                if (name === 'latP999Ns') return [formatLatency(n),   'P99.9'];
                return [String(value), String(name)];
              }}
            />
            {isLatency ? (
              visibleLatencyMetrics.map(m => (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  name={m.key}
                  stroke={m.color}
                  strokeWidth={2}
                  dot={{ fill: m.color, r: dotR, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  connectNulls
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey={primaryKey}
                name={primaryKey}
                stroke="#2b908f"
                strokeWidth={2}
                dot={{ fill: '#2b908f', r: dotR, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* ── Delta comparison table ── */}
      {chartData.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-300">
                <th className="pb-2 pr-4 text-left text-gray-500 font-medium">Run</th>
                <th className="pb-2 pr-4 text-right text-gray-500 font-medium">{primaryLabel}</th>
                {isLatency && (
                  <>
                    <th className="pb-2 pr-4 text-right text-gray-500 font-medium">P99</th>
                    <th className="pb-2 pr-4 text-right text-gray-500 font-medium">P99.9</th>
                  </>
                )}
                {chartData.length > 1 && (
                  <>
                    <th className="pb-2 pr-4 text-right text-gray-500 font-medium whitespace-nowrap">
                      Δ first
                    </th>
                    <th className="pb-2 text-right text-gray-500 font-medium whitespace-nowrap">
                      Δ prev
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {chartData.map((pt, i) => {
                const primaryVal:  number        = pt[primaryKey];
                const baselineVal: number        = chartData[0][primaryKey];
                const prevVal:     number | null = i > 0 ? chartData[i - 1][primaryKey] : null;

                return (
                  <tr
                    key={pt.runId}
                    className="border-b border-surface-300/30 hover:bg-surface-200/20 transition-colors"
                  >
                    <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">
                      <span className="text-gray-600 font-mono">#{pt.runId}</span>
                      <span className="ml-2">{formatShortDate(pt.startedAt)}</span>
                    </td>
                    <td className="py-2 pr-4 text-right text-gray-200 font-mono tabular-nums">
                      {primaryFormat(primaryVal)}
                    </td>
                    {isLatency && (
                      <>
                        <td className="py-2 pr-4 text-right text-gray-400 font-mono tabular-nums">
                          {formatLatency(pt.latP99Ns)}
                        </td>
                        <td className="py-2 pr-4 text-right text-gray-400 font-mono tabular-nums">
                          {formatLatency(pt.latP999Ns)}
                        </td>
                      </>
                    )}
                    {chartData.length > 1 && (
                      <>
                        <td className="py-2 pr-4 text-right">
                          {i === 0 ? (
                            <span className="text-gray-600">baseline</span>
                          ) : (
                            <DeltaBadge
                              delta={pctDelta(primaryVal, baselineVal)}
                              higherIsBetter={higherIsBetter}
                            />
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {i === 0 || prevVal === null ? (
                            <span className="text-gray-600">—</span>
                          ) : (
                            <DeltaBadge
                              delta={pctDelta(primaryVal, prevVal)}
                              higherIsBetter={higherIsBetter}
                            />
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {chartData.length >= 2 && (
        <p className="text-xs text-gray-700 mt-3 text-right">
          {higherIsBetter ? 'Higher is better.' : 'Lower is better.'}
          {' '}Green = improvement · Red = degradation
        </p>
      )}
    </div>
  );
}
