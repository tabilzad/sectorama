import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env when running drizzle-kit from packages/backend/
config({ path: resolve(__dirname, '../../.env') });

export default {
  schema:    './src/db/schema.ts',
  out:       './src/db/migrations',
  dialect:   'mysql',
  dbCredentials: {
    host:     process.env.MYSQL_HOST     ?? 'localhost',
    port:     parseInt(process.env.MYSQL_PORT ?? '3306', 10),
    user:     process.env.MYSQL_USER     ?? 'sectorama',
    password: process.env.MYSQL_PASS     ?? '',
    database: process.env.MYSQL_DB       ?? 'sectorama',
  },
} satisfies Config;
