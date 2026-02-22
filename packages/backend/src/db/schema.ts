import {
  sqliteTable,
  integer,
  text,
  real,
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

export type DriveRow             = typeof drives.$inferSelect;
export type NewDriveRow          = typeof drives.$inferInsert;
export type BenchmarkRunRow      = typeof benchmarkRuns.$inferSelect;
export type NewBenchmarkRunRow   = typeof benchmarkRuns.$inferInsert;
export type ScheduleRow          = typeof benchmarkSchedules.$inferSelect;
export type NewScheduleRow       = typeof benchmarkSchedules.$inferInsert;
export type SmartCacheRow        = typeof smartCache.$inferSelect;
