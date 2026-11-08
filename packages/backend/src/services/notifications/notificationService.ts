import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import { getDb } from '../../db';
import {
  drives,
  benchmarkRuns,
  smartCache,
  notificationChannels,
  notificationSubscriptions,
  driveAlertThresholds,
  alertEvents,
  alertDeliveries,
} from '../../db/schema.js';
import { getRuntimeSettings } from '../settingsService.js';
import { evaluateAlerts } from './alertEvaluator.js';
import { createChannel } from './channelFactory.js';
import { sendPushToAll } from '../pushService.js';
import type { AlertEventRow, DriveRow } from '../../db/schema.js';
import type {
  Alert,
  AlertDeliveryStatus,
  AlertDeliverySummary,
  AlertEventType,
  AlertHistoryEntry,
  AlertType,
  BenchmarkCompletePayload,
  ChannelType,
  SmartReading,
} from '@sectorama/shared';

// ─── Subscription mapping ─────────────────────────────────────────────────────

/** Derived events ride on their parent subscription: the all-clear goes wherever the alarm went. */
export function parentAlertType(type: AlertEventType): AlertType {
  if (type === 'temperature_recovery') return 'temperature';
  if (type === 'drive_returned')       return 'drive_missing';
  return type;
}

// ─── Delivery pipeline ────────────────────────────────────────────────────────
//
// Alerts are transition-only, so a delivery that fails is not re-triggered by
// the next poll. Every alert is therefore recorded first, then one delivery row
// is queued per subscribed channel and retried with backoff until it is sent
// or the retry budget is exhausted.

/** Delay before the next retry, indexed by the number of failed attempts so far. */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
export const MAX_DELIVERY_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

interface DeliveryTarget {
  deliveryId:    number;
  channelId:     number;
  channelType:   ChannelType;
  channelConfig: string;   // JSON as stored
  attempts:      number;   // attempts made so far
}

async function attemptDelivery(target: DeliveryTarget, alert: Alert, now: Date): Promise<AlertDeliveryStatus> {
  const db       = getDb();
  const attempts = target.attempts + 1;
  try {
    const channel = createChannel(target.channelType, JSON.parse(target.channelConfig));
    await channel.send(alert);
    await db.update(alertDeliveries)
      .set({ status: 'sent', attempts, sentAt: now.toISOString(), lastError: null, nextAttemptAt: null })
      .where(eq(alertDeliveries.id, target.deliveryId));
    return 'sent';
  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);
    const delay     = RETRY_DELAYS_MS[attempts - 1];
    if (delay === undefined) {
      await db.update(alertDeliveries)
        .set({ status: 'failed', attempts, lastError, nextAttemptAt: null })
        .where(eq(alertDeliveries.id, target.deliveryId));
      console.error(
        `[notifications] Giving up on ${alert.type} alert via channel ${target.channelId} after ${attempts} attempts: ${lastError}`,
      );
      return 'failed';
    }
    const nextAttemptAt = new Date(now.getTime() + delay).toISOString();
    await db.update(alertDeliveries)
      .set({ status: 'pending', attempts, lastError, nextAttemptAt })
      .where(eq(alertDeliveries.id, target.deliveryId));
    console.warn(
      `[notifications] ${alert.type} alert via channel ${target.channelId} failed ` +
      `(attempt ${attempts}/${MAX_DELIVERY_ATTEMPTS}), retrying at ${nextAttemptAt}: ${lastError}`,
    );
    return 'pending';
  }
}

/** Browser push has its own delivery semantics (the push service retries), so it stays fire-and-forget. */
function pushToBrowsers(alert: Alert): void {
  const allClear = alert.type === 'temperature_recovery' || alert.type === 'drive_returned';
  sendPushToAll({
    title: `${allClear ? '✅' : '⚠️'} ${alert.driveModel}`,
    body:  alert.message,
    url:   `/drives/${alert.driveId}`,
    tag:   `alert-${alert.driveId}`,
  }).catch(err => console.error('[push] batch send failed:', err));
}

export interface DispatchOptions {
  /** Deliver to this channel only (used for the catch-up run when a channel or subscription is added). */
  onlyChannelId?: number;
  /** Injectable clock for tests. */
  now?: Date;
}

/**
 * Record an alert in the history and deliver it to every enabled channel
 * subscribed to its family. Each delivery is attempted once immediately;
 * failures are left pending for the retry worker. Resolves to the alert id.
 */
