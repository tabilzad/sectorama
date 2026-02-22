import type { DriveHealth } from '@sectorama/shared';

interface HealthBadgeProps {
  health: DriveHealth;
  size?: 'sm' | 'md';
}

const LABELS: Record<DriveHealth, string> = {
  ok:      'PASSED',
  warning: 'WARNING',
  failed:  'FAILED',
  unknown: 'UNKNOWN',
};

const CLASSES: Record<DriveHealth, string> = {
  ok:      'bg-brand/20 text-brand border-brand/40',
  warning: 'bg-warn/20 text-warn border-warn/40',
  failed:  'bg-danger/20 text-danger border-danger/40',
  unknown: 'bg-surface-300 text-gray-500 border-surface-300',
};

export default function HealthBadge({ health, size = 'md' }: HealthBadgeProps) {
  const sizeClass = size === 'sm'
    ? 'text-xs px-1.5 py-0.5'
    : 'text-sm px-2.5 py-1';

  return (
    <span className={`inline-flex items-center font-semibold rounded border ${sizeClass} ${CLASSES[health]}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${health === 'ok' ? 'bg-brand' : health === 'warning' ? 'bg-warn' : health === 'failed' ? 'bg-danger' : 'bg-gray-500'}`} />
      {LABELS[health]}
    </span>
  );
}
