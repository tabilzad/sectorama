import '../test/env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { initDb } from '../db/index.js';
import { scanDisks, registerDrives } from '../services/diskDiscovery.js';
import type { StorageOverview } from '@sectorama/shared';

let app: FastifyInstance;

before(async () => {
  initDb();
  await registerDrives(await scanDisks());   // DISK_DISCOVERY_MOCK=true → the three mock drives
  app = await buildApp({ logger: false });
  await app.ready();
});

after(async () => {
  await app.close();
});

describe('GET /api/v1/storage', () => {
  it('summarises raw capacity and usage per drive class', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/storage' });
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body) as StorageOverview;
    assert.equal(body.usageSource, 'mock');
    assert.deepEqual(body.classes.map(c => c.type), ['HDD', 'SSD', 'NVMe']);
    assert.equal(body.unattributed, null);

    for (const c of body.classes) {
      assert.equal(c.driveCount, 1);
      assert.ok(c.rawCapacityBytes > 0);
      assert.equal(c.filesystemCount, 1);
      assert.ok(c.fsTotalBytes! > 0 && c.fsUsedBytes! > 0 && c.fsFreeBytes! > 0);
      assert.equal(c.fsUsedBytes! + c.fsFreeBytes!, c.fsTotalBytes!);
      assert.ok(c.fsTotalBytes! <= c.rawCapacityBytes);
    }
  });
});
