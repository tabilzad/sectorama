import '../../test/env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { eq } from 'drizzle-orm';
import { getDb, initDb } from '../../db/index.js';
import { drives, notificationChannels, notificationSubscriptions } from '../../db/schema.js';
import { scanDisks, registerDrives } from '../diskDiscovery.js';
import {
  recordAndDispatch,
  processDueDeliveries,
  getAlertHistory,
  MAX_DELIVERY_ATTEMPTS,
} from './notificationService.js';
import type { Alert } from '@sectorama/shared';

/** Webhook receiver that fails the first `failuresRemaining` requests with HTTP 500. */
let failuresRemaining = 0;
let received = 0;
let server: Server;
let channelId: number;
let drive: { driveId: number; serialNumber: string; model: string };

before(async () => {
  initDb();
  await registerDrives(await scanDisks());
  const row = await getDb().query.drives.findFirst({ where: eq(drives.devicePath, '/dev/mock0') });
  assert.ok(row);
  drive = row;

  server = createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        res.statusCode = 500;
        res.end('nope');
        return;
      }
      received += 1;
      res.statusCode = 200;
      res.end('ok');
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

  const db = getDb();
  const [{ id }] = await db.insert(notificationChannels).values({
    name: 'ops', type: 'webhook', config: JSON.stringify({ url, auth: { type: 'none' } }),
    enabled: true, createdAt: new Date().toISOString(),
  }).returning({ id: notificationChannels.id });
  channelId = id;
  await db.insert(notificationSubscriptions).values([
    { channelId, alertType: 'smart_attribute' },
    { channelId, alertType: 'drive_missing' },
  ]);
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

function alert(type: Alert['type'], message: string): Alert {
  return {
    type, driveId: drive.driveId, driveSerial: drive.serialNumber, driveModel: drive.model,
    message, timestamp: new Date().toISOString(),
  };
}

const minutes = (base: Date, n: number) => new Date(base.getTime() + n * 60_000);

describe('alert delivery pipeline', () => {
  it('records the alert and delivers immediately when the channel is healthy', async () => {
    const before = received;
    const alertId = await recordAndDispatch(alert('smart_attribute', 'Reallocated sectors increased from 0 to 4.'));
    assert.equal(received, before + 1);

    const [entry] = await getAlertHistory(1);
    assert.equal(entry.id, alertId);
    assert.equal(entry.type, 'smart_attribute');
    assert.equal(entry.deliveries.length, 1);
    assert.equal(entry.deliveries[0].status, 'sent');
    assert.equal(entry.deliveries[0].attempts, 1);
    assert.equal(entry.deliveries[0].channelName, 'ops');
  });

  it('keeps a failed delivery pending and retries it once its backoff has elapsed', async () => {
    const t0 = new Date('2026-03-01T12:00:00.000Z');
    failuresRemaining = 1;
    const alertId = await recordAndDispatch(alert('drive_missing', 'Drive gone.'), { now: t0 });

    let [entry] = await getAlertHistory(1);
    assert.equal(entry.id, alertId);
    assert.equal(entry.deliveries[0].status, 'pending');
    assert.equal(entry.deliveries[0].attempts, 1);
    assert.match(entry.deliveries[0].lastError ?? '', /500/);
    assert.equal(entry.deliveries[0].nextAttemptAt, minutes(t0, 1).toISOString());

    // Not due yet: nothing is retried.
    assert.equal(await processDueDeliveries(minutes(t0, 0.5)), 0);

    // Due: the retry succeeds.
    const before = received;
    assert.equal(await processDueDeliveries(minutes(t0, 1)), 1);
    assert.equal(received, before + 1);
    [entry] = await getAlertHistory(1);
    assert.equal(entry.deliveries[0].status, 'sent');
    assert.equal(entry.deliveries[0].attempts, 2);
    assert.equal(entry.deliveries[0].nextAttemptAt, null);
  });

  it('gives up after the retry budget and records the last error', async () => {
    const t0 = new Date('2026-03-02T00:00:00.000Z');
    failuresRemaining = 100;
    await recordAndDispatch(alert('smart_attribute', 'Pending sectors increased from 0 to 1.'), { now: t0 });

    // Walk far past every backoff step; each sweep makes exactly one more attempt.
    let now = t0;
    for (let i = 1; i < MAX_DELIVERY_ATTEMPTS; i++) {
      now = minutes(now, 24 * 60);
      assert.equal(await processDueDeliveries(now), 1, `sweep ${i} should retry once`);
    }
    assert.equal(await processDueDeliveries(minutes(now, 24 * 60)), 0, 'nothing left to retry');

    const [entry] = await getAlertHistory(1);
    assert.equal(entry.deliveries[0].status, 'failed');
    assert.equal(entry.deliveries[0].attempts, MAX_DELIVERY_ATTEMPTS);
    assert.match(entry.deliveries[0].lastError ?? '', /500/);
    failuresRemaining = 0;
  });

  it('records alerts even when no channel is subscribed to their family', async () => {
    const alertId = await recordAndDispatch(alert('temperature', 'Hot.'));
    const [entry] = await getAlertHistory(1);
    assert.equal(entry.id, alertId);
    assert.deepEqual(entry.deliveries, []);
  });

  it('delivers only to the requested channel for a catch-up run', async () => {
    const before = received;
    await recordAndDispatch(alert('smart_attribute', 'x'), { onlyChannelId: channelId + 999 });
    assert.equal(received, before);
    const [entry] = await getAlertHistory(1);
    assert.deepEqual(entry.deliveries, []);
  });
});
