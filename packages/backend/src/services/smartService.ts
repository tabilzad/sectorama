import { execFile } from 'child_process';
import { promisify } from 'util';
import { eq } from 'drizzle-orm';
import { Point } from '@influxdata/influxdb-client';
import { getDb } from '../db/index.js';
import { drives, smartCache } from '../db/schema.js';
import { getWriteApi } from '../db/influx.js';
import { broadcast } from '../ws/liveFeed.js';
import { config } from '../config.js';
import type { SmartReading, SmartAttribute, DriveHealth } from '@sectorama/shared';

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
  smartctl?: { exit_status?: number };
  smart_status?: { passed?: boolean };
  temperature?: { current?: number };
  power_on_time?: { hours?: number };
  power_cycle_count?: number;
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
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runSmartctlXall(devicePath: string): Promise<SmartctlXallResult> {
  try {
    const { stdout } = await execFileAsync('smartctl', ['--xall', '--json', devicePath]);
    return JSON.parse(stdout) as SmartctlXallResult;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    console.warn(
      `[smartService] smartctl --xall --json ${devicePath} exited code=${e.code ?? '?'}`,
      e.stderr ? `\n  stderr: ${e.stderr.trim()}` : '',
    );
    if (e.stdout) {
      try { return JSON.parse(e.stdout) as SmartctlXallResult; } catch { /* ignore */ }
    }
    throw err;
  }
}

function parseAtaAttributes(table: AtaAttribute[]): SmartAttribute[] {
  return table.map(a => ({
    attrId:   a.id,
    name:     a.name,
    value:    a.value,
    worst:    a.worst,
    threshold: a.thresh,
    rawValue: a.raw.value,
    failing:  a.when_failed !== '' && a.when_failed !== '-',
  }));
}

function parseNvmeAttributes(log: NonNullable<SmartctlXallResult['nvme_smart_health_information_log']>): SmartAttribute[] {
  const attrs: SmartAttribute[] = [];
  const add = (id: number, name: string, value: number) =>
    attrs.push({ attrId: id, name, value, worst: value, threshold: 0, rawValue: value, failing: false });

  if (log.available_spare !== undefined)  add(1, 'Available Spare %', log.available_spare);
  if (log.percentage_used !== undefined)  add(2, 'Percentage Used', log.percentage_used);
  if (log.media_errors !== undefined)     add(3, 'Media Errors', log.media_errors);
  if (log.num_err_log_entries !== undefined) add(4, 'Error Log Entries', log.num_err_log_entries);
  if (log.unsafe_shutdowns !== undefined) add(5, 'Unsafe Shutdowns', log.unsafe_shutdowns);
  if (log.controller_busy_time !== undefined) add(6, 'Controller Busy Time (min)', log.controller_busy_time);
  return attrs;
}

function deriveHealth(
  passed: boolean | null | undefined,
  reallocated: number | null,
  pending: number | null,
  uncorrectable: number | null,
): DriveHealth {
  if (passed === false) return 'failed';
  if ((reallocated && reallocated > 0) || (pending && pending > 5) || (uncorrectable && uncorrectable > 0)) {
    return 'warning';
  }
  if (passed === true) return 'ok';
  return 'unknown';
}

// ─── Mock SMART data ─────────────────────────────────────────────────────────

