import { schedule, validate, type ScheduledTask } from 'node-cron';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { benchmarkSchedules, drives } from '../db/schema.js';
import { createRun, executeBenchmark } from './benchmarkEngine.js';
import { config } from '../config.js';

// Map: scheduleId → ScheduledTask
const activeTasks = new Map<number, ScheduledTask>();

async function runSchedule(scheduleId: number, driveId: number | null, numPoints: number): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const targetDrives = driveId
    ? [{ driveId }]
    : await db.select({ driveId: drives.driveId }).from(drives).where(eq(drives.isConnected, true));

  for (const { driveId: did } of targetDrives) {
    try {
      const runId = await createRun(did, numPoints, 'scheduled');
      executeBenchmark(runId).catch(err =>
        console.warn(`[scheduler] Benchmark run ${runId} failed:`, err),
      );
    } catch (err) {
      console.warn(`[scheduler] Could not create run for drive ${did}:`, err);
    }
  }

  await db.update(benchmarkSchedules)
    .set({ lastRun: now })
    .where(eq(benchmarkSchedules.id, scheduleId));
}

/** Register a schedule with node-cron */
export function registerSchedule(scheduleId: number, cronExpression: string, driveId: number | null, numPoints: number): boolean {
  if (!validate(cronExpression)) {
    console.warn(`[scheduler] Invalid cron expression for schedule ${scheduleId}: ${cronExpression}`);
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
  // node-cron doesn't allow "every N minutes" unless it divides 60; use * for short intervals
  const cronExpr = intervalMinutes >= 60
    ? `0 */${Math.floor(intervalMinutes / 60)} * * *`
    : `*/${intervalMinutes} * * * *`;

  schedule(cronExpr, async () => {
    try {
      const { pollAllSmart } = await import('./smartService.js');
      await pollAllSmart();
    } catch (err) {
      console.warn('[scheduler] SMART poll failed:', err);
    }
  });

  console.log(`[scheduler] SMART poller scheduled every ${intervalMinutes} minute(s) (${cronExpr})`);
}
