import type { Alert, SmartReading } from '@sectorama/shared';
import type { SmartCacheRow } from '../../db/schema.js';

interface DriveInfo {
  driveId: number;
  serial: string;
  model: string;
}

/**
 * Pure function — evaluates which alerts should fire given a new SMART reading
 * compared to the previous cached state. Implements transition-only logic:
 * fires once when a condition first occurs, silent until it clears and re-triggers.
 */
export function evaluateAlerts(
  driveInfo: DriveInfo,
  newReading: SmartReading,
  oldCache: SmartCacheRow | undefined,
  temperatureThreshold: number,
): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  // smart_error: fire when health transitions from passing → failing
  if (
    newReading.healthPassed === false &&
    (oldCache?.healthPassed ?? true) === true
  ) {
    alerts.push({
      type:        'smart_error',
      driveId:     driveInfo.driveId,
      driveSerial: driveInfo.serial,
      driveModel:  driveInfo.model,
      message:     'SMART self-assessment test reported FAILURE. Drive health check failed.',
      timestamp:   now,
    });
  }

  // temperature: fire when temperature crosses above threshold
  if (
    newReading.temperature !== null &&
    newReading.temperature > temperatureThreshold &&
    (oldCache?.temperature ?? 0) <= temperatureThreshold
  ) {
    alerts.push({
      type:        'temperature',
      driveId:     driveInfo.driveId,
      driveSerial: driveInfo.serial,
      driveModel:  driveInfo.model,
      message:     `Drive temperature ${newReading.temperature}°C exceeds threshold of ${temperatureThreshold}°C.`,
      value:       newReading.temperature,
      threshold:   temperatureThreshold,
      timestamp:   now,
    });
  }

  // temperature_recovery: fire when temperature drops back to or below threshold
  if (
    newReading.temperature !== null &&
    newReading.temperature <= temperatureThreshold &&
    oldCache !== undefined &&
    oldCache.temperature !== null &&
    oldCache.temperature > temperatureThreshold
  ) {
    alerts.push({
      type:        'temperature_recovery',
      driveId:     driveInfo.driveId,
      driveSerial: driveInfo.serial,
      driveModel:  driveInfo.model,
      message:     `Drive temperature ${newReading.temperature}°C is back at or below threshold of ${temperatureThreshold}°C.`,
      value:       newReading.temperature,
      threshold:   temperatureThreshold,
      timestamp:   now,
    });
  }

  return alerts;
}