export async function recordAndDispatch(alert: Alert, opts: DispatchOptions = {}): Promise<number> {
  const db  = getDb();
  const now = opts.now ?? new Date();

  const [{ id: alertId }] = await db.insert(alertEvents).values({
    type:          alert.type,
    driveId:       alert.driveId,
    driveSerial:   alert.driveSerial,
    driveModel:    alert.driveModel,
    message:       alert.message,
    value:         alert.value         ?? null,
    threshold:     alert.threshold     ?? null,
    attribute:     alert.attribute     ?? null,
    previousValue: alert.previousValue ?? null,
    createdAt:     alert.timestamp,
  }).returning({ id: alertEvents.id });

  const subs = await db
    .select({
      channelId: notificationSubscriptions.channelId,
      type:      notificationChannels.type,
      config:    notificationChannels.config,
      enabled:   notificationChannels.enabled,
    })
    .from(notificationSubscriptions)
    .innerJoin(notificationChannels, eq(notificationSubscriptions.channelId, notificationChannels.id))
    .where(eq(notificationSubscriptions.alertType, parentAlertType(alert.type)));

  for (const sub of subs) {
    if (!sub.enabled) continue;
    if (opts.onlyChannelId !== undefined && sub.channelId !== opts.onlyChannelId) continue;

    const [{ id: deliveryId }] = await db.insert(alertDeliveries).values({
      alertId,
      channelId:     sub.channelId,
      status:        'pending',
      attempts:      0,
      nextAttemptAt: now.toISOString(),
    }).returning({ id: alertDeliveries.id });

    await attemptDelivery(
      { deliveryId, channelId: sub.channelId, channelType: sub.type as ChannelType, channelConfig: sub.config, attempts: 0 },
      alert,
      now,
    );
  }

  if (opts.onlyChannelId === undefined) pushToBrowsers(alert);
  return alertId;
}

function rowToAlert(row: AlertEventRow): Alert {
  return {
    type:          row.type as AlertEventType,
    driveId:       row.driveId ?? 0,
    driveSerial:   row.driveSerial,
    driveModel:    row.driveModel,
    message:       row.message,
    value:         row.value         ?? undefined,
    threshold:     row.threshold     ?? undefined,
    attribute:     row.attribute     ?? undefined,
    previousValue: row.previousValue ?? undefined,
    timestamp:     row.createdAt,
  };
}

/**
 * Retry every pending delivery whose next attempt is due. Returns how many
 * were processed. Called by the delivery worker and at startup, so deliveries
 * left pending by a previous process are picked up again.
 */
export async function processDueDeliveries(now: Date = new Date()): Promise<number> {
  const db  = getDb();
  const due = await db
    .select({
      deliveryId:     alertDeliveries.id,
      channelId:      alertDeliveries.channelId,
      attempts:       alertDeliveries.attempts,
      channelType:    notificationChannels.type,
      channelConfig:  notificationChannels.config,
      channelEnabled: notificationChannels.enabled,
      alert:          alertEvents,
    })
    .from(alertDeliveries)
    .innerJoin(alertEvents, eq(alertDeliveries.alertId, alertEvents.id))
    .innerJoin(notificationChannels, eq(alertDeliveries.channelId, notificationChannels.id))
    .where(and(eq(alertDeliveries.status, 'pending'), lte(alertDeliveries.nextAttemptAt, now.toISOString())));

  for (const row of due) {
    if (!row.channelEnabled) {
      await db.update(alertDeliveries)
        .set({ status: 'failed', lastError: 'Channel disabled', nextAttemptAt: null })
        .where(eq(alertDeliveries.id, row.deliveryId));
      continue;
    }
    await attemptDelivery(
      {
        deliveryId:    row.deliveryId,
        channelId:     row.channelId,
        channelType:   row.channelType as ChannelType,
        channelConfig: row.channelConfig,
        attempts:      row.attempts,
      },
      rowToAlert(row.alert),
      now,
    );
  }
  return due.length;
}

let deliveryWorker: NodeJS.Timeout | null = null;

/** Start the periodic retry sweep. Runs once immediately to flush deliveries left over by a previous process. */
export function startDeliveryWorker(intervalMs = 60_000): void {
  if (deliveryWorker) return;
  const sweep = () =>
    processDueDeliveries().catch(err => console.error('[notifications] Delivery retry sweep failed:', err));
  void sweep();
  deliveryWorker = setInterval(sweep, intervalMs);
  deliveryWorker.unref();
}

// ─── History ──────────────────────────────────────────────────────────────────