function buildMockReading(driveId: number, devicePath: string): SmartReading {
  const base = devicePath.endsWith('0') ? 38 : devicePath.endsWith('1') ? 32 : 40;
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
    attributes: [],
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Poll SMART data for one drive and write to InfluxDB + SQLite cache */
export async function pollSmartForDrive(driveId: number): Promise<SmartReading | null> {
  const db = getDb();
  const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId) });
  if (!driveRow) return null;

  const now = new Date().toISOString();

  let reading: SmartReading;
  if (config.disk.mock) {
    reading = buildMockReading(driveId, driveRow.devicePath);
  } else {
    const result = await runSmartctlXall(driveRow.devicePath);

    // Parse temperature
    const temperature = result.temperature?.current ?? null;

    // Parse power stats
    const powerOnHours     = result.power_on_time?.hours ?? null;
    const powerCycleCount  = result.power_cycle_count ?? null;
    const healthPassed     = result.smart_status?.passed ?? null;

    // Parse attributes — SATA vs NVMe
    let attributes: SmartAttribute[] = [];
    let reallocatedSectors: number | null  = null;
    let pendingSectors: number | null      = null;
    let uncorrectableErrors: number | null = null;

    const ataTable = result.ata_smart_attributes?.table;
    const nvmeLog  = result.nvme_smart_health_information_log;

    if (ataTable) {
      attributes = parseAtaAttributes(ataTable);
      reallocatedSectors  = attributes.find(a => a.attrId === 5)?.rawValue   ?? null;
      pendingSectors      = attributes.find(a => a.attrId === 197)?.rawValue ?? null;
      uncorrectableErrors = attributes.find(a => a.attrId === 198)?.rawValue ?? null;
    } else if (nvmeLog) {
      attributes          = parseNvmeAttributes(nvmeLog);
      reallocatedSectors  = nvmeLog.media_errors ?? null;
      uncorrectableErrors = nvmeLog.num_err_log_entries ?? null;
    }

    reading = {
      driveId,
      timestamp:          now,
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

  // ── Write to InfluxDB ──────────────────────────────────────────────────────
  const writeApi = getWriteApi();
  const ts = new Date(reading.timestamp).getTime();

  const healthPoint = new Point('smart_readings')
    .tag('serial',  driveRow.serialNumber)
    .tag('vendor',  driveRow.vendor)
    .tag('model',   driveRow.model)
    .tag('device',  driveRow.devicePath)
    .timestamp(ts);

  if (reading.temperature       !== null) healthPoint.floatField('temperature',          reading.temperature);
  if (reading.powerOnHours      !== null) healthPoint.intField('power_on_hours',         reading.powerOnHours);
  if (reading.powerCycleCount   !== null) healthPoint.intField('power_cycle_count',       reading.powerCycleCount);
  if (reading.reallocatedSectors !== null) healthPoint.intField('reallocated_sectors',   reading.reallocatedSectors);
  if (reading.pendingSectors    !== null) healthPoint.intField('pending_sectors',         reading.pendingSectors);
  if (reading.uncorrectableErrors !== null) healthPoint.intField('uncorrectable_errors', reading.uncorrectableErrors);
  if (reading.healthPassed      !== null) healthPoint.booleanField('health_passed',       reading.healthPassed);
  writeApi.writePoint(healthPoint);

  for (const attr of reading.attributes) {
    const attrPoint = new Point('smart_attributes')
      .tag('serial',    driveRow.serialNumber)
      .tag('attr_id',   String(attr.attrId))
      .tag('attr_name', attr.name)
      .intField('value',      attr.value)
      .intField('worst',      attr.worst)
      .intField('threshold',  attr.threshold)
      .intField('raw_value',  attr.rawValue)
      .booleanField('failing', attr.failing)
      .timestamp(ts);
    writeApi.writePoint(attrPoint);
  }

  await writeApi.flush();

  // ── Update SQLite smart_cache ──────────────────────────────────────────────
  const db2 = getDb();
  await db2.insert(smartCache)
    .values({
      driveId:             driveId,
      polledAt:            now,
      temperature:         reading.temperature,
      powerOnHours:        reading.powerOnHours,
      powerCycleCount:     reading.powerCycleCount,
      reallocatedSectors:  reading.reallocatedSectors,
      pendingSectors:      reading.pendingSectors,
      uncorrectableErrors: reading.uncorrectableErrors,
      healthPassed:        reading.healthPassed,
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
      },
    });

  // ── Broadcast WebSocket event ──────────────────────────────────────────────
  const health = deriveHealth(
    reading.healthPassed,
    reading.reallocatedSectors,
    reading.pendingSectors,
    reading.uncorrectableErrors,
  );
  broadcast({ type: 'smart_updated', driveId, health, temperature: reading.temperature });

  return reading;
}

/** Poll SMART for all connected drives */
export async function pollAllSmart(): Promise<void> {
  const db = getDb();
  const connectedDrives = await db.query.drives.findMany({
    where: eq(drives.isConnected, true),
  });
  for (const drive of connectedDrives) {
    try {
      await pollSmartForDrive(drive.driveId);
    } catch (err) {
      console.warn(`[smartService] SMART poll failed for ${drive.devicePath}:`, err);
    }
  }
}

/** Query SMART history from InfluxDB for a given drive and attribute */
export async function getSmartHistory(
  serialNumber: string,
  attrName: string | null,
  from: string,
  to: string,
): Promise<Array<{ timestamp: string; attrId: number; name: string; value: number; rawValue: number }>> {
  const { getQueryApi } = await import('../db/influx.js');
  const queryApi = getQueryApi();

  // temperature is a field on smart_readings, not a smart_attribute row
  const isTemperature = attrName === 'temperature';
  const measurement = (attrName && !isTemperature) ? 'smart_attributes' : 'smart_readings';
  const fieldFilter  = (attrName && !isTemperature)
    ? `|> filter(fn: (r) => r.attr_name == "${attrName}")`
    : '';

  const flux = `
    from(bucket: "${config.influx.bucket}")
      |> range(start: ${from}, stop: ${to})
      |> filter(fn: (r) => r._measurement == "${measurement}")
      |> filter(fn: (r) => r.serial == "${serialNumber}")
      ${fieldFilter}
      |> filter(fn: (r) => r._field == "value" or r._field == "raw_value" or r._field == "temperature")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `;

  const rows: Array<{ timestamp: string; attrId: number; name: string; value: number; rawValue: number }> = [];
  await queryApi.collectRows(flux, (values, tableMeta) => {
    const obj = tableMeta.toObject(values) as Record<string, unknown>;
    rows.push({
      timestamp: String(obj['_time'] ?? ''),
      attrId:    Number(obj['attr_id'] ?? 0),
      name:      String(obj['attr_name'] ?? attrName ?? 'temperature'),
      value:     Number(obj['value'] ?? obj['temperature'] ?? 0),
      rawValue:  Number(obj['raw_value'] ?? 0),
    });
    return undefined;
  });
  return rows;
}
