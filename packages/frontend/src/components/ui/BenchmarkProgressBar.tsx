import { formatSpeed } from '../../lib/formatBytes';

interface BenchmarkProgressBarProps {
  pointIndex:  number;
  totalPoints: number;
  speedBps:    number;
  phase?:      'curve' | 'profiles';
  phaseLabel?: string;
}

export default function BenchmarkProgressBar({
  pointIndex,
  totalPoints,
  speedBps,
  phase,
  phaseLabel,
}: BenchmarkProgressBarProps) {
  const pct = Math.round(((pointIndex + 1) / totalPoints) * 100);

  const isProfiles = phase === 'profiles';

  const leftLabel = isProfiles
    ? `Profiling: ${phaseLabel ?? '…'} (${pointIndex + 1}/${totalPoints})`
    : `Speed curve… point ${pointIndex + 1}/${totalPoints}`;

  const rightLabel = isProfiles
    ? null
    : <span className="font-mono text-accent-light">{formatSpeed(speedBps)}</span>;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{leftLabel}</span>
        {rightLabel}
      </div>
      <div className="w-full bg-surface-300 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${isProfiles ? 'bg-brand animate-pulse' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
