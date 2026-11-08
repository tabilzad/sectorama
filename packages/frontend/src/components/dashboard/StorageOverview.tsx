import { useStorageOverview } from '@/api/hooks/useStats.ts';
import { formatBytes } from '../../lib/formatBytes';
import type {
  DriveType,
  StorageClassSummary,
  StorageUsageSource,
  UnattributedStorage,
} from '@sectorama/shared';

const TYPE_LABEL: Record<DriveType, string> = {
  HDD:     'Hard drives',
  SSD:     'SATA SSDs',
  NVMe:    'NVMe drives',
  Unknown: 'Other drives',
};

const SOURCE_LABEL: Record<StorageUsageSource, string | null> = {
  unraid: 'Unraid array status',
  linux:  'mounted filesystems',
  mock:   'mock data',
  none:   null,
};

/**
 * Fill-level tone. Thresholds follow the usual operational guidance for
 * spinning arrays (performance drops past ~75%, risk past ~90%). The label is
 * always rendered next to the bar so the state is never conveyed by colour alone.
 */
function usageTone(pct: number): { bar: string; text: string; label: string } {
  if (pct >= 90) return { bar: 'bg-danger',       text: 'text-danger',       label: 'critical' };
  if (pct >= 75) return { bar: 'bg-warn',         text: 'text-warn',         label: 'filling up' };
  return            { bar: 'bg-accent-light', text: 'text-accent-light', label: 'healthy' };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct  = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const tone = usageTone(pct);
  return (
    <div className="mt-3">
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% used`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface-300"
      >
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={`font-medium ${tone.text}`}>{pct}% used · {tone.label}</span>
        <span className="text-gray-400 tabular-nums">{formatBytes(Math.max(0, total - used))} free</span>
      </div>
    </div>
  );
}

function ClassCard({ cls }: { cls: StorageClassSummary }) {
  const label    = TYPE_LABEL[cls.type];
  const measured = cls.fsTotalBytes !== null && cls.fsTotalBytes > 0;

  return (
    <div className="card flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        <span className="text-xs text-gray-500 tabular-nums">
          {plural(cls.driveCount, 'drive')} · {formatBytes(cls.rawCapacityBytes)} raw
        </span>
      </div>

      {measured ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-white">{formatBytes(cls.fsUsedBytes!)}</span>
            <span className="text-sm text-gray-400">used of {formatBytes(cls.fsTotalBytes!)}</span>
          </div>
          <UsageBar used={cls.fsUsedBytes!} total={cls.fsTotalBytes!} label={`${label} usage`} />
          <span className="mt-2 text-xs text-gray-500">{plural(cls.filesystemCount, 'filesystem')} measured</span>
        </>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-white">{formatBytes(cls.rawCapacityBytes)}</span>
            <span className="text-sm text-gray-400">raw capacity</span>
          </div>
          <span className="mt-3 text-xs text-gray-500">Used and free space not measured for these drives.</span>
        </>
      )}
    </div>
  );
}

function UnattributedCard({ data }: { data: UnattributedStorage }) {
  return (
    <div className="card flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Other pools</span>
        <span className="text-xs text-gray-500">{plural(data.filesystemCount, 'filesystem')}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-white">{formatBytes(data.fsUsedBytes)}</span>
        <span className="text-sm text-gray-400">used of {formatBytes(data.fsTotalBytes)}</span>
      </div>
      <UsageBar used={data.fsUsedBytes} total={data.fsTotalBytes} label="Other pools usage" />
      <span className="mt-2 text-xs text-gray-500">Drive type could not be determined for these filesystems.</span>
    </div>
  );
}

export default function StorageOverview() {
  const { data, isLoading, isError } = useStorageOverview();

  if (isLoading) {
    return (
      <section className="mb-10" aria-busy="true" aria-label="Storage overview loading">
        <div className="card h-32 shimmer" />
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section className="mb-10">
        <p className="text-sm text-gray-500">Storage overview could not be loaded.</p>
      </section>
    );
  }

  const classes = data.classes.filter(c => c.driveCount > 0 || c.filesystemCount > 0);
  if (classes.length === 0 && !data.unattributed) return null;

  const sourceLabel = SOURCE_LABEL[data.usageSource];

  return (
    <section className="mb-10" aria-labelledby="storage-overview-heading">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="storage-overview-heading" className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Storage
        </h2>
        {sourceLabel && <span className="text-xs text-gray-500">Usage from {sourceLabel}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map(c => <ClassCard key={c.type} cls={c} />)}
        {data.unattributed && <UnattributedCard data={data.unattributed} />}
      </div>

      {data.usageSource === 'none' && (
        <p className="mt-3 text-xs text-gray-500">
          Used and free space need the host&apos;s filesystems visible inside the container: add{' '}
          <code className="font-mono text-gray-400">/mnt:/mnt:ro</code> (or{' '}
          <code className="font-mono text-gray-400">/var/local/emhttp:/var/local/emhttp:ro</code> on Unraid) to the
          container&apos;s volumes. See the README.
        </p>
      )}
    </section>
  );
}
