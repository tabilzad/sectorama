import '../test/env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { eq } from 'drizzle-orm';
import { getDb, initDb } from '../db/index.js';
import { drives, smartCache, notificationChannels, notificationSubscriptions, driveAlertThresholds } from '../db/schema.js';
import { scanDisks, registerDrives } from './diskDiscovery.js';
import { refreshAllSmart } from './smartService.js';
import type { Alert } from '@sectorama/shared';

/**
 * A webhook receiver on an ephemeral port that records every alert it is sent.
 * The mock SMART reader reports ~38–44 °C for /dev/mock0, so a cached reading
 * of 20 °C against a 30 °C threshold must produce exactly one temperature
 * transition on the first warm-up and none on the second.
 */
const received: Alert[] = [];
let server: Server;
let webhookUrl: string;

before(async () => {
  initDb();
  await registerDrives(await scanDisks());   // DISK_DISCOVERY_MOCK=true → mock drives

  server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push(JSON.parse(body) as Alert);
      res.statusCode = 200;
      res.end('ok');
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  webhookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

  const db = getDb();
  const [{ id: channelId }] = await db.insert(notificationChannels).values({
    name:      'test',
    type:      'webhook',
    config:    JSON.stringify({ url: webhookUrl, auth: { type: 'none' } }),
    enabled:   true,
    createdAt: new Date().toISOString(),
  }).returning({ id: notificationChannels.id });
  await db.insert(notificationSubscriptions).values({ channelId, alertType: 'temperature' });
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('SMART warm-up on startup', () => {
  it('evaluates alerts against the persisted cache instead of silently overwriting it', async () => {
    const db = getDb();
    const drive = await db.query.drives.findFirst({ where: eq(drives.devicePath, '/dev/mock0') });
    assert.ok(drive, 'mock drive registered');

    // State left behind by the previous process: the drive was cool, threshold is 30 °C.
    await db.insert(driveAlertThresholds).values({ driveId: drive.driveId, temperatureThresholdCelsius: 30 });
    await db.insert(smartCache).values({
      driveId:      drive.driveId,
      polledAt:     '2026-01-01T00:00:00.000Z',
      temperature:  20,
      healthPassed: true,
    });

    await refreshAllSmart();

    const temps = received.filter(a => a.type === 'temperature' && a.driveId === drive.driveId);
    assert.equal(temps.length, 1, 'one temperature alert fired on warm-up');
    assert.ok((temps[0].value ?? 0) > 30);

    // The cache now holds the hot reading, so a second warm-up sees no transition.
    await refreshAllSmart();
    const after = received.filter(a => a.type === 'temperature' && a.driveId === drive.driveId);
    assert.equal(after.length, 1, 'no duplicate alert on a second warm-up');

    const cached = await db.query.smartCache.findFirst({ where: eq(smartCache.driveId, drive.driveId) });
    assert.ok((cached?.temperature ?? 0) > 30, 'cache updated after evaluation');
  });
});
