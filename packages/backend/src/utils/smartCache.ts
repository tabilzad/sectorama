import { deriveHealth, type DriveHealth, type SmartAttribute } from '@sectorama/shared';
import type { SmartCacheRow } from '../db/schema.js';

/** The attribute list stored with a cached reading; [] when missing or corrupt. */
export function parseCachedAttributes(json: string | null | undefined): SmartAttribute[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as SmartAttribute[]) : [];
  } catch {
    return [];
  }
}

type CacheHealthRow = Pick<
  SmartCacheRow,
  'healthPassed' | 'reallocatedSectors' | 'pendingSectors' | 'uncorrectableErrors' | 'attributesJson'
>;

/** Health for a drive from its cached reading; 'unknown' when it has none yet. */
export function healthFromCache(row: CacheHealthRow | null | undefined): DriveHealth {
  if (!row) return 'unknown';
  return deriveHealth({ ...row, attributes: parseCachedAttributes(row.attributesJson) });
}
