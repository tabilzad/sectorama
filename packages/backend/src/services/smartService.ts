import { execFile } from 'child_process';
import { promisify } from 'util';
import { eq } from 'drizzle-orm';
import { Point, flux } from '@influxdata/influxdb-client';
import { getDb, getSqlite } from '../db';
import { drives, smartCache } from '../db/schema.js';
import { getWriteApi, getQueryApi } from '../db/influx.js';
import { fluxTime } from '../db/flux.js';
import { broadcast } from '../ws/liveFeed.js';
import { config } from '../config.js';
import { evaluateAndNotify } from './notifications/notificationService.js';
import { deriveHealth } from '../utils/health.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import { getSmartPollingSettings } from './settingsService.js';
import type { SmartReading, SmartAttribute, SmartUpdatedEvent } from '@sectorama/shared';
import type { DriveRow, SmartCacheRow } from '../db/schema.js';

const execFileAsync = promisify(execFile);

// ─── Smartctl JSON shapes ────────────────────────────────────────────────────

interface AtaAttribute {
  id: number;
  name: string;
  value: number;
  worst: number;
  thresh: number;
  raw: { value: number; string: string };
  when_failed: string;
}

interface SmartctlXallResult {
  smartctl?: {
    exit_status?: number;
    messages?: Array<{ string: string; severity: string }>;
  };
  smart_status?: { passed?: boolean };
  temperature?: { current?: number };
  power_on_time?: { hours?: number };
  power_cycle_count?: number;
  // Top-level NVMe endurance (same semantic as nvme_smart_health_information_log.percentage_used,
  // but present on some controllers that omit it from the health log)
  endurance_used?: { current_percent?: number };
  // SATA/SAS attributes
  ata_smart_attributes?: { table?: AtaAttribute[] };
  // NVMe health log
  nvme_smart_health_information_log?: {
    temperature?: number;
    power_on_hours?: number;
    power_cycles?: number;
    media_errors?: number;
    num_err_log_entries?: number;
    available_spare?: number;
    available_spare_threshold?: number;
    percentage_used?: number;
    controller_busy_time?: number;
    unsafe_shutdowns?: number;
    critical_warning?: number;
    data_units_read?: number;
    data_units_written?: number;
    host_reads?: number;
    host_writes?: number;
    warning_temp_time?: number;
    critical_comp_time?: number;
  };
}

// ─── Private parsing helpers ─────────────────────────────────────────────────

const SMARTCTL_TIMEOUT_MS = 30_000;

/** smartctl exit-status bit 1 (value 2): device open failed, no IDENTIFY, or device in a low-power mode. */
const SMARTCTL_EXIT_LOW_POWER = 2;

/**
 * True when smartctl declined to query the drive because it was asleep.
 * With --nocheck=standby smartctl exits with bit 1 set and reports
 * "Device is in STANDBY mode, exit(2)" (or SLEEP) in its messages. The bit
 * alone is not enough: it also covers "device open failed", which must still
 * surface as an error.
 */
export function isStandbyResult(result: SmartctlXallResult, exitCode: number | undefined): boolean {
  const status = result.smartctl?.exit_status ?? exitCode ?? 0;
  if ((status & SMARTCTL_EXIT_LOW_POWER) === 0) return false;
  const messages = result.smartctl?.messages ?? [];
  return messages.some(m => /\b(STANDBY|SLEEP|low-power)\b/i.test(m.string));
}

/** Options that apply to one SMART read. */
export interface PollOptions {
  /** Pass --nocheck=standby so a sleeping drive is skipped instead of woken. */
  skipStandby: boolean;
}

/**
 * Run smartctl --xall for one device. Resolves to the parsed JSON, or to
 * 'standby' when the drive was skipped because it is asleep.
 */