/** The most recent alerts, newest first, each with its per-channel delivery state. */
export async function getAlertHistory(limit: number): Promise<AlertHistoryEntry[]> {
  const db     = getDb();
  const events = await db.select().from(alertEvents).orderBy(desc(alertEvents.id)).limit(limit);
  if (events.length === 0) return [];

  const deliveries = await db
    .select({
      alertId:       alertDeliveries.alertId,
      channelId:     alertDeliveries.channelId,
      channelName:   notificationChannels.name,
      status:        alertDeliveries.status,
      attempts:      alertDeliveries.attempts,
      lastError:     alertDeliveries.lastError,
      sentAt:        alertDeliveries.sentAt,
      nextAttemptAt: alertDeliveries.nextAttemptAt,
    })
    .from(alertDeliveries)
    .innerJoin(notificationChannels, eq(alertDeliveries.channelId, notificationChannels.id))
    .where(inArray(alertDeliveries.alertId, events.map(e => e.id)));

  const byAlert = new Map<number, AlertDeliverySummary[]>();
  for (const d of deliveries) {
    const list = byAlert.get(d.alertId) ?? [];
    list.push({
      channelId:     d.channelId,
      channelName:   d.channelName,
      status:        d.status as AlertDeliveryStatus,
      attempts:      d.attempts,
      lastError:     d.lastError     ?? null,
      sentAt:        d.sentAt        ?? null,
      nextAttemptAt: d.nextAttemptAt ?? null,
    });
    byAlert.set(d.alertId, list);
  }

  return events.map(e => ({
    id:            e.id,
    type:          e.type as AlertEventType,
    driveId:       e.driveId       ?? null,
    driveSerial:   e.driveSerial,
    driveModel:    e.driveModel,
    message:       e.message,
    value:         e.value         ?? null,
    threshold:     e.threshold     ?? null,
    attribute:     e.attribute     ?? null,
    previousValue: e.previousValue ?? null,
    createdAt:     e.createdAt,
    deliveries:    byAlert.get(e.id) ?? [],
  }));
}

// ─── Evaluation entry points ──────────────────────────────────────────────────

/**
 * Run a one-time initial alert evaluation for a newly created channel or
 * newly toggled-on subscription. Treats all drives as "previously healthy"
 * (oldCache = undefined) so any currently-violated condition fires immediately
 * to the specified channel — without waiting for the next SMART poll.
 *
 * @param channelId - Channel to notify
 * @param forTypes  - When provided, only fire alerts of these types (use when
 *                    adding a single subscription to avoid duplicate alerts for
 *                    types already subscribed and previously evaluated).
 */
export async function evaluateAndNotifyNewChannel(
  channelId: number,
  forTypes?: ReadonlyArray<AlertEventType>,
): Promise<void> {
  const db = getDb();

  const channelRow = await db.query.notificationChannels.findFirst({
    where: eq(notificationChannels.id, channelId),
  });
  if (!channelRow || !channelRow.enabled) return;

  const subs = await db
    .select()
    .from(notificationSubscriptions)
    .where(eq(notificationSubscriptions.channelId, channelId));
  const subscribedTypes = new Set(subs.map(s => s.alertType as AlertType));

  const allDrives = await db.select().from(drives);

  for (const driveRow of allDrives) {
    const cache = await db.query.smartCache.findFirst({
      where: eq(smartCache.driveId, driveRow.driveId),
    });
    if (!cache) continue;

    const thresholdRow = await db.query.driveAlertThresholds.findFirst({
      where: eq(driveAlertThresholds.driveId, driveRow.driveId),
    });
    const threshold = thresholdRow?.temperatureThresholdCelsius ?? getRuntimeSettings().temperature.alertCelsius;

    // Reconstruct a SmartReading from the cache snapshot
    let attributes: SmartReading['attributes'] = [];
    try { attributes = cache.attributesJson ? JSON.parse(cache.attributesJson) : []; } catch { /* ignore */ }
    const reading: SmartReading = {
      driveId:             driveRow.driveId,
      timestamp:           cache.polledAt,
      temperature:         cache.temperature         ?? null,
      powerOnHours:        cache.powerOnHours        ?? null,
      powerCycleCount:     cache.powerCycleCount     ?? null,
      reallocatedSectors:  cache.reallocatedSectors  ?? null,
      pendingSectors:      cache.pendingSectors       ?? null,
      uncorrectableErrors: cache.uncorrectableErrors ?? null,
      healthPassed:        cache.healthPassed         ?? null,
      attributes,
    };

    // oldCache = undefined → "everything was fine before", so any current
    // violation is treated as a fresh transition and fires immediately.
    const alerts = evaluateAlerts(
      { driveId: driveRow.driveId, serial: driveRow.serialNumber, model: driveRow.model },
      reading,
      undefined,
      threshold,
    );

    for (const alert of alerts) {
      if (forTypes && !forTypes.includes(alert.type)) continue;
      if (!subscribedTypes.has(parentAlertType(alert.type))) continue;
      await recordAndDispatch(alert, { onlyChannelId: channelId });
    }
  }
}

