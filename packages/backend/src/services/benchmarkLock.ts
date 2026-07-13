// ─── Global benchmark mutex ───────────────────────────────────────────────────
//
// At most one benchmark run may execute at a time on this node. Concurrent fio
// jobs contaminate each other's results even on *different* drives (shared
// HBA/expander lanes, PCIe bandwidth, CPU), and two jobs on the same drive
// invalidate both outright.
//
// Node's single-threaded event loop makes the synchronous check-and-set in
// acquireBenchmarkLock atomic — two same-tick callers cannot both acquire.

export interface ActiveBenchmark {
  runId:   number;
  driveId: number;
}

let active: ActiveBenchmark | null = null;

/** The currently-executing benchmark, or null when idle. */
export function getActiveBenchmark(): ActiveBenchmark | null {
  return active;
}

/**
 * Acquire the global benchmark lock. Throws when another run holds it.
 * Callers must release in a finally block.
 */
export function acquireBenchmarkLock(runId: number, driveId: number): void {
  if (active) {
    throw new Error(
      `Benchmark run ${active.runId} is already in progress (drive ${active.driveId})`,
    );
  }
  active = { runId, driveId };
}

/** Release the lock. No-op when this run does not hold it. */
export function releaseBenchmarkLock(runId: number): void {
  if (active?.runId === runId) active = null;
}
