import { useState } from 'react';
import { useDisks } from '../../api/hooks/useDisks';
import { useSmartHistory } from '../../api/hooks/useSmart';
import SmartAttributeChart from '../../components/charts/SmartAttributeChart';
import { FullPageSpinner } from '../../components/ui/LoadingSpinner';

const TIME_RANGES = [
  { label: '24 hours', from: '-24h' },
  { label: '7 days',   from: '-7d' },
  { label: '30 days',  from: '-30d' },
  { label: '90 days',  from: '-90d' },
];

const COMMON_ATTRS = [
  'temperature',
  'Reallocated_Sector_Ct',
  'Current_Pending_Sector',
  'Offline_Uncorrectable',
  'Power_On_Hours',
  'Power_Cycle_Count',
  'Available Spare %',
  'Media Errors',
];

export default function SmartHistoryPage() {
  const { data: disks, isLoading } = useDisks();
  const [selectedDriveId, setSelectedDriveId] = useState<number | null>(null);
  const [selectedAttr, setSelectedAttr]       = useState('temperature');
  const [timeRange, setTimeRange]             = useState('-7d');

  const { data: history, isLoading: histLoading } = useSmartHistory(
    selectedDriveId,
    selectedAttr,
    timeRange,
    'now()',
  );

  if (isLoading) return <FullPageSpinner />;

  const historyPoints = Array.isArray(history) ? history : [];

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">SMART History</h1>

      {/* Controls */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Drive selector */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Drive</label>
            <select
              value={selectedDriveId ?? ''}
              onChange={e => setSelectedDriveId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2
                         text-sm text-gray-200 focus:outline-none focus:border-accent"
            >
              <option value="">Select a drive…</option>
              {(disks ?? []).map(d => (
                <option key={d.driveId} value={d.driveId}>
                  {d.vendor} {d.model} ({d.devicePath})
                </option>
              ))}
            </select>
          </div>

          {/* Attribute selector */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Attribute</label>
            <select
              value={selectedAttr}
              onChange={e => setSelectedAttr(e.target.value)}
              className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2
                         text-sm text-gray-200 focus:outline-none focus:border-accent"
            >
              {COMMON_ATTRS.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Time range */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Time Range</label>
            <div className="flex gap-1">
              {TIME_RANGES.map(({ label, from }) => (
                <button
                  key={from}
                  onClick={() => setTimeRange(from)}
                  className={`flex-1 px-2 py-2 text-xs rounded-lg border transition-colors ${
                    timeRange === from
                      ? 'bg-accent text-white border-accent'
                      : 'border-surface-300 text-gray-400 hover:border-accent/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card">
        {!selectedDriveId ? (
          <p className="text-gray-500 text-center py-16">Select a drive to view SMART history.</p>
        ) : histLoading ? (
          <FullPageSpinner />
        ) : (
          <SmartAttributeChart
            points={historyPoints}
            attrName={selectedAttr}
          />
        )}
      </div>
    </div>
  );
}