async function runSmartctlXall(devicePath: string, opts: PollOptions): Promise<SmartctlXallResult | 'standby'> {
  const args = ['--xall', '--json'];
  // --nocheck=standby makes smartctl exit before touching a drive that is in
  // SLEEP or STANDBY, so polling is never the reason a disk spins up.
  if (opts.skipStandby) args.push('--nocheck=standby');
  args.push(devicePath);

  // Use Promise.race rather than the execFile timeout option: the timeout option
  // sends SIGTERM but if smartctl is in kernel D-state (uninterruptible I/O wait
  // on a slow/unresponsive drive) SIGTERM is silently ignored and the process
  // never exits, so the promise never settles. Promise.race rejects after
  // SMARTCTL_TIMEOUT_MS regardless of what the child process does.
  const execPromise = execFileAsync('smartctl', args);

  let timer!: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`smartctl timed out after ${SMARTCTL_TIMEOUT_MS / 1000}s for ${devicePath}`)),
      SMARTCTL_TIMEOUT_MS,
    );
  });

  try {
    const { stdout } = await Promise.race([execPromise, timeoutPromise]);
    clearTimeout(timer);
    return JSON.parse(stdout) as SmartctlXallResult;
  } catch (err: unknown) {
    clearTimeout(timer);
    const e = err as { stdout?: string; stderr?: string; code?: number };

    // smartctl exits non-zero for warnings (failing attributes, standby skip)
    // and still prints its JSON; parse it before deciding what happened.
    let parsed: SmartctlXallResult | null = null;
    if (e.stdout) {
      try { parsed = JSON.parse(e.stdout) as SmartctlXallResult; } catch { /* not JSON */ }
    }
    if (parsed && opts.skipStandby && isStandbyResult(parsed, e.code)) {
      return 'standby';
    }

    console.error(
      `[smartService] smartctl ${args.join(' ')} failed: ${(err as Error).message ?? `code=${e.code ?? '?'}`}`,
      e.stderr ? `\n  stderr: ${e.stderr.trim()}` : '',
    );
    if (parsed) return parsed;
    throw err;
  }
}

function parseAtaAttributes(table: AtaAttribute[]): SmartAttribute[] {
  return table.map(a => ({
    attrId:    a.id,
    name:      a.name,
    value:     a.value,
    worst:     a.worst,
    threshold: a.thresh,
    rawValue:  a.raw.value,
    failing:   a.when_failed !== '' && a.when_failed !== '-',
  }));
}

function parseNvmeAttributes(
  log: NonNullable<SmartctlXallResult['nvme_smart_health_information_log']>,
  endurancePercent?: number,
): SmartAttribute[] {
  const attrs: SmartAttribute[] = [];
  const spareThreshold = log.available_spare_threshold ?? 10;

  function add(id: number, name: string, value: number, failing = false, threshold = 0) {
    attrs.push({ attrId: id, name, value, worst: value, threshold, rawValue: value, failing });
  }

  // Ordered to match nvme_smart_health_information_log field order for readability
  if (log.critical_warning !== undefined)
    add(1,  'Critical Warning',            log.critical_warning,         log.critical_warning !== 0);
  if (log.available_spare !== undefined)
    add(2,  'Available Spare %',           log.available_spare,          log.available_spare < spareThreshold, spareThreshold);
  // percentage_used and endurance_used.current_percent carry the same value on most controllers;
  // use the health-log field first, fall back to the top-level endurance_used.
  const pctUsed = log.percentage_used ?? endurancePercent;
  if (pctUsed !== undefined)
    add(3,  'Percentage Used',             pctUsed,                      pctUsed >= 100);
  if (log.data_units_read !== undefined)
    add(4,  'Data Units Read',             log.data_units_read);
  if (log.data_units_written !== undefined)
    add(5,  'Data Units Written',          log.data_units_written);
  if (log.host_reads !== undefined)
    add(6,  'Host Read Commands',          log.host_reads);
  if (log.host_writes !== undefined)
    add(7,  'Host Write Commands',         log.host_writes);
  if (log.media_errors !== undefined)
    add(8,  'Media Errors',               log.media_errors,             log.media_errors > 0);
  if (log.num_err_log_entries !== undefined)
    add(9,  'Error Log Entries',           log.num_err_log_entries);
  if (log.unsafe_shutdowns !== undefined)
    add(10, 'Unsafe Shutdowns',            log.unsafe_shutdowns);
  if (log.controller_busy_time !== undefined)
    add(11, 'Controller Busy Time (min)',  log.controller_busy_time);
  if (log.warning_temp_time !== undefined)
    add(12, 'Warning Temp Time (min)',     log.warning_temp_time,        log.warning_temp_time > 0);
  if (log.critical_comp_time !== undefined)
    add(13, 'Critical Comp Time (min)',    log.critical_comp_time,       log.critical_comp_time > 0);

  return attrs;
}

