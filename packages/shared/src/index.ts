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
export const DASHBOARD_PRESETS = ['custom', 'capacity', 'capacity_asc', 'temperature', 'temperature_asc'] as const;
export type DashboardPreset = typeof DASHBOARD_PRESETS[number];

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
    customLabel: string | null;          // null = use vendor+model
}

// ─── SMART ───────────────────────────────────────────────────────────────────

export interface SmartAttribute {
    attrId: number;
    name: string;
    value: number;
    worst: number;
    threshold: number;
    rawValue: number;
    /** Device-declared failure (ATA when_failed; NVMe critical_warning / spare below threshold). */
    failing: boolean;
    /**
     * Advisory only — worth attention but NOT a failure (e.g. NVMe endurance
     * ≥ 90 % used, media errors present). Rendered amber, never red.
     */
    warn?: boolean;
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

// ─── Drive health ─────────────────────────────────────────────────────────────

/** Pending sectors above this count turn a drive's health to 'warning'. */
export const PENDING_SECTORS_WARNING_THRESHOLD = 5;

/** The fields health is derived from; satisfied by a SmartReading and by a SMART cache row. */
export interface HealthSignals {
    healthPassed: boolean | null | undefined;
    reallocatedSectors: number | null | undefined;
    pendingSectors: number | null | undefined;
    uncorrectableErrors: number | null | undefined;
    attributes?: ReadonlyArray<Pick<SmartAttribute, 'failing' | 'warn'>> | null;
}

/**
 * The single health rule, shared by the drive list, the live-feed events, the
 * stats counters and the drive page so they can never disagree.
 *
 *   failed   the device's overall SMART self-assessment is FAILED
 *   warning  the device still passes but something deserves attention: a
 *            growth counter above its threshold, an attribute the device flags
 *            as failing (e.g. ATA "in the past"), or an advisory attribute
 *            (NVMe wear ≥ 90 %, media errors)
 *   ok       passes with nothing raised
 *   unknown  no reading yet
 */
export function deriveHealth(s: HealthSignals): DriveHealth {
    if (s.healthPassed === false) return 'failed';
    const counters =
        (s.reallocatedSectors ?? 0) > 0 ||
        (s.pendingSectors ?? 0) > PENDING_SECTORS_WARNING_THRESHOLD ||
        (s.uncorrectableErrors ?? 0) > 0;
    const flagged = s.attributes?.some(a => a.failing || a.warn === true) ?? false;
    if (counters || flagged) return 'warning';
    if (s.healthPassed === true) return 'ok';
    return 'unknown';
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

/**
 * Identifier for each fio benchmark profile.
 * Four profiles run uniformly across all drive types so results are directly
 * comparable in the public database regardless of drive class.
 *
 *   seq_1m_qd1  — single-stream sequential throughput (typical desktop / NAS use)
 *   seq_1m_qd32 — deep-queue sequential throughput (saturates NVMe PCIe bandwidth)
 *   rnd_4k_qd1  — QD 1 random read (latency-sensitive baseline; "desktop IOPS")
 *   rnd_4k_qd32 — QD 32 random read (peak IOPS; matches CrystalDiskMark Q32T1)
 */
export type BenchmarkProfile = 'seq_1m_qd1' | 'seq_1m_qd32' | 'rnd_4k_qd1' | 'rnd_4k_qd32';

/** Aggregated metrics produced by a single fio profile run. */
export interface ProfileResult {
    profile: BenchmarkProfile;
    bwBps: number;   // bytes/second
    iops: number;
    latMeanNs: number;   // nanoseconds
    latP50Ns: number;
    latP95Ns: number;
    latP99Ns: number;
    latP999Ns: number;
}

export interface BenchmarkRunDetail extends BenchmarkRun {
    points: BenchmarkPoint[];
    profileResults: ProfileResult[];
}

// ─── Speed curve chart ───────────────────────────────────────────────────────

/** One benchmark run (for SpeedCurveChart) */
export interface SpeedPoint {
    spot: number;    // byte offset
    speed: number;   // bytes/second
}

export interface BenchmarkSeries {
    runId: number;
    startedAt: string;
    points: SpeedPoint[];
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
    label: string | null;
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

// ─── Notifications ───────────────────────────────────────────────────────────

/**
 * Subscribable alert families:
 *   smart_error        — SMART overall self-assessment flips to FAILED
 *   smart_attribute    — a predictive counter grows (reallocated / pending / uncorrectable)
 *                        or an attribute starts reporting failure or needs attention
 *   temperature        — above threshold, and the recovery below it
 *   drive_missing      — a registered drive disappears from the host, and its return
 *   benchmark_complete — scheduled benchmark reports
 */
export const ALERT_TYPES = ['smart_error', 'smart_attribute', 'temperature', 'drive_missing', 'benchmark_complete'] as const;
export type AlertType = typeof ALERT_TYPES[number];
/** Superset of AlertType — includes derived events that share a parent subscription. */
export type AlertEventType = AlertType | 'temperature_recovery' | 'drive_returned';
export const CHANNEL_TYPES = ['webhook', 'slack'] as const;
export type ChannelType = typeof CHANNEL_TYPES[number];

export interface WebhookChannelConfig {
    url: string;
    auth:
        | { type: 'none' }
        | { type: 'basic'; username: string; password: string }
        | { type: 'bearer'; token: string };
}

export interface SlackChannelConfig {
    webhookUrl: string;
}

export interface NotificationChannel {
    id: number;
    name: string;
    type: ChannelType;
    config: WebhookChannelConfig | SlackChannelConfig;
    enabled: boolean;
    createdAt: string;
}

export interface NotificationSubscription {
    id: number;
    channelId: number;
    alertType: AlertType;
}

export interface DriveAlertThreshold {
    driveId: number;
    /** Warm→Hot boundary. Also the temperature at which an alert fires. */
    temperatureThresholdCelsius: number;
    /** Cold→Normal boundary (null = use default 25°C) */
    tempNormalCelsius: number | null;
    /** Normal→Warm boundary (null = use default 45°C) */
    tempWarmCelsius: number | null;
    /** Hot→Too Hot boundary (null = use default 65°C) */
    tempTooHotCelsius: number | null;
}

export interface Alert {
    type: AlertEventType;
    driveId: number;
    driveSerial: string;
    driveModel: string;
    message: string;
    value?: number;
    threshold?: number;
    /** smart_attribute alerts: the counter or attribute that changed. */
    attribute?: string;
    /** smart_attribute alerts: the value seen at the previous poll. */
    previousValue?: number;
    timestamp: string;
}

export type AlertDeliveryStatus = 'pending' | 'sent' | 'failed';

export interface AlertDeliverySummary {
    channelId: number;
    channelName: string;
    status: AlertDeliveryStatus;
    attempts: number;
    lastError: string | null;
    sentAt: string | null;
    nextAttemptAt: string | null;
}

/** One fired alert with the delivery state per subscribed channel. */
export interface AlertHistoryEntry {
    id: number;
    type: AlertEventType;
    driveId: number | null;      // null once the drive has been removed from the registry
    driveSerial: string;
    driveModel: string;
    message: string;
    value: number | null;
    threshold: number | null;
    attribute: string | null;
    previousValue: number | null;
    createdAt: string;           // ISO 8601
    deliveries: AlertDeliverySummary[];
}

export interface BenchmarkCompletePayload {
    event: 'benchmark_complete';
    timestamp: string;              // ISO 8601 — when notification was sent
    scheduleLabel: string | null;
    run: {
        id: number;
        startedAt: string;
        completedAt: string;
        durationSeconds: number;
        status: 'completed' | 'failed';
        errorMessage: string | null;
        numPoints: number;
    };
    drive: {
        id: number;
        vendor: string;
        model: string;
        serialNumber: string;
        capacityGb: number;
        type: string;
    };
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

// ─── Web Push ─────────────────────────────────────────────────────────────────

export interface PushSubscriptionPayload {
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

// ─── Community reporting ──────────────────────────────────────────────────────

export interface EnvironmentInfo {
    osType: string;   // os.type()   e.g. 'Linux'
    osRelease: string;   // os.release() e.g. '6.1.0-28-amd64'
    osArch: string;   // os.arch()   e.g. 'x64'
    fioVersion: string;   // 'fio-3.36' or 'unknown'
    appVersion: string;   // APP_VERSION env or 'dev'
    ramTotalBytes: number;   // os.totalmem()
    swapTotalBytes: number;   // from /proc/swaps (0 on Windows/macOS)
    swapActive: boolean;
}

export interface CommunityReport {
    schemaVersion: 1;
    reportId: string;       // random UUID — no user linkage
    reportedAt: string;       // ISO 8601
    environment: EnvironmentInfo;
    drive: {
        driveIdHash: string;          // SHA-256(serial).slice(0,16)
        vendor: string;
        model: string;
        firmwareRevision: string;
        capacityBytes: number;
        driveType: string;
        interfaceType: string | null;
        rpm: number | null;
        logicalSectorBytes: number | null;
        physicalSectorBytes: number | null;
        smart: {
            powerOnHours: number | null | undefined;
            powerCycleCount: number | null | undefined;
            temperature: number | null | undefined;
            reallocatedSectors: number | null | undefined;
            pendingSectors: number | null | undefined;
            uncorrectableErrors: number | null | undefined;
            healthPassed: boolean | null | undefined;
            attributes: SmartAttribute[];
        } | null;
    };
    profileResults: ProfileResult[];
    positionCurve: BenchmarkPoint[];
}

// ─── Storage overview ─────────────────────────────────────────────────────────

/** Where filesystem usage figures came from. */
export type StorageUsageSource = 'unraid' | 'linux' | 'mock' | 'none';

export interface StorageClassSummary {
    type: DriveType;
    /** Registered drives of this type that are currently connected. */
    driveCount: number;
    /** Sum of raw device capacity for those drives (bytes). */
    rawCapacityBytes: number;
    /** Mounted filesystems attributed to this drive type; 0 when nothing was measured. */
    filesystemCount: number;
    /** Filesystem totals in bytes, summed over attributed filesystems; null when none measured. */
    fsTotalBytes: number | null;
    fsUsedBytes: number | null;
    fsFreeBytes: number | null;
}

/** Filesystems whose backing drive type could not be determined (e.g. pools without sysfs slaves). */
export interface UnattributedStorage {
    filesystemCount: number;
    fsTotalBytes: number;
    fsUsedBytes: number;
    fsFreeBytes: number;
}

export interface StorageOverview {
    generatedAt: string;             // ISO 8601
    usageSource: StorageUsageSource;
    classes: StorageClassSummary[];  // HDD, SSD, NVMe, Unknown — only types that have drives or filesystems
    unattributed: UnattributedStorage | null;
}

// ─── Runtime settings ─────────────────────────────────────────────────────────
// Tuning knobs that can be changed from the Settings page. Each has a built-in
// default; some can also be pinned by an environment variable, in which case
// the UI shows them read-only.

/**
 * Poll intervals offered in the UI. Values below 60 must divide an hour so
 * the cron expression ticks evenly; values of 60 and above are whole hours.
 */
export const SMART_POLL_INTERVAL_CHOICES = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440] as const;

export const SMART_POLL_CONCURRENCY_MAX = 16;

export interface SmartPollingSettings {
    /**
     * Skip drives that are in standby or sleep so a poll never spins them up.
     * Their cached reading is kept until they wake. Default: true.
     */
    skipStandby: boolean;
    /** Minutes between scheduled SMART polls. Default: 5. */
    intervalMinutes: number;
    /** Drives queried at the same time during a poll sweep. Default: 4. */
    concurrency: number;
}

export interface BenchmarkSettings {
    /** Positions sampled per run when a request or schedule does not say otherwise. Default: 11. */
    defaultNumPoints: number;
}

/**
 * Temperature zones for drives without a per-drive override, in °C.
 * `alertCelsius` is the temperature alert threshold; the others only colour
 * the charts and cards.
 */
export interface TemperatureDefaults {
    normalCelsius: number;   // Cold → Normal
    warmCelsius: number;     // Normal → Warm
    alertCelsius: number;    // Warm → Hot, and the alert threshold
    tooHotCelsius: number;   // Hot → Too Hot
}

export interface RuntimeSettings {
    smartPolling: SmartPollingSettings;
    benchmark: BenchmarkSettings;
    temperature: TemperatureDefaults;
}

/** Built-in defaults, shared so the UI can render sensibly before the server answers. */
export const RUNTIME_SETTINGS_DEFAULTS: RuntimeSettings = {
    smartPolling: { skipStandby: true, intervalMinutes: 5, concurrency: 4 },
    benchmark:    { defaultNumPoints: 11 },
    temperature:  { normalCelsius: 25, warmCelsius: 40, alertCelsius: 50, tooHotCelsius: 60 },
};

export type RuntimeSettingPath =
    | 'smartPolling.skipStandby'
    | 'smartPolling.intervalMinutes'
    | 'smartPolling.concurrency'
    | 'benchmark.defaultNumPoints'
    | 'temperature.normalCelsius'
    | 'temperature.warmCelsius'
    | 'temperature.alertCelsius'
    | 'temperature.tooHotCelsius';

export interface RuntimeSettingsResponse {
    /** Effective values: environment variable, then saved value, then default. */
    settings: RuntimeSettings;
    /** Built-in defaults, so the UI can show them and offer a reset. */
    defaults: RuntimeSettings;
    /** Fields pinned by an environment variable, with the variable's name. Shown read-only in the UI. */
    managedByEnv: Partial<Record<RuntimeSettingPath, string>>;
}

/** Partial update: only the sections and fields present are changed. */
export type RuntimeSettingsUpdate = {
    [S in keyof RuntimeSettings]?: Partial<RuntimeSettings[S]>;
};
