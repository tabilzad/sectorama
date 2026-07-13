import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDisks } from '@/api/hooks/useDisks.ts';
import { useSmartHistory } from '@/api/hooks/useSmart.ts';
import { useAlertThresholds } from '@/api/hooks/useNotifications.ts';
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

interface AttrOption { label: string; value: string; }

/** Attributes available for any drive type (stored on smart_readings measurement). */
const COMMON_ATTRS: AttrOption[] = [
  { label: 'Temperature',    value: 'temperature' },
  { label: 'Power On Hours', value: 'Power_On_Hours' },
  { label: 'Power Cycles',   value: 'Power_Cycle_Count' },
];

/** ATA/SATA-specific attributes (stored on smart_attributes measurement by attr_name tag). */
const ATA_ATTRS: AttrOption[] = [
  ...COMMON_ATTRS,
  { label: 'Reallocated Sectors',  value: 'Reallocated_Sector_Ct' },
  { label: 'Pending Sectors',      value: 'Current_Pending_Sector' },
  { label: 'Uncorrectable Errors', value: 'Offline_Uncorrectable' },
  { label: 'CRC Errors',           value: 'UDMA_CRC_Error_Count' },
];

/** NVMe-specific attributes (stored on smart_attributes measurement by attr_name tag). */
const NVME_ATTRS: AttrOption[] = [
  ...COMMON_ATTRS,
  { label: 'Available Spare %',         value: 'Available Spare %' },
  { label: 'Endurance Used %',          value: 'Percentage Used' },
  { label: 'Media Errors',              value: 'Media Errors' },
  { label: 'Error Log Entries',         value: 'Error Log Entries' },
  { label: 'Unsafe Shutdowns',          value: 'Unsafe Shutdowns' },
  { label: 'Critical Warning',          value: 'Critical Warning' },
  { label: 'Data Units Written',        value: 'Data Units Written' },
  { label: 'Data Units Read',           value: 'Data Units Read' },
  { label: 'Warning Temp Time (min)',   value: 'Warning Temp Time (min)' },
  { label: 'Critical Comp Time (min)',  value: 'Critical Comp Time (min)' },
  { label: 'Controller Busy Time (min)',value: 'Controller Busy Time (min)' },
];

function attrsForDrive(driveId: number | 'all' | null, disks: DriveSummary[] | undefined): AttrOption[] {
  if (driveId === 'all' || driveId === null) return COMMON_ATTRS;
  const drive = disks?.find(d => d.driveId === driveId);
  return drive?.type === 'NVMe' ? NVME_ATTRS : ATA_ATTRS;
}

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
  const [searchParams]              = useSearchParams();

  const initialDriveId = searchParams.get('driveId');
  const [selectedDriveId, setSelectedDriveId] = useState<DriveSelection>(
    initialDriveId ? parseInt(initialDriveId, 10) : 'all',
  );
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

  // Available attributes depend on the selected drive's protocol
  const availableAttrs = attrsForDrive(selectedDriveId, disks);

  function handleDriveChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    let newId: DriveSelection;
    if (!v)           newId = null;
    else if (v === 'all') newId = 'all';
    else              newId = parseInt(v, 10);

    setSelectedDriveId(newId);

    // Reset the attribute selection if it isn't valid for the new drive type
    const newAttrs = attrsForDrive(newId, disks);
    if (!newAttrs.some(a => a.value === selectedAttr)) {
      setSelectedAttr(newAttrs[0]?.value ?? 'temperature');
    }
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

          {/* Attribute selector — filtered to the selected drive's protocol */}
          <FormSelect
            label="Attribute"
            value={selectedAttr}
            onChange={e => setSelectedAttr(e.target.value)}
            className="w-full bg-surface-100 border border-surface-300 rounded-lg px-3 py-2
                       text-sm text-gray-200 focus:outline-none focus:border-accent"
          >
            {availableAttrs.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
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
