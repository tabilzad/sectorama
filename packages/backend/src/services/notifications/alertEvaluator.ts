import type { Alert, AlertEventType, SmartAttribute, SmartReading } from '@sectorama/shared';
import type { SmartCacheRow } from '../../db/schema.js';

interface DriveInfo {
  driveId: number;
  serial: string;
  model: string;
}

/** The attribute list stored with the previous reading, or [] when there is none. */
export function cachedAttributes(oldCache: SmartCacheRow | undefined): SmartAttribute[] {
  if (!oldCache?.attributesJson) return [];
  try {
    return JSON.parse(oldCache.attributesJson) as SmartAttribute[];
  } catch {
    return [];
  }
}

/**
 * Advisory flag set by the NVMe parser's "warn" tier (wear ≥ 90 %, media
 * errors present): worth attention, not a device-declared failure. Read
 * structurally so this compiles whether or not the shared type declares it.
 */
function isAdvisory(attr: SmartAttribute | undefined): boolean {
  return (attr as (SmartAttribute & { warn?: boolean }) | undefined)?.warn === true;
}

/**
 * Counters whose growth is the strongest early-failure signal SMART offers.
 * For NVMe, uncorrectableErrors carries the media-error count.
 */
const GROWTH_COUNTERS: ReadonlyArray<{
  key:   'reallocatedSectors' | 'pendingSectors' | 'uncorrectableErrors';
  label: string;
}> = [
  { key: 'reallocatedSectors',  label: 'Reallocated sectors' },
  { key: 'pendingSectors',      label: 'Pending sectors' },
  { key: 'uncorrectableErrors', label: 'Uncorrectable errors' },
];

/**
 * Pure function — evaluates which alerts should fire given a new SMART reading
 * compared to the previous cached state. Implements transition-only logic:
 * fires once when a condition first occurs, silent until it clears and re-triggers.
 *
 * Rules:
 *   smart_error          overall SMART status flips passing → failing
 *   smart_attribute      a growth counter increases (or is first seen non-zero),
 *                        an attribute starts reporting failure, or an advisory
 *                        attribute starts needing attention
 *   temperature          crosses above the threshold
 *   temperature_recovery drops back to or below it
 */
export function evaluateAlerts(
  driveInfo: DriveInfo,
  newReading: SmartReading,
  oldCache: SmartCacheRow | undefined,
  temperatureThreshold: number,
): Alert[] {
  const alerts: Alert[] = [];
  const now  = new Date().toISOString();
  const base = {
    driveId:     driveInfo.driveId,
    driveSerial: driveInfo.serial,
    driveModel:  driveInfo.model,
    timestamp:   now,
  };
  const fire = (type: AlertEventType, message: string, extra: Partial<Alert> = {}) =>
    alerts.push({ type, ...base, message, ...extra });

  // ── smart_error: overall status passing → failing ───────────────────────
  if (newReading.healthPassed === false && (oldCache?.healthPassed ?? true) === true) {
    fire('smart_error', 'SMART self-assessment test reported FAILURE. Drive health check failed.');
  }

  // ── smart_attribute: growth counters ────────────────────────────────────
  for (const { key, label } of GROWTH_COUNTERS) {
    const current = newReading[key];
    if (current === null || current <= 0) continue;
    const previous = oldCache?.[key] ?? null;
    if (previous === null) {
      // First reading for this drive, or first since the counter was recorded:
      // a non-zero value is worth one notice even without a baseline.
      fire('smart_attribute', `${label}: ${current} (no earlier reading to compare against).`, {
        attribute: label, value: current, previousValue: 0,
      });
    } else if (current > previous) {
      fire('smart_attribute', `${label} increased from ${previous} to ${current}.`, {
        attribute: label, value: current, previousValue: previous,
      });
    }
  }

  // ── smart_attribute: per-attribute failure and advisory flags ───────────
  // Covers ATA when_failed, NVMe Critical Warning bits and Available Spare
  // below its threshold (failing), and the advisory tier such as NVMe
  // Percentage Used ≥ 90 % (warn).
  const previousAttrs = new Map(cachedAttributes(oldCache).map(a => [`${a.attrId}:${a.name}`, a]));
  for (const attr of newReading.attributes) {
    const prev = previousAttrs.get(`${attr.attrId}:${attr.name}`);
    if (attr.failing && !(prev?.failing ?? false)) {
      fire('smart_attribute',
        `${attr.name} is reporting failure (value ${attr.value}, threshold ${attr.threshold}, raw ${attr.rawValue}).`,
        { attribute: attr.name, value: attr.rawValue, threshold: attr.threshold, previousValue: prev?.rawValue },
      );
    } else if (isAdvisory(attr) && !isAdvisory(prev)) {
      fire('smart_attribute', `${attr.name} needs attention (raw value ${attr.rawValue}).`, {
        attribute: attr.name, value: attr.rawValue, previousValue: prev?.rawValue,
      });
    }
  }

  // ── temperature: crosses above threshold ────────────────────────────────
  if (
    newReading.temperature !== null &&
    newReading.temperature > temperatureThreshold &&
    (oldCache?.temperature ?? 0) <= temperatureThreshold
  ) {
    fire('temperature',
      `Drive temperature ${newReading.temperature}°C exceeds threshold of ${temperatureThreshold}°C.`,
      { value: newReading.temperature, threshold: temperatureThreshold },
    );
  }

  // ── temperature_recovery: back to or below threshold ────────────────────
  if (
    newReading.temperature !== null &&
    newReading.temperature <= temperatureThreshold &&
    oldCache !== undefined &&
    oldCache.temperature !== null &&
    oldCache.temperature > temperatureThreshold
  ) {
    fire('temperature_recovery',
      `Drive temperature ${newReading.temperature}°C is back at or below threshold of ${temperatureThreshold}°C.`,
      { value: newReading.temperature, threshold: temperatureThreshold },
    );
  }

  return alerts;
}