// ─── Private pipeline stages ─────────────────────────────────────────────────

/**
 * Stage 1: Read SMART data from the device (or return mock data). Pure I/O, no side effects.
 * Resolves to null when the drive was skipped because it is in standby.
 */
async function readSmartFromDrive(driveId: number, driveRow: DriveRow, opts: PollOptions): Promise<SmartReading | null> {
  if (config.disk.mock) {
    const base = driveRow.devicePath.endsWith('0') ? 38
               : driveRow.devicePath.endsWith('1') ? 32 : 40;
    return {
      driveId,
      timestamp:          new Date().toISOString(),
      temperature:        base + Math.round(Math.random() * 4),
      powerOnHours:       8760 + Math.floor(Math.random() * 100),
      powerCycleCount:    350 + Math.floor(Math.random() * 10),
      reallocatedSectors: 0,
      pendingSectors:     0,
      uncorrectableErrors: 0,
      healthPassed:       true,
      attributes:         [],
    };
  }

  const result = await runSmartctlXall(driveRow.devicePath, opts);
  if (result === 'standby') return null;

  const temperature     = result.temperature?.current ?? null;
  const powerOnHours    = result.power_on_time?.hours ?? null;
  const powerCycleCount = result.power_cycle_count ?? null;
  const healthPassed    = result.smart_status?.passed ?? null;

  let attributes: SmartAttribute[] = [];
  let reallocatedSectors: number | null  = null;
  let pendingSectors: number | null      = null;
  let uncorrectableErrors: number | null = null;

  const ataTable = result.ata_smart_attributes?.table;
  const nvmeLog  = result.nvme_smart_health_information_log;

  if (ataTable) {
    attributes          = parseAtaAttributes(ataTable);
    reallocatedSectors  = attributes.find(a => a.attrId === 5)?.rawValue   ?? null;
    pendingSectors      = attributes.find(a => a.attrId === 197)?.rawValue ?? null;
    uncorrectableErrors = attributes.find(a => a.attrId === 198)?.rawValue ?? null;
  } else if (nvmeLog) {
    attributes          = parseNvmeAttributes(nvmeLog, result.endurance_used?.current_percent);
    reallocatedSectors  = nvmeLog.media_errors ?? null;
    uncorrectableErrors = nvmeLog.num_err_log_entries ?? null;
  }

  return {
    driveId,
    timestamp: new Date().toISOString(),
    temperature,
    powerOnHours,
    powerCycleCount,
    reallocatedSectors,
    pendingSectors,
    uncorrectableErrors,
    healthPassed,
    attributes,
  };
}

/** Stage 2: Persist the latest reading snapshot to the SQLite cache. */
async function updateSmartCache(driveId: number, reading: SmartReading): Promise<void> {
  const db = getDb();
  const now            = reading.timestamp;
  const attributesJson = JSON.stringify(reading.attributes);
  await db.insert(smartCache)
    .values({
      driveId,
      polledAt:            now,
      temperature:         reading.temperature,
      powerOnHours:        reading.powerOnHours,
      powerCycleCount:     reading.powerCycleCount,
      reallocatedSectors:  reading.reallocatedSectors,
      pendingSectors:      reading.pendingSectors,
      uncorrectableErrors: reading.uncorrectableErrors,
      healthPassed:        reading.healthPassed,
      attributesJson,
    })
    .onConflictDoUpdate({
      target: smartCache.driveId,
      set: {
        polledAt:            now,
        temperature:         reading.temperature,
        powerOnHours:        reading.powerOnHours,
        powerCycleCount:     reading.powerCycleCount,
        reallocatedSectors:  reading.reallocatedSectors,
        pendingSectors:      reading.pendingSectors,
        uncorrectableErrors: reading.uncorrectableErrors,
        healthPassed:        reading.healthPassed,
        attributesJson,
      },
    });
}