/**
 * Evaluate alert conditions for a drive's new SMART reading and dispatch
 * notifications to all subscribed enabled channels.
 *
 * Must be called BEFORE updateSmartCache so the old state is still in the DB.
 */
export async function evaluateAndNotify(driveId: number, newReading: SmartReading): Promise<void> {
  const db = getDb();

  const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId) });
  if (!driveRow) return;

  const oldCache = await db.query.smartCache.findFirst({ where: eq(smartCache.driveId, driveId) });

  const thresholdRow = await db.query.driveAlertThresholds.findFirst({
    where: eq(driveAlertThresholds.driveId, driveId),
  });
  const threshold = thresholdRow?.temperatureThresholdCelsius ?? getRuntimeSettings().temperature.alertCelsius;

  const alerts = evaluateAlerts(
    { driveId, serial: driveRow.serialNumber, model: driveRow.model },
    newReading,
    oldCache,
    threshold,
  );

  for (const alert of alerts) {
    await recordAndDispatch(alert);
  }
}

/** Record and deliver a drive-presence alert (drive vanished from the host, or came back). */
export async function notifyDrivePresence(
  drive: Pick<DriveRow, 'driveId' | 'serialNumber' | 'model' | 'devicePath'>,
  type: 'drive_missing' | 'drive_returned',
): Promise<void> {
  const label = `${drive.model || 'Drive'} (${drive.serialNumber})`;
  await recordAndDispatch({
    type,
    driveId:     drive.driveId,
    driveSerial: drive.serialNumber,
    driveModel:  drive.model,
    message:     type === 'drive_missing'
      ? `${label} at ${drive.devicePath} is no longer detected by the host.`
      : `${label} is detected again at ${drive.devicePath}.`,
    timestamp:   new Date().toISOString(),
  });
}

/**
 * Notify all channels subscribed to 'benchmark_complete' after a scheduled
 * benchmark run finishes (completed or failed). Reports are informational and
 * sent directly; they are not part of the alert history.
 */
export async function notifyBenchmarkComplete(
  runId: number,
  driveId: number,
  scheduleLabel: string | null,
): Promise<void> {
  const db = getDb();

  const runRow = await db.query.benchmarkRuns.findFirst({ where: eq(benchmarkRuns.runId, runId) });
  if (!runRow) return;

  const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId) });
  if (!driveRow) return;

  const completedAt = runRow.completedAt ?? new Date().toISOString();
  const startedMs   = new Date(runRow.startedAt).getTime();
  const endMs       = new Date(completedAt).getTime();
  const durationSeconds = Math.round((endMs - startedMs) / 1000);

  const payload: BenchmarkCompletePayload = {
    event:         'benchmark_complete',
    timestamp:     new Date().toISOString(),
    scheduleLabel,
    run: {
      id:              runRow.runId,
      startedAt:       runRow.startedAt,
      completedAt,
      durationSeconds,
      status:          runRow.status as 'completed' | 'failed',
      errorMessage:    runRow.errorMessage ?? null,
      numPoints:       runRow.numPoints,
    },
    drive: {
      id:           driveRow.driveId,
      vendor:       driveRow.vendor,
      model:        driveRow.model,
      serialNumber: driveRow.serialNumber,
      capacityGb:   Math.round(driveRow.capacity / 1_000_000_000),
      type:         driveRow.type,
    },
  };

  const subs = await db
    .select({
      channelId: notificationSubscriptions.channelId,
      type:      notificationChannels.type,
      config:    notificationChannels.config,
      enabled:   notificationChannels.enabled,
    })
    .from(notificationSubscriptions)
    .innerJoin(notificationChannels, eq(notificationSubscriptions.channelId, notificationChannels.id))
    .where(eq(notificationSubscriptions.alertType, 'benchmark_complete' as AlertType));

  for (const sub of subs) {
    if (!sub.enabled) continue;
    try {
      const channel = createChannel(sub.type as ChannelType, JSON.parse(sub.config));
      await channel.sendBenchmarkReport(payload);
    } catch (err) {
      console.error(`[notifications] Failed to send benchmark_complete report via channel ${sub.channelId}:`, err);
    }
  }
}
