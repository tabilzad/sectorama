import { benchmarkSchedules, notificationChannels, notificationSubscriptions } from './schema.js';
import type {
  BenchmarkSchedule,
  NotificationChannel,
  NotificationSubscription,
  ChannelType,
  AlertType,
} from '@sectorama/shared';

export function rowToSchedule(r: typeof benchmarkSchedules.$inferSelect): BenchmarkSchedule {
  return {
    id:             r.id,
    driveId:        r.driveId ?? null,
    cronExpression: r.cronExpression,
    enabled:        r.enabled,
    numPoints:      r.numPoints,
    lastRun:        r.lastRun ?? null,
    nextRun:        r.nextRun ?? null,
    createdAt:      r.createdAt,
  };
}

export function rowToChannel(r: typeof notificationChannels.$inferSelect): NotificationChannel {
  return {
    id:        r.id,
    name:      r.name,
    type:      r.type as ChannelType,
    config:    JSON.parse(r.config) as NotificationChannel['config'],
    enabled:   r.enabled,
    createdAt: r.createdAt,
  };
}

export function rowToSub(r: typeof notificationSubscriptions.$inferSelect): NotificationSubscription {
  return { id: r.id, channelId: r.channelId, alertType: r.alertType as AlertType };
}
