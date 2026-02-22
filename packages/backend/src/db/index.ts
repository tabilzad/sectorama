import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { sql } from 'drizzle-orm';
import { config } from '../config.js';
import * as schema from './schema.js';

let _sqlite: Database.Database | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getSqlite(): Database.Database {
  if (!_sqlite) {
    _sqlite = new Database(config.sqlite.path);
    _sqlite.pragma('journal_mode = WAL');
    _sqlite.pragma('foreign_keys = ON');
  }
  return _sqlite;
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getSqlite(), { schema });
  }
  return _db;
}

export type Db = ReturnType<typeof getDb>;

/** Create tables if they don't exist (simple inline migration) */
export function initDb(): void {
  const sqlite = getSqlite();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS drives (
      drive_id            INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_number       TEXT    NOT NULL UNIQUE,
      device_path         TEXT    NOT NULL,
      vendor              TEXT    NOT NULL DEFAULT '',
      model               TEXT    NOT NULL DEFAULT '',
      firmware_revision   TEXT    NOT NULL DEFAULT '',
      capacity            INTEGER NOT NULL DEFAULT 0,
      type                TEXT    NOT NULL DEFAULT 'Unknown',
      rpm                 INTEGER,
      interface_type      TEXT,
      logical_sector_size INTEGER,
      physical_sector_size INTEGER,
      first_seen          TEXT    NOT NULL,
      last_seen           TEXT    NOT NULL,
      is_connected        INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS benchmark_runs (
      run_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      drive_id      INTEGER NOT NULL REFERENCES drives(drive_id),
      started_at    TEXT    NOT NULL,
      completed_at  TEXT,
      status        TEXT    NOT NULL DEFAULT 'pending',
      trigger_type  TEXT    NOT NULL DEFAULT 'manual',
      num_points    INTEGER NOT NULL DEFAULT 11,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS benchmark_schedules (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      drive_id        INTEGER,
      cron_expression TEXT    NOT NULL,
      enabled         INTEGER NOT NULL DEFAULT 1,
      num_points      INTEGER NOT NULL DEFAULT 11,
      last_run        TEXT,
      next_run        TEXT,
      created_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS smart_cache (
      drive_id              INTEGER PRIMARY KEY REFERENCES drives(drive_id),
      polled_at             TEXT    NOT NULL,
      temperature           REAL,
      power_on_hours        INTEGER,
      power_cycle_count     INTEGER,
      reallocated_sectors   INTEGER,
      pending_sectors       INTEGER,
      uncorrectable_errors  INTEGER,
      health_passed         INTEGER
    );
  `);
}

/** Verify DB is readable */
export function testConnection(): void {
  const db = getDb();
  db.run(sql`SELECT 1`);
}
