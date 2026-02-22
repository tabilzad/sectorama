import { Link } from 'react-router-dom';
import type { DriveSummary } from '@sectorama/shared';
import HealthBadge from './HealthBadge';
import { formatBytes } from '../../lib/formatBytes';

interface DriveCardProps {
  drive: DriveSummary;
}

export default function DriveCard({ drive }: DriveCardProps) {
  return (
    <Link
      to={`/drives/${drive.driveId}`}
      className={`card flex flex-col gap-3 hover:border-accent/40 transition-colors ${!drive.isConnected ? 'opacity-60' : ''}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-white line-clamp-1">{drive.vendor} {drive.model}</p>
          <p className="text-xs text-gray-500 font-mono mt-0.5">{drive.devicePath}</p>
        </div>
        <HealthBadge health={drive.health} size="sm" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-gray-500">Type</p>
          <p className="text-sm font-medium text-gray-300">{drive.type}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Capacity</p>
          <p className="text-sm font-medium text-gray-300">{formatBytes(drive.capacity)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Temp</p>
          <p className={`text-sm font-medium ${
            drive.temperature == null ? 'text-gray-500'
            : drive.temperature > 55 ? 'text-danger'
            : drive.temperature > 45 ? 'text-warn'
            : 'text-gray-300'
          }`}>
            {drive.temperature != null ? `${drive.temperature}°C` : '—'}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-1 border-t border-surface-300 text-xs text-accent">
        View Details →
      </div>
    </Link>
  );
}
