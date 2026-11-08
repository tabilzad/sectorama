import '../test/env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { DriveSummary, SmartAttribute, SystemStats } from '@sectorama/shared';
import { buildApp } from '../app.js';
import { getDb, initDb } from '../db/index.js';
import { drives, smartCache } from '../db/schema.js';
import { scanDisks, registerDrives } from '../services/diskDiscovery.js';
import { getAllCachedSmartEvents } from '../services/smartService.js';

/**
 * Regression test for the dashboard badge: a drive whose overall SMART status
 * passes but which has a flagged attribute must be WARNING everywhere the UI
 * can get health from — the drive list, the stats counters and the live-feed
 * replay — not PASSED in one place and WARNING in another.
 */
let app: FastifyInstance;
let flaggedId: number;
let cleanId: number;

const worn: SmartAttribute = {
  attrId: 3, name: 'Percentage Used', value: 93, worst: 93, threshold: 0, rawValue: 93, failing: false, warn: true,
};

async function setCache(driveId: number, patch: Partial<typeof smartCache.$inferInsert>) {
  const db = getDb();
  const base = {
    driveId,
    polledAt:            '2026-01-01T00:00:00.000Z',
    temperature:         35,
    reallocatedSectors:  0,
    pendingSectors:      0,
    uncorrectableErrors: 0,
    healthPassed:        true,
    attributesJson:      '[]',
    ...patch,
  };
  await db.insert(smartCache).values(base).onConflictDoUpdate({ target: smartCache.driveId, set: base });
}

before(async () => {
  initDb();
  await registerDrives(await scanDisks());   // DISK_DISCOVERY_MOCK=true → mock drives
  const db = getDb();
  flaggedId = (await db.query.drives.findFirst({ where: eq(drives.devicePath, '/dev/mock0') }))!.driveId;
  cleanId   = (await db.query.drives.findFirst({ where: eq(drives.devicePath, '/dev/mock1') }))!.driveId;

  await setCache(flaggedId, { attributesJson: JSON.stringify([worn]) });
  await setCache(cleanId, {});

  app = await buildApp({ logger: false });
  await app.ready();
});

after(async () => {
  await app.close();
});

const listHealth = async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/disks' });
  assert.equal(res.statusCode, 200);
  const list = JSON.parse(res.body) as DriveSummary[];
  return Object.fromEntries(list.map(d => [d.driveId, d.health])) as Record<number, string>;
};

describe('drive health is derived by one rule everywhere', () => {
  it('drive list: passing status with an advisory attribute is WARNING, a clean drive is PASSED', async () => {
    const health = await listHealth();
    assert.equal(health[flaggedId], 'warning');
    assert.equal(health[cleanId], 'ok');
  });

  it('stats counters agree with the list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/stats' });
    assert.equal(res.statusCode, 200);
    const stats = JSON.parse(res.body) as SystemStats;
    assert.equal(stats.warningDrives, 1);
    assert.equal(stats.healthyDrives, 1);
    assert.equal(stats.failedDrives, 0);
  });

  it('live-feed replay agrees with the list', async () => {
    const events = await getAllCachedSmartEvents();
    const byId = Object.fromEntries(events.map(e => [e.driveId, e.health]));
    assert.equal(byId[flaggedId], 'warning');
    assert.equal(byId[cleanId], 'ok');
  });

  it('an attribute the device flags as failing while the status still passes is WARNING; a failed status is FAILED', async () => {
    await setCache(cleanId, { attributesJson: JSON.stringify([{ ...worn, name: 'Reallocated_Sector_Ct', failing: true, warn: false }]) });
    assert.equal((await listHealth())[cleanId], 'warning');

    await setCache(cleanId, { healthPassed: false });
    assert.equal((await listHealth())[cleanId], 'failed');

    await setCache(cleanId, {});
    assert.equal((await listHealth())[cleanId], 'ok');
  });
});
