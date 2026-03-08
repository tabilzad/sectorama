import {
  sqliteTable,
  integer,
  text,
  real,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ─── Drives ──────────────────────────────────────────────────────────────────

export const drives = sqliteTable('drives', {
  driveId:            integer('drive_id').primaryKey({ autoIncrement: true }),
  serialNumber:       text('serial_number').notNull().unique(),
  devicePath:         text('device_path').notNull(),
  vendor:             text('vendor').notNull().default(''),
  model:              text('model').notNull().default(''),
  firmwareRevision:   text('firmware_revision').notNull().default(''),
  capacity:           integer('capacity').notNull().default(0),
  type:               text('type').notNull().default('Unknown'),
  rpm:                integer('rpm'),
  interfaceType:      text('interface_type'),
  logicalSectorSize:  integer('logical_sector_size'),
  physicalSectorSize: integer('physical_sector_size'),
  firstSeen:          text('first_seen').notNull(),
  lastSeen:           text('last_seen').notNull(),
  isConnected:        integer('is_connected', { mode: 'boolean' }).notNull().default(true),
});

// ─── BenchmarkRuns ───────────────────────────────────────────────────────────

export const benchmarkRuns = sqliteTable('benchmark_runs', {
  runId:        integer('run_id').primaryKey({ autoIncrement: true }),
  driveId:      integer('drive_id').notNull().references(() => drives.driveId),
  startedAt:    text('started_at').notNull(),
  completedAt:  text('completed_at'),
  status:       text('status').notNull().default('pending'),
  triggerType:  text('trigger_type').notNull().default('manual'),
  numPoints:    integer('num_points').notNull().default(11),
  errorMessage: text('error_message'),
});

// ─── BenchmarkSchedules ──────────────────────────────────────────────────────

export const benchmarkSchedules = sqliteTable('benchmark_schedules', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  driveId:        integer('drive_id'),  // null = all drives
  cronExpression: text('cron_expression').notNull(),
  enabled:        integer('enabled', { mode: 'boolean' }).notNull().default(true),
  numPoints:      integer('num_points').notNull().default(11),
  lastRun:        text('last_run'),
  nextRun:        text('next_run'),
  createdAt:      text('created_at').notNull(),
  label:          text('label'),
});

// ─── SmartCache ──────────────────────────────────────────────────────────────
// Caches the latest SMART snapshot per drive (last-known health for fast queries)

export const smartCache = sqliteTable('smart_cache', {
  driveId:             integer('drive_id').primaryKey().references(() => drives.driveId),
  polledAt:            text('polled_at').notNull(),
  temperature:         real('temperature'),
  powerOnHours:        integer('power_on_hours'),
  powerCycleCount:     integer('power_cycle_count'),
  reallocatedSectors:  integer('reallocated_sectors'),
  pendingSectors:      integer('pending_sectors'),
  uncorrectableErrors: integer('uncorrectable_errors'),
  healthPassed:        integer('health_passed', { mode: 'boolean' }),
  attributesJson:      text('attributes_json'),  // JSON-serialised SmartAttribute[]
});

// ─── Notification Channels ────────────────────────────────────────────────────

export const notificationChannels = sqliteTable('notification_channels', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  name:      text('name').notNull(),
  type:      text('type').notNull(),            // 'webhook' | 'slack'
  config:    text('config').notNull().default('{}'), // JSON blob
  enabled:   integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
});

export const notificationSubscriptions = sqliteTable('notification_subscriptions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  channelId: integer('channel_id').notNull()
               .references(() => notificationChannels.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(), // 'smart_error' | 'temperature'
}, (t) => [uniqueIndex('uq_sub').on(t.channelId, t.alertType)]);

export const driveAlertThresholds = sqliteTable('drive_alert_thresholds', {
  driveId:                     integer('drive_id').primaryKey()
                                 .references(() => drives.driveId, { onDelete: 'cascade' }),
  /** Warm→Hot boundary and the alert trigger point. */
  temperatureThresholdCelsius: integer('temperature_threshold_celsius').notNull(),
  /** Cold→Normal boundary (null = default 25°C) */
  tempNormalCelsius:           integer('temp_normal_celsius'),
  /** Normal→Warm boundary (null = default 45°C) */
  tempWarmCelsius:             integer('temp_warm_celsius'),
  /** Hot→Too Hot boundary (null = default 65°C) */
  tempTooHotCelsius:           integer('temp_too_hot_celsius'),
});

// ─── Push Subscriptions ──────────────────────────────────────────────────────

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  endpoint:  text('endpoint').notNull().unique(),
  p256dh:    text('p256dh').notNull(),
  auth:      text('auth').notNull(),
  createdAt: text('created_at').notNull(),
});

// ─── Drive Display Preferences ───────────────────────────────────────────────

export const driveDisplayPrefs = sqliteTable('drive_display_prefs', {
  driveId:      integer('drive_id').primaryKey().references(() => drives.driveId, { onDelete: 'cascade' }),
  customLabel:  text('custom_label'),
  displayOrder: integer('display_order').notNull().default(0),
});

// ─── Settings ─────────────────────────────────────────────────────────────────

export const settings = sqliteTable('settings', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),
});

// ─── Relations ───────────────────────────────────────────────────────────────

export const drivesRelations = relations(drives, ({ one, many }) => ({
  smartCache:      one(smartCache, { fields: [drives.driveId], references: [smartCache.driveId] }),
  benchmarkRuns:   many(benchmarkRuns),
  schedules:       many(benchmarkSchedules),
}));

export const benchmarkRunsRelations = relations(benchmarkRuns, ({ one }) => ({
  drive: one(drives, { fields: [benchmarkRuns.driveId], references: [drives.driveId] }),
}));

export const benchmarkSchedulesRelations = relations(benchmarkSchedules, ({ one }) => ({
  drive: one(drives, { fields: [benchmarkSchedules.driveId], references: [drives.driveId] }),
}));

export const smartCacheRelations = relations(smartCache, ({ one }) => ({
  drive: one(drives, { fields: [smartCache.driveId], references: [drives.driveId] }),
}));

// ─── Type exports ─────────────────────────────────────────────────────────────

export type DriveRow                      = typeof drives.$inferSelect;
export type NewDriveRow                   = typeof drives.$inferInsert;
export type BenchmarkRunRow               = typeof benchmarkRuns.$inferSelect;
export type NewBenchmarkRunRow            = typeof benchmarkRuns.$inferInsert;
export type ScheduleRow                   = typeof benchmarkSchedules.$inferSelect;
export type NewScheduleRow                = typeof benchmarkSchedules.$inferInsert;
export type SmartCacheRow                 = typeof smartCache.$inferSelect;
export type NotificationChannelRow        = typeof notificationChannels.$inferSelect;
export type NotificationSubscriptionRow   = typeof notificationSubscriptions.$inferSelect;
export type DriveAlertThresholdRow        = typeof driveAlertThresholds.$inferSelect;
export type PushSubscriptionRow           = typeof pushSubscriptions.$inferSelect;
export type SettingsRow                   = typeof settings.$inferSelect;
export type DriveDisplayPrefsRow          = typeof driveDisplayPrefs.$inferSelect;