/** Construct a SmartReading from a cache row. */
function smartCacheRowToReading(row: SmartCacheRow): SmartReading {
  let attributes: SmartAttribute[] = [];
  if (row.attributesJson) {
    try { attributes = JSON.parse(row.attributesJson) as SmartAttribute[]; } catch { /* ignore */ }
  }
  return {
    driveId:             row.driveId,
    timestamp:           row.polledAt,
    temperature:         row.temperature         ?? null,
    powerOnHours:        row.powerOnHours        ?? null,
    powerCycleCount:     row.powerCycleCount     ?? null,
    reallocatedSectors:  row.reallocatedSectors  ?? null,
    pendingSectors:      row.pendingSectors       ?? null,
    uncorrectableErrors: row.uncorrectableErrors ?? null,
    healthPassed:        row.healthPassed         ?? null,
    attributes,
  };
}

/** Stage 3: Write a reading to InfluxDB (scheduled polls only). */
async function writeSmartToInflux(driveRow: DriveRow, reading: SmartReading): Promise<void> {
  const writeApi = getWriteApi();
  const ts = new Date(reading.timestamp).getTime();

  const healthPoint = new Point('smart_readings')
    .tag('serial', driveRow.serialNumber)
    .tag('vendor', driveRow.vendor)
    .tag('model',  driveRow.model)
    .tag('device', driveRow.devicePath)
    .timestamp(ts);

  if (reading.temperature        !== null) healthPoint.floatField('temperature',         reading.temperature);
  if (reading.powerOnHours       !== null) healthPoint.intField('power_on_hours',        reading.powerOnHours);
  if (reading.powerCycleCount    !== null) healthPoint.intField('power_cycle_count',     reading.powerCycleCount);
  if (reading.reallocatedSectors !== null) healthPoint.intField('reallocated_sectors',   reading.reallocatedSectors);
  if (reading.pendingSectors     !== null) healthPoint.intField('pending_sectors',       reading.pendingSectors);
  if (reading.uncorrectableErrors !== null) healthPoint.intField('uncorrectable_errors', reading.uncorrectableErrors);
  if (reading.healthPassed       !== null) healthPoint.booleanField('health_passed',     reading.healthPassed);
  writeApi.writePoint(healthPoint);

  for (const attr of reading.attributes) {
    const attrPoint = new Point('smart_attributes')
      .tag('serial',    driveRow.serialNumber)
      .tag('attr_id',   String(attr.attrId))
      .tag('attr_name', attr.name)
      .intField('value',       attr.value)
      .intField('worst',       attr.worst)
      .intField('threshold',   attr.threshold)
      .intField('raw_value',   attr.rawValue)
      .booleanField('failing', attr.failing)
      .timestamp(ts);
    writeApi.writePoint(attrPoint);
  }

  await writeApi.flush();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read fresh SMART data from the device, evaluate alerts against the persisted
 * cache, then update the cache. Does NOT write to InfluxDB and does NOT
 * broadcast a WS event. Use this for warm-up / cache population.
 *
 * Alerts must be evaluated here too: the cache survives restarts, so a drive
 * that failed or overheated while the service was down is only ever seen as
 * a transition by this first read. Overwriting the cache without evaluating
 * would silently baseline the fault and no scheduled poll would ever report it.
 *
 * Resolves to null when the drive is unknown or was skipped because it is in standby.
 */
export async function refreshSmartForDrive(
  driveId: number,
  opts: PollOptions = getSmartPollingSettings(),
): Promise<SmartReading | null> {
  const db = getDb();
  const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId) });
  if (!driveRow) return null;

  const reading = await readSmartFromDrive(driveId, driveRow, opts);
  if (!reading) return null;
  await evaluateAndNotify(driveId, reading);   // reads old cache before update
  await updateSmartCache(driveId, reading);
  return reading;
}

/**
 * Return the last cached SmartReading for a drive from SQLite.
 * Used by the HTTP GET /smart endpoint — no smartctl invocation.
 * Returns null if the cache has not been populated yet (before warm-up).
 */
export async function getSmartReadingFromCache(driveId: number): Promise<SmartReading | null> {
  const db  = getDb();
  const row = await db.query.smartCache.findFirst({ where: eq(smartCache.driveId, driveId) });
  return row ? smartCacheRowToReading(row) : null;
}

