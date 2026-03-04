// ─── Constants ────────────────────────────────────────────────────────────────

const ONE_MIB    = 1_048_576;                 //  1 MiB  — alignment boundary
const ONE_GIB    = 1_073_741_824;             //  1 GiB
const EIGHT_GIB  = 8  * ONE_GIB;             //  8 GiB  — soft cap for large drives
const MAX_REGION = 32 * ONE_GIB;             // 32 GiB  — hard cap

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiskRegion {
  /** Starting byte offset of the test region (always aligned to 1 MiB). */
  offsetBytes: number;
  /** Length of the test region in bytes. */
  sizeBytes:   number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a middle-of-disk test region for use by fio profile jobs.
 *
 * ## Why a fixed region?
 * Without a pinned working set, results depend on drive capacity: a 4 TB HDD
 * tested at offset 0 shows outer-track peak speed (~30 % higher than inner),
 * while the same drive tested over its full LBA range averages much lower.
 * Fixing the region to the middle of the disk eliminates this bias and makes
 * results comparable across devices of different capacities.
 *
 * ## Formula
 * ```
 * rawSize    = min(8 GiB, capacity × 0.05)
 * sizeBytes  = clamp(rawSize, 1 GiB, 32 GiB), further clamped to capacity
 * offsetBytes = align_down((capacity − sizeBytes) / 2, 1 MiB)
 * ```
 *
 * | Capacity | Region size | Offset (approx) |
 * |---|---|---|
 * | 200 GB   | 8 GiB       | ~96 GiB         |
 * | 500 GB   | 8 GiB       | ~246 GiB        |
 * | 2 TB     | 8 GiB       | ~1 TiB          |
 * | 20 GiB   | 1 GiB       | ~9.5 GiB        |
 * | <1 GiB   | capacity    | 0               |
 *
 * When `capacityBytes ≤ 0` (mock drives) the function returns a safe sentinel
 * `{ offsetBytes: 0, sizeBytes: ONE_GIB }` — the engine never calls fio in
 * mock mode so the values are unused.
 */
export function computeDiskRegion(capacityBytes: number): DiskRegion {
  if (capacityBytes <= 0) {
    return { offsetBytes: 0, sizeBytes: ONE_GIB };
  }

  // 5 % of capacity, bounded between 1 GiB and 32 GiB.
  const rawSize   = Math.min(EIGHT_GIB, capacityBytes * 0.05);
  const clamped   = Math.max(ONE_GIB, Math.min(MAX_REGION, rawSize));
  // Never exceed device size (guards very small test partitions / drives).
  const sizeBytes = Math.min(clamped, capacityBytes);

  // Centre of device, aligned down to the nearest 1 MiB boundary.
  const rawOffset  = (capacityBytes - sizeBytes) / 2;
  const offsetBytes = Math.floor(rawOffset / ONE_MIB) * ONE_MIB;

  return { offsetBytes, sizeBytes };
}
