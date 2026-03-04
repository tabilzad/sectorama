import { createHash, randomUUID } from 'crypto';
import type {
  CommunityReport,
  SmartAttribute,
  ProfileResult,
  BenchmarkPoint,
  EnvironmentInfo,
} from '@sectorama/shared';
import type { DriveRow, SmartCacheRow } from '../db/schema.js';

function hashSerial(serial: string): string {
  return createHash('sha256').update(serial).digest('hex').slice(0, 16);
}

export function buildCommunityReport(
  driveRow:       DriveRow,
  smartCache:     SmartCacheRow,
  smartAttrs:     SmartAttribute[],
  profileResults: ProfileResult[],
  curvePoints:    BenchmarkPoint[],
  env:            EnvironmentInfo,
): CommunityReport {
  return {
    schemaVersion: 1,
    reportId:      randomUUID(),
    reportedAt:    new Date().toISOString(),
    environment:   env,
    drive: {
      driveIdHash:         hashSerial(driveRow.serialNumber),
      vendor:              driveRow.vendor,
      model:               driveRow.model,
      firmwareRevision:    driveRow.firmwareRevision,
      capacityBytes:       driveRow.capacity,
      driveType:           driveRow.type,
      interfaceType:       driveRow.interfaceType,
      rpm:                 driveRow.rpm,
      logicalSectorBytes:  driveRow.logicalSectorSize,
      physicalSectorBytes: driveRow.physicalSectorSize,
      smart: {
            powerOnHours:        smartCache?.powerOnHours,
            powerCycleCount:     smartCache?.powerCycleCount,
            temperature:         smartCache?.temperature,
            reallocatedSectors:  smartCache?.reallocatedSectors,
            pendingSectors:      smartCache?.pendingSectors,
            uncorrectableErrors: smartCache?.uncorrectableErrors,
            healthPassed:        smartCache?.healthPassed,
            attributes:          smartAttrs,
          },
    },
    profileResults,
    positionCurve: curvePoints,
  };
}