/**
 * Build a SmartUpdatedEvent for every drive in the cache.
 * Called once after startup warm-up to seed the WS replay map so clients
 * connecting before the first scheduled poll still receive the latest data.
 */
export async function getAllCachedSmartEvents(): Promise<SmartUpdatedEvent[]> {
  const db   = getDb();
  const rows = await db.query.smartCache.findMany();
  return rows.map(row => {
    const reading = smartCacheRowToReading(row);
    const health  = deriveHealth(
      row.healthPassed,
      row.reallocatedSectors,
      row.pendingSectors,
      row.uncorrectableErrors,
    );
    return { type: 'smart_updated' as const, driveId: row.driveId, health, temperature: row.temperature ?? null, reading };
  });
}

/**
 * Full scheduled poll for one drive: read → cache → InfluxDB → broadcast.
 * Only call this from the scheduler. This is the sole writer to InfluxDB for SMART data.
 * Resolves to null when the drive is unknown or was skipped because it is in standby;
 * a skipped drive keeps its cached reading and gets no InfluxDB point for this tick.
 */
export async function scheduledSmartPoll(
  driveId: number,
  opts: PollOptions = getSmartPollingSettings(),
): Promise<SmartReading | null> {
  const db = getDb();
  const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId) });
  if (!driveRow) return null;

  const reading = await readSmartFromDrive(driveId, driveRow, opts);
  if (!reading) return null;
  await evaluateAndNotify(driveId, reading);   // reads old cache before update
  await updateSmartCache(driveId, reading);
  await writeSmartToInflux(driveRow, reading);

  const health = deriveHealth(
    reading.healthPassed,
    reading.reallocatedSectors,
    reading.pendingSectors,
    reading.uncorrectableErrors,
  );
  // Broadcast the full reading so connected clients can update without an extra HTTP round-trip
  broadcast({ type: 'smart_updated', driveId, health, temperature: reading.temperature, reading });

  return reading;
}

/**
 * Run one read per connected drive, a few drives at a time (SMART_POLL_CONCURRENCY),
 * with the standby setting read once for the whole sweep. One summary line is
 * logged instead of a line per sleeping drive.
 */
async function sweepConnectedDrives(
  label: string,
  readOne: (driveId: number, opts: PollOptions) => Promise<SmartReading | null>,
): Promise<void> {
  const db = getDb();
  const connectedDrives = await db.query.drives.findMany({
    where: eq(drives.isConnected, true),
  });
  if (connectedDrives.length === 0) return;

  const opts    = getSmartPollingSettings();
  const results = await mapWithConcurrency(connectedDrives, config.smart.pollConcurrency, drive =>
    readOne(drive.driveId, opts),
  );

  let polled = 0, standby = 0, failed = 0;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      failed += 1;
      console.error(`[smartService] ${label} failed for ${connectedDrives[i]!.devicePath}:`, r.reason);
    } else if (r.value === null) {
      standby += 1;
    } else {
      polled += 1;
    }
  });
  console.log(`[smartService] ${label}: ${polled} polled, ${standby} in standby (skipped), ${failed} failed`);
}

/**
 * Warm up the SQLite cache for all connected drives on startup.
 * Does NOT write to InfluxDB — the scheduler's first tick handles that.
 */
export async function refreshAllSmart(): Promise<void> {
  await sweepConnectedDrives('SMART cache warm-up', refreshSmartForDrive);
}

/** Run a full scheduled poll for all connected drives. */
export async function pollAllSmart(): Promise<void> {
  await sweepConnectedDrives('SMART poll', scheduledSmartPoll);
}

/** Return the cached SMART snapshot for a drive from SQLite (synchronous). */
export function getSmartCacheRow(driveId: number): SmartCacheRow | null {
  const row = getSqlite()
    .prepare<[number], SmartCacheRow>('SELECT * FROM smart_cache WHERE drive_id = ?')
    .get(driveId);
  return row ?? null;
}

