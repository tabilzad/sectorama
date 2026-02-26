import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { drives, smartCache, notificationChannels, notificationSubscriptions, driveAlertThresholds } from '../../db/schema.js';
import { config } from '../../config.js';
import { evaluateAlerts } from './alertEvaluator.js';
import { createChannel } from './channelFactory.js';
import type { SmartReading, ChannelType, AlertType, AlertEventType } from '@sectorama/shared';

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
  const channel   = createChannel(channelRow.type as ChannelType, JSON.parse(channelRow.config));

  for (const driveRow of allDrives) {
    const cache = await db.query.smartCache.findFirst({
      where: eq(smartCache.driveId, driveRow.driveId),
    });
    if (!cache) continue;

    const thresholdRow = await db.query.driveAlertThresholds.findFirst({
      where: eq(driveAlertThresholds.driveId, driveRow.driveId),
    });
    const threshold = thresholdRow?.temperatureThresholdCelsius ?? config.notifications.defaultTempThresholdCelsius;

    // Reconstruct a SmartReading from the cache snapshot
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
      attributes:          [],
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
      const parentType: AlertType =
        alert.type === 'temperature_recovery' ? 'temperature' : alert.type;
      if (forTypes && !forTypes.includes(alert.type)) continue;
      if (!subscribedTypes.has(parentType)) continue;
      try {
        await channel.send(alert);
      } catch (err) {
        console.error(
          `[notifications] Initial alert failed for channel ${channelId}, drive ${driveRow.driveId}:`,
          err,
        );
      }
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

  // 1. Load drive info
  const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId) });
  if (!driveRow) return;

  // 2. Load current (pre-update) smart cache
  const oldCache = await db.query.smartCache.findFirst({ where: eq(smartCache.driveId, driveId) });

  // 3. Load per-drive threshold or fall back to global default
  const thresholdRow = await db.query.driveAlertThresholds.findFirst({
    where: eq(driveAlertThresholds.driveId, driveId),
  });
  const threshold = thresholdRow?.temperatureThresholdCelsius ?? config.notifications.defaultTempThresholdCelsius;

  // 4. Evaluate which alerts should fire
  const alerts = evaluateAlerts(
    { driveId, serial: driveRow.serialNumber, model: driveRow.model },
    newReading,
    oldCache,
    threshold,
  );

  if (alerts.length === 0) return;

  // 5. Dispatch each alert to all subscribed channels
  for (const alert of alerts) {
    // temperature_recovery shares the 'temperature' subscription — channels that
    // opted in to temperature alerts also receive the all-clear when it cools down.
    const subscriptionType: AlertType =
      alert.type === 'temperature_recovery' ? 'temperature' : alert.type;

    const subs = await db
      .select({
        channelId: notificationSubscriptions.channelId,
        alertType: notificationSubscriptions.alertType,
        type:      notificationChannels.type,
        config:    notificationChannels.config,
        enabled:   notificationChannels.enabled,
      })
      .from(notificationSubscriptions)
      .innerJoin(notificationChannels, eq(notificationSubscriptions.channelId, notificationChannels.id))
      .where(eq(notificationSubscriptions.alertType, subscriptionType));

    for (const sub of subs) {
      if (!sub.enabled) continue;
      try {
        const channel = createChannel(sub.type as ChannelType, JSON.parse(sub.config));
        await channel.send(alert);
      } catch (err) {
        console.error(
          `[notifications] Failed to send ${alert.type} alert via channel ${sub.channelId}:`,
          err,
        );
      }
    }
  }
}
