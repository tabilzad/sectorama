import { schedule, validate, type ScheduledTask } from 'node-cron';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { benchmarkSchedules, drives } from '../db/schema.js';
import { createRun, executeBenchmark } from './benchmarkEngine.js';
import { getActiveBenchmark } from './benchmarkLock.js';
import { notifyBenchmarkComplete } from './notifications/notificationService.js';
import { config } from '../config.js';

// Map: scheduleId → ScheduledTask
const activeTasks = new Map<number, ScheduledTask>();

async function runSchedule(scheduleId: number, driveId: number | null, numPoints: number): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const targetDrives = driveId
    ? [{ driveId }]
    : await db.select({ driveId: drives.driveId }).from(drives).where(eq(drives.isConnected, true));

  const [sched] = await db.select({ label: benchmarkSchedules.label })
    .from(benchmarkSchedules)
    .where(eq(benchmarkSchedules.id, scheduleId));
  const scheduleLabel = sched?.label ?? null;

  for (const { driveId: did } of targetDrives) {
    // The loop awaits each run, so the lock is free between iterations; it can
    // only be held here by a manual run started mid-sweep. Skip rather than
    // create a run row that executeBenchmark would immediately mark failed.
    const active = getActiveBenchmark();
    if (active) {
      console.warn(
        `[scheduler] Skipping scheduled benchmark for drive ${did}: ` +
        `run ${active.runId} is already in progress (drive ${active.driveId})`,
      );
      continue;
    }
    try {
      const runId = await createRun(did, numPoints, 'scheduled');
      await executeBenchmark(runId);
      notifyBenchmarkComplete(runId, did, scheduleLabel)
        .catch(err => console.error('[scheduler] Benchmark notify failed:', err));
    } catch (err) {
      console.error(`[scheduler] Benchmark failed for drive ${did}:`, err);
    }
  }

  await db.update(benchmarkSchedules)
    .set({ lastRun: now })
    .where(eq(benchmarkSchedules.id, scheduleId));
}

/** Register a schedule with node-cron */
export function registerSchedule(scheduleId: number, cronExpression: string, driveId: number | null, numPoints: number): boolean {
  if (!validate(cronExpression)) {
    console.error(`[scheduler] Invalid cron expression for schedule ${scheduleId}: ${cronExpression}`);
    return false;
  }
  const existing = activeTasks.get(scheduleId);
  if (existing) existing.stop();

  const task = schedule(cronExpression, () => {
    runSchedule(scheduleId, driveId, numPoints).catch(err =>
      console.error(`[scheduler] Schedule ${scheduleId} failed:`, err),
    );
  });

  activeTasks.set(scheduleId, task);
  console.log(`[scheduler] Registered schedule ${scheduleId}: ${cronExpression}`);
  return true;
}

/** Remove a schedule */
export function unregisterSchedule(scheduleId: number): void {
  const task = activeTasks.get(scheduleId);
  if (task) {
    task.stop();
    activeTasks.delete(scheduleId);
    console.log(`[scheduler] Removed schedule ${scheduleId}`);
  }
}

/** Load all enabled schedules from DB and register cron jobs */
export async function initScheduler(): Promise<void> {
  const db = getDb();
  const schedules = await db.select().from(benchmarkSchedules).where(eq(benchmarkSchedules.enabled, true));

  for (const s of schedules) {
    registerSchedule(s.id, s.cronExpression, s.driveId ?? null, s.numPoints);
  }
  console.log(`[scheduler] Initialized ${schedules.length} schedule(s)`);
}

/** Start a periodic SMART poll for all connected drives */
export function initSmartPoller(): void {
  const intervalMinutes = config.smart.pollIntervalMinutes;

  // Use a 6-field expression (sec min hr day mon wday) with sec=30 to avoid a
  // node-cron v4 bug: getNextMatch() returns the CURRENT minute (already elapsed
  // by a few seconds) when the process starts mid-minute and second field is [0],
  // causing getDelay()=0 and an infinite immediate-heartbeat loop that floods the
  // log with "missed execution" warnings. With sec=30, availableValue([30], N)
  // for any N<30 returns 30 (a future time within the same minute), and for N>=30
  // advances to the next matching minute — both cases yield a positive delay.
  const cronExpr = intervalMinutes >= 60
    ? `30 0 */${Math.floor(intervalMinutes / 60)} * * *`
    : `30 */${intervalMinutes} * * * *`;

  schedule(cronExpr, async () => {
    try {
      const { pollAllSmart } = await import('./smartService.js');
      await pollAllSmart();
    } catch (err) {
      console.error('[scheduler] SMART poll failed:', err);
    }
  });

  console.log(`[scheduler] SMART poller scheduled every ${intervalMinutes} minute(s) (${cronExpr})`);
}