/** Query the latest SMART attribute snapshot for a drive serial from InfluxDB. */
export async function getLatestSmartAttributes(serial: string): Promise<SmartAttribute[]> {
  const queryApi = getQueryApi();

  // The flux template tag renders every interpolated value as an escaped
  // literal, so nothing from the caller can alter the query structure.
  const query = flux`
    from(bucket: ${config.influx.bucket})
      |> range(start: -30d)
      |> filter(fn: (r) => r._measurement == "smart_attributes")
      |> filter(fn: (r) => r.serial == ${serial})
      |> last()
  `;

  // Collect the latest value per (attr_id, attr_name) × _field combination,
  // then assemble one SmartAttribute per unique (attr_id, attr_name) pair.
  const byAttr = new Map<string, SmartAttribute>();

  await queryApi.collectRows(query, (values, tableMeta) => {
    const obj    = tableMeta.toObject(values) as Record<string, unknown>;
    const attrId = Number(obj['attr_id'] ?? 0);
    const name   = String(obj['attr_name'] ?? '');
    const field  = String(obj['_field'] ?? '');
    const val    = Number(obj['_value'] ?? 0);

    const key = `${attrId}:${name}`;
    if (!byAttr.has(key)) {
      byAttr.set(key, { attrId, name, value: 0, worst: 0, threshold: 0, rawValue: 0, failing: false });
    }
    const entry = byAttr.get(key)!;
    switch (field) {
      case 'value':     entry.value     = val;        break;
      case 'worst':     entry.worst     = val;        break;
      case 'threshold': entry.threshold = val;        break;
      case 'raw_value': entry.rawValue  = val;        break;
      case 'failing':   entry.failing   = val !== 0;  break;
    }
    return undefined;
  });

  return Array.from(byAttr.values());
}

/** Query SMART history from InfluxDB for a given drive and attribute */
export async function getSmartHistory(
  serialNumber: string,
  attrName: string | null,
  from: string,
  to: string,
): Promise<Array<{ timestamp: string; attrId: number; name: string; value: number; rawValue: number }>> {
  const queryApi = getQueryApi();

  // These attributes are stored as top-level fields on smart_readings for ALL drive types
  // (both SATA and NVMe). Everything else lives in smart_attributes (drive-type-specific).
  const READINGS_FIELD_MAP: Record<string, string> = {
    temperature:       'temperature',
    Power_On_Hours:    'power_on_hours',
    Power_Cycle_Count: 'power_cycle_count',
  };

  const readingsField = attrName ? (READINGS_FIELD_MAP[attrName] ?? null) : 'temperature';
  const useReadings   = readingsField !== null;

  // Every caller-supplied value (time bounds, serial, attribute name) goes
  // through the flux template tag, which renders it as an escaped literal.
  // Time bounds are additionally validated by fluxTime (and by the route
  // schema) so only durations, RFC 3339 timestamps, or now() get this far.
  const selectStages = readingsField !== null
    ? flux`
      |> filter(fn: (r) => r._measurement == "smart_readings")
      |> filter(fn: (r) => r._field == ${readingsField})`
    : flux`
      |> filter(fn: (r) => r._measurement == "smart_attributes")
      |> filter(fn: (r) => r.attr_name == ${attrName ?? ''})
      |> filter(fn: (r) => r._field == "value" or r._field == "raw_value")`;

  const query = flux`
    from(bucket: ${config.influx.bucket})
      |> range(start: ${fluxTime(from)}, stop: ${fluxTime(to)})
      |> filter(fn: (r) => r.serial == ${serialNumber})
      ${selectStages}
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `;

  const rows: Array<{ timestamp: string; attrId: number; name: string; value: number; rawValue: number }> = [];
  await queryApi.collectRows(query, (values, tableMeta) => {
    const obj = tableMeta.toObject(values) as Record<string, unknown>;
    const val = useReadings
      ? Number(obj[readingsField!] ?? 0)
      : Number(obj['value'] ?? 0);
    rows.push({
      timestamp: String(obj['_time'] ?? ''),
      attrId:    Number(obj['attr_id'] ?? 0),
      name:      String(obj['attr_name'] ?? attrName ?? 'temperature'),
      value:     val,
      rawValue:  useReadings ? val : Number(obj['raw_value'] ?? 0),
    });
    return undefined;
  });
  return rows;
}
