import path from 'path';
import { config as dotenvConfig } from 'dotenv';

// Load root .env in development (no-op in production where env vars are injected)
dotenvConfig({ path: path.resolve(__dirname, '../../../.env') });

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port:         parseInt(env('PORT', '8888'), 10),
  nodeEnv:      env('NODE_ENV', 'development'),
  isProduction: env('NODE_ENV', 'development') === 'production',

  sqlite: {
    path: env('SQLITE_PATH', path.resolve(process.cwd(), 'sectorama.db')),
  },

  influx: {
    url:    env('INFLUXDB_URL',    'http://localhost:8086'),
    token:  env('INFLUXDB_TOKEN',  ''),
    org:    env('INFLUXDB_ORG',    'sectorama'),
    bucket: env('INFLUXDB_BUCKET', 'sectorama'),
  },

  // SMART_POLL_INTERVAL_MINUTES, SMART_POLL_CONCURRENCY, BENCHMARK_NUM_POINTS and
  // TEMPERATURE_ALERT_THRESHOLD_CELSIUS are runtime settings: see
  // services/settingsService.ts, which reads them lazily so the Settings page
  // can report which values the environment has pinned.

  disk: {
    mock: env('DISK_DISCOVERY_MOCK', 'false') === 'true',
  },

  storage: {
    /** Filesystems mounted under this path are measured for the dashboard's used/free figures. */
    mountRoot:       env('STORAGE_MOUNT_ROOT', '/mnt'),
    /** Directory holding Unraid's disks.ini; when readable it replaces mount scanning. */
    unraidEmhttpDir: env('UNRAID_EMHTTP_DIR', '/var/local/emhttp'),
  },

  paths: {
    /** Built React SPA — served as static files by Fastify */
    public: env('PUBLIC_PATH', path.resolve(process.cwd(), 'public')),
  },
} as const;
