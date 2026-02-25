import type { DriveHealth } from '@sectorama/shared';

export const PENDING_SECTORS_WARNING_THRESHOLD = 5;

export function deriveHealth(
  passed: boolean | null | undefined,
  reallocated: number | null,
  pending: number | null,
  uncorrectable: number | null,
): DriveHealth {
  if (passed === false) return 'failed';
  if (
    (reallocated && reallocated > 0) ||
    (pending && pending > PENDING_SECTORS_WARNING_THRESHOLD) ||
    (uncorrectable && uncorrectable > 0)
  ) {
    return 'warning';
  }
  if (passed === true) return 'ok';
  return 'unknown';
}
