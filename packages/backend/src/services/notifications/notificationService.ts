import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { drives, smartCache, notificationChannels, notificationSubscriptions, driveAlertThresholds } from '../../db/schema.js';
import { config } from '../../config.js';
import { evaluateAlerts } from './alertEvaluator.js';
import { createChannel } from './channelFactory.js';
import type { SmartReading, ChannelType } from '@sectorama/shared';

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
      .where(eq(notificationSubscriptions.alertType, alert.type));

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
