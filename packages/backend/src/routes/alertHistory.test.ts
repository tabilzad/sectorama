import '../test/env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { getDb, initDb } from '../db/index.js';
import { drives } from '../db/schema.js';
import { scanDisks, registerDrives } from '../services/diskDiscovery.js';
import { recordAndDispatch } from '../services/notifications/notificationService.js';
import type { AlertHistoryEntry } from '@sectorama/shared';

let app: FastifyInstance;

before(async () => {
  initDb();
  await registerDrives(await scanDisks());
  const drive = await getDb().query.drives.findFirst({ where: eq(drives.devicePath, '/dev/mock1') });
  assert.ok(drive);
  for (const n of [1, 2, 3]) {
    await recordAndDispatch({
      type: 'smart_attribute', driveId: drive.driveId, driveSerial: drive.serialNumber, driveModel: drive.model,
      message: `Pending sectors increased from ${n - 1} to ${n}.`, attribute: 'Pending sectors',
      value: n, previousValue: n - 1, timestamp: new Date(2026, 0, n).toISOString(),
    });
  }
  app = await buildApp({ logger: false });
  await app.ready();
});

after(async () => {
  await app.close();
});

describe('GET /api/v1/notifications/history', () => {
  it('returns the newest alerts first with their delivery state', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/notifications/history' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as AlertHistoryEntry[];
    assert.equal(body.length, 3);
    assert.equal(body[0].value, 3);
    assert.equal(body[0].attribute, 'Pending sectors');
    assert.deepEqual(body[0].deliveries, []);
  });

  it('honours and validates the limit', async () => {
    const one = await app.inject({ method: 'GET', url: '/api/v1/notifications/history?limit=1' });
    assert.equal((JSON.parse(one.body) as AlertHistoryEntry[]).length, 1);

    for (const bad of ['0', '501', 'many']) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/notifications/history?limit=${bad}` });
      assert.equal(res.statusCode, 400, `limit=${bad}`);
    }
  });
});
