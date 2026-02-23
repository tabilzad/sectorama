// ─── Utility ────────────────────────────────────────────────────────────────

/** Formats a byte count as a human-readable string (e.g. "2 TB") */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/** Formats bytes/sec as MB/s string */
export function formatSpeed(bytesPerSec: number, decimals = 2): string {
  return `${(bytesPerSec / 1_000_000).toFixed(decimals)} MB/s`;
}

// ─── Drive registry ──────────────────────────────────────────────────────────

export type DriveType = 'HDD' | 'SSD' | 'NVMe' | 'Unknown';
export type DriveHealth = 'ok' | 'warning' | 'failed' | 'unknown';

export interface Drive {
  driveId: number;
  serialNumber: string;
  devicePath: string;
  vendor: string;
  model: string;
  firmwareRevision: string;
  capacity: number;            // bytes
  type: DriveType;
  rpm: number | null;
  interfaceType: string | null;
  logicalSectorSize: number | null;
  physicalSectorSize: number | null;
  firstSeen: string;           // ISO 8601
  lastSeen: string;            // ISO 8601
  isConnected: boolean;
}

export interface DriveSummary {
  driveId: number;
  serialNumber: string;
  devicePath: string;
  vendor: string;
  model: string;
  capacity: number;
  type: DriveType;
  isConnected: boolean;
  health: DriveHealth;
  temperature: number | null;
  lastSmartPoll: string | null;        // ISO 8601
  lastBenchmarkRun: string | null;     // ISO 8601
}

// ─── SMART ───────────────────────────────────────────────────────────────────

export interface SmartAttribute {
  attrId: number;
  name: string;
  value: number;
  worst: number;
  threshold: number;
  rawValue: number;
  failing: boolean;
}

export interface SmartReading {
  driveId: number;
  timestamp: string;           // ISO 8601
  temperature: number | null;
  powerOnHours: number | null;
  powerCycleCount: number | null;
  reallocatedSectors: number | null;
  pendingSectors: number | null;
  uncorrectableErrors: number | null;
  healthPassed: boolean | null;
  attributes: SmartAttribute[];
}

export interface SmartAttributeHistory {
  attrId: number;
  name: string;
  points: Array<{ timestamp: string; value: number; rawValue: number }>;
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

export type BenchmarkStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TriggerType = 'manual' | 'scheduled';

export interface BenchmarkRun {
  runId: number;
  driveId: number;
  startedAt: string;           // ISO 8601
  completedAt: string | null;  // ISO 8601
  status: BenchmarkStatus;
  triggerType: TriggerType;
  numPoints: number;
  errorMessage: string | null;
}

export interface BenchmarkPoint {
  position: number;            // byte offset on disk
  speedBps: number;            // bytes/second
}

// ─── fio profile results ─────────────────────────────────────────────────────

/** Identifier for each fio benchmark profile. */
export type BenchmarkProfile = 'seq_read' | 'rand_read_4k' | 'latency';

/** Aggregated metrics produced by a single fio profile run. */
export interface ProfileResult {
  profile:   BenchmarkProfile;
  bwBps:     number;   // bytes/second
  iops:      number;
  latMeanNs: number;   // nanoseconds
  latP50Ns:  number;
  latP95Ns:  number;
  latP99Ns:  number;
  latP999Ns: number;
}

export interface BenchmarkRunDetail extends BenchmarkRun {
  points:         BenchmarkPoint[];
  profileResults: ProfileResult[];
}

// ─── Speed curve chart ───────────────────────────────────────────────────────

/** One benchmark run (for SpeedCurveChart) */
export interface SpeedPoint {
  spot: number;    // byte offset
  speed: number;   // bytes/second
}

export interface BenchmarkSeries {
  runId:          number;
  startedAt:      string;
  points:         SpeedPoint[];
  profileResults: ProfileResult[];
}

// ─── Schedules ───────────────────────────────────────────────────────────────

export interface BenchmarkSchedule {
  id: number;
  driveId: number | null;      // null = all drives
  cronExpression: string;
  enabled: boolean;
  numPoints: number;
  lastRun: string | null;      // ISO 8601
  nextRun: string | null;      // ISO 8601
  createdAt: string;           // ISO 8601
}

// ─── System stats ────────────────────────────────────────────────────────────

export interface SystemStats {
  totalDrives: number;
  connectedDrives: number;
  healthyDrives: number;
  warningDrives: number;
  failedDrives: number;
  totalBenchmarkRuns: number;
  lastScanTime: string | null;  // ISO 8601
}

// ─── WebSocket live-feed ─────────────────────────────────────────────────────

export interface DiskDetectedEvent {
  type: 'disk_detected';
  drive: DriveSummary;
}

export interface DiskRemovedEvent {
  type: 'disk_removed';
  driveId: number;
}

export interface SmartUpdatedEvent {
  type: 'smart_updated';
  driveId: number;
  health: DriveHealth;
  temperature: number | null;
  /** Full reading pushed with the event so the frontend can skip an HTTP round-trip. */
  reading: SmartReading;
}

export interface BenchmarkStartedEvent {
  type: 'benchmark_started';
  runId: number;
  driveId: number;
  numPoints: number;
}

export interface BenchmarkProgressEvent {
  type: 'benchmark_progress';
  runId: number;
  pointIndex: number;
  totalPoints: number;
  speedBps: number;
  /** Which phase is running: position-curve sampling or fio profile jobs. */
  phase?: 'curve' | 'profiles';
  /** Human-readable label for the current profile (only set when phase='profiles'). */
  phaseLabel?: string;
}

export interface BenchmarkCompletedEvent {
  type: 'benchmark_completed';
  runId: number;
  driveId: number;
}

export interface BenchmarkFailedEvent {
  type: 'benchmark_failed';
  runId: number;
  error: string;
}

export interface ConnectedEvent {
  type: 'connected';
  clientCount: number;
}

export type LiveFeedEvent =
  | DiskDetectedEvent
  | DiskRemovedEvent
  | SmartUpdatedEvent
  | BenchmarkStartedEvent
  | BenchmarkProgressEvent
  | BenchmarkCompletedEvent
  | BenchmarkFailedEvent
  | ConnectedEvent;
