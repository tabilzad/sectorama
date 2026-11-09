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

  smart: {
    pollIntervalMinutes: parseInt(env('SMART_POLL_INTERVAL_MINUTES', '5'), 10),
    /** How many drives are queried at the same time during a poll sweep. */
    pollConcurrency:     Math.max(1, parseInt(env('SMART_POLL_CONCURRENCY', '4'), 10) || 4),
  },

  benchmark: {
    numPoints: parseInt(env('BENCHMARK_NUM_POINTS', '11'), 10),
  },

  disk: {
    mock: env('DISK_DISCOVERY_MOCK', 'false') === 'true',
  },

  notifications: {
    defaultTempThresholdCelsius: parseInt(env('TEMPERATURE_ALERT_THRESHOLD_CELSIUS', '50'), 10),
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
