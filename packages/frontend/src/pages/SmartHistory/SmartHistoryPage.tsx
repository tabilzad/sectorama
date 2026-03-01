import { useState } from 'react';
import { useDisks } from '@/api/hooks/useDisks.ts';
import { useSmartHistory } from '@/api/hooks/useSmart.ts';
import { useAlertThresholds } from '../../api/hooks/useNotifications';
import SmartAttributeChart, { type TempZoneConfig } from '../../components/charts/SmartAttributeChart';
import { ZONE_DEFAULTS } from '../DriveDetail/DriveAlertSettings';
import { FullPageSpinner } from '../../components/ui/LoadingSpinner';
import { FormSelect } from '../../components/ui/FormSelect';
import type { DriveSummary, DriveAlertThreshold } from '@sectorama/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

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
  'UDMA_CRC_Error_Count',
  'Power_On_Hours',
  'Power_Cycle_Count',
  'Available Spare %',
  'Media Errors',
];

function formatAttrLabel(attr: string): string {
  return attr.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function resolveZoneConfig(
  driveId: number,
  thresholds: DriveAlertThreshold[] | undefined,
): TempZoneConfig | undefined {
  const t = thresholds?.find(x => x.driveId === driveId);
  if (!t) return undefined;
  return {
    normal: t.tempNormalCelsius  ?? ZONE_DEFAULTS.normal,
    warm:   t.tempWarmCelsius    ?? ZONE_DEFAULTS.warm,
    hot:    t.temperatureThresholdCelsius,
    tooHot: t.tempTooHotCelsius  ?? ZONE_DEFAULTS.tooHot,
  };
}

// ─── Per-drive panel (one component per drive so hooks are called at top level) ──

interface DriveHistoryPanelProps {
  drive:      DriveSummary;
  attr:       string;
  timeRange:  string;
  zoneConfig: TempZoneConfig | undefined;
}

function DriveHistoryPanel({ drive, attr, timeRange, zoneConfig }: DriveHistoryPanelProps) {
  const { data: history, isLoading } = useSmartHistory(drive.driveId, attr, timeRange, 'now()');
  const points = Array.isArray(history) ? history : [];

  return (
    <div className="card">
      {/* Drive header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">
            {drive.vendor} {drive.model}
          </span>
          <span className="text-xs text-gray-600 font-mono">{drive.devicePath}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-600 uppercase tracking-wide">{drive.type}</span>
          {!drive.isConnected && (
            <span className="text-xs text-gray-600 border border-gray-700 px-1.5 py-0.5 rounded">
              disconnected
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div
          className="rounded animate-pulse"
          style={{ height: 200, background: 'rgba(255,255,255,0.03)' }}
        />
      ) : (
        <SmartAttributeChart
          points={points}
          attrName={attr}
          height={200}
          zoneConfig={zoneConfig}
        />
      )}
    </div>
  );
}

// ─── All-drives stacked view ──────────────────────────────────────────────────

interface AllDrivesViewProps {
  disks:      DriveSummary[];
  attr:       string;
  timeRange:  string;
  thresholds: DriveAlertThreshold[] | undefined;
}

function AllDrivesView({ disks, attr, timeRange, thresholds }: AllDrivesViewProps) {
  if (!disks.length) {
    return (
      <p className="text-gray-500 text-center py-16">No drives registered yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600">
        {disks.length} drive{disks.length !== 1 ? 's' : ''} · {formatAttrLabel(attr)} · each chart fetches independently
      </p>
      {disks.map(drive => (
        <DriveHistoryPanel
          key={drive.driveId}
          drive={drive}
          attr={attr}
          timeRange={timeRange}
          zoneConfig={resolveZoneConfig(drive.driveId, thresholds)}
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type DriveSelection = number | 'all' | null;

export default function SmartHistoryPage() {
  const { data: disks, isLoading }  = useDisks();
  const { data: thresholds }        = useAlertThresholds();

  const [selectedDriveId, setSelectedDriveId] = useState<DriveSelection>('all');
  const [selectedAttr, setSelectedAttr]       = useState('temperature');
  const [timeRange, setTimeRange]             = useState('-7d');

  // Single-drive history — only fetches when a specific drive is selected
  const singleDriveId = typeof selectedDriveId === 'number' ? selectedDriveId : null;
  const { data: history, isLoading: histLoading } = useSmartHistory(
    singleDriveId,
    selectedAttr,
    timeRange,
    'now()',
  );

  const historyPoints = Array.isArray(history) ? history : [];
  const zoneConfig    = singleDriveId !== null
    ? resolveZoneConfig(singleDriveId, thresholds)
    : undefined;

  function handleDriveChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (!v)         setSelectedDriveId(null);
    else if (v === 'all') setSelectedDriveId('all');
    else            setSelectedDriveId(parseInt(v, 10));
  }

  if (isLoading) return <FullPageSpinner />;

  const driveSelectValue =
    selectedDriveId === null  ? '' :
    selectedDriveId === 'all' ? 'all' :
    String(selectedDriveId);

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">SMART History</h1>

      {/* Controls */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Drive selector */}
          <FormSelect
            label="Drive"
            value={driveSelectValue}
            onChange={handleDriveChange}
            className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2
                       text-sm text-gray-200 focus:outline-none focus:border-accent"
          >
            <option value="">Select a drive…</option>
            <option value="all">— All Drives —</option>
            {(disks ?? []).map(d => (
              <option key={d.driveId} value={d.driveId}>
                {d.vendor} {d.model} ({d.devicePath})
              </option>
            ))}
          </FormSelect>

          {/* Attribute selector */}
          <FormSelect
            label="Attribute"
            value={selectedAttr}
            onChange={e => setSelectedAttr(e.target.value)}
            className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2
                       text-sm text-gray-200 focus:outline-none focus:border-accent"
          >
            {COMMON_ATTRS.map(a => (
              <option key={a} value={a}>{formatAttrLabel(a)}</option>
            ))}
          </FormSelect>

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

      {/* Chart area */}
      {selectedDriveId === null ? (
        <div className="card">
          <p className="text-gray-500 text-center py-16">Select a drive to view SMART history.</p>
        </div>
      ) : selectedDriveId === 'all' ? (
        <AllDrivesView
          disks={disks ?? []}
          attr={selectedAttr}
          timeRange={timeRange}
          thresholds={thresholds}
        />
      ) : histLoading ? (
        <div className="card">
          <FullPageSpinner />
        </div>
      ) : (
        <div className="card">
          <SmartAttributeChart
            points={historyPoints}
            attrName={selectedAttr}
            zoneConfig={zoneConfig}
          />
        </div>
      )}
    </div>
  );
}
