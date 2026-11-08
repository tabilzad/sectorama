import '../test/env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../app.js';
import { initDb } from '../db/index.js';

let app: FastifyInstance;

before(async () => {
  initDb();
  app = await buildApp({ logger: false });
  // A deliberately failing route to exercise the 5xx masking in the error handler.
  app.get('/api/v1/__test/boom', async () => {
    throw new Error('SQLITE_ERROR: secret internal detail at /data/sectorama.db');
  });
  await app.ready();
});

after(async () => {
  await app.close();
});

const body = (res: LightMyRequestResponse) => JSON.parse(res.body) as { error?: string; status?: number };

async function call(
  method: InjectOptions['method'],
  url: string,
  payload?: unknown,
  headers?: Record<string, string>,
) {
  return app.inject({ method, url, payload: payload as InjectOptions['payload'], headers });
}

describe('route parameters', () => {
  it('rejects a non-numeric drive id', async () => {
    const res = await call('GET', '/api/v1/disks/abc');
    assert.equal(res.statusCode, 400);
    assert.match(body(res).error ?? '', /driveId/);
  });

  it('rejects a zero drive id', async () => {
    const res = await call('GET', '/api/v1/disks/0');
    assert.equal(res.statusCode, 400);
  });

  it('coerces a numeric string id and returns 404 for an unknown drive', async () => {
    const res = await call('GET', '/api/v1/disks/999');
    assert.equal(res.statusCode, 404);
    assert.equal(body(res).error, 'Drive not found');
  });

  it('rejects a non-numeric run id', async () => {
    const res = await call('GET', '/api/v1/disks/1/benchmarks/latest');
    assert.equal(res.statusCode, 400);
  });
});

describe('benchmark trigger', () => {
  it('caps numPoints', async () => {
    const res = await call('POST', '/api/v1/disks/1/benchmark', { numPoints: 5000 });
    assert.equal(res.statusCode, 400);
    assert.match(body(res).error ?? '', /numPoints/);
  });

  it('rejects a non-JSON body', async () => {
    const res = await call('POST', '/api/v1/disks/1/benchmark', 'numPoints=3', { 'content-type': 'text/plain' });
    assert.equal(res.statusCode, 400);
  });

  it('treats a missing body as "use defaults"', async () => {
    const res = await call('POST', '/api/v1/disks/999/benchmark');
    // Validation passed; the handler then reports the unknown drive.
    assert.equal(res.statusCode, 404);
  });
});

describe('SMART history time bounds', () => {
  it('rejects Flux injection in from', async () => {
    const res = await call('GET', '/api/v1/disks/1/smart/history?from=' + encodeURIComponent('-7d) |> yield()'));
    assert.equal(res.statusCode, 400);
    assert.match(body(res).error ?? '', /from/);
  });

  it('rejects Flux injection in to', async () => {
    const res = await call('GET', '/api/v1/disks/1/smart/history?to=' + encodeURIComponent('now()) |> drop()'));
    assert.equal(res.statusCode, 400);
  });

  it('rejects an over-long attribute name', async () => {
    const res = await call('GET', '/api/v1/disks/1/smart/history?attr=' + 'a'.repeat(129));
    assert.equal(res.statusCode, 400);
  });

  it('accepts durations, timestamps, and now()', async () => {
    for (const qs of ['from=-30d&to=now()', 'from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z', '']) {
      const res = await call('GET', `/api/v1/disks/999/smart/history?${qs}`);
      // Validation passed; the handler then reports the unknown drive.
      assert.equal(res.statusCode, 404, `unexpected status for ?${qs}`);
    }
  });
});

describe('display preferences', () => {
  it('rejects an unknown preset', async () => {
    const res = await call('PUT', '/api/v1/disks/display-prefs/layout', { preset: 'bogus' });
    assert.equal(res.statusCode, 400);
  });

  it('rejects non-numeric drive ids in the order', async () => {
    const res = await call('PUT', '/api/v1/disks/display-prefs/order', { driveIds: ['x'] });
    assert.equal(res.statusCode, 400);
  });

  it('rejects drive ids that are not registered', async () => {
    const res = await call('PUT', '/api/v1/disks/display-prefs/order', { driveIds: [998, 999] });
    assert.equal(res.statusCode, 400);
    assert.match(body(res).error ?? '', /998, 999/);
  });

  it('accepts an empty custom order (fresh install with no drives)', async () => {
    const order  = await call('PUT', '/api/v1/disks/display-prefs/order',  { driveIds: [] });
    const layout = await call('PUT', '/api/v1/disks/display-prefs/layout', { preset: 'custom', driveIds: [] });
    assert.equal(order.statusCode, 204);
    assert.equal(layout.statusCode, 204);
  });

  it('rejects an over-long custom label', async () => {
    const res = await call('PATCH', '/api/v1/disks/1/display-prefs', { customLabel: 'x'.repeat(101) });
    assert.equal(res.statusCode, 400);
  });
});

describe('schedules', () => {
  it('rejects an invalid cron expression', async () => {
    const res = await call('POST', '/api/v1/schedules', { cronExpression: 'every tuesday' });
    assert.equal(res.statusCode, 400);
    assert.equal(body(res).error, 'Invalid cron expression');
  });

  it('rejects numPoints out of range', async () => {
    const res = await call('POST', '/api/v1/schedules', { cronExpression: '0 2 * * *', numPoints: 0 });
    assert.equal(res.statusCode, 400);
  });

  it('rejects a non-numeric driveId', async () => {
    const res = await call('POST', '/api/v1/schedules', { cronExpression: '0 2 * * *', driveId: 'x' });
    assert.equal(res.statusCode, 400);
  });

  it('returns 404 for a schedule targeting an unknown drive', async () => {
    const res = await call('POST', '/api/v1/schedules', { cronExpression: '0 2 * * *', driveId: 999 });
    assert.equal(res.statusCode, 404);
  });

  it('rejects a non-numeric schedule id', async () => {
    const res = await call('DELETE', '/api/v1/schedules/abc');
    assert.equal(res.statusCode, 400);
  });
});

describe('notifications', () => {
  it('rejects an unknown channel type', async () => {
    const res = await call('POST', '/api/v1/notifications/channels', { name: 'x', type: 'pigeon', config: {} });
    assert.equal(res.statusCode, 400);
  });

  it('rejects a webhook URL that is not http(s)', async () => {
    const res = await call('POST', '/api/v1/notifications/channels', {
      name: 'x', type: 'webhook', config: { url: 'ftp://example.com/hook', auth: { type: 'none' } },
    });
    assert.equal(res.statusCode, 400);
    assert.match(body(res).error ?? '', /http\(s\) url/);
  });

  it('rejects an over-long channel name', async () => {
    const res = await call('POST', '/api/v1/notifications/channels', {
      name: 'x'.repeat(101), type: 'slack', config: { webhookUrl: 'https://hooks.slack.com/services/x' },
    });
    assert.equal(res.statusCode, 400);
  });

  it('rejects an unknown alert type', async () => {
    const res = await call('POST', '/api/v1/notifications/subscriptions', { channelId: 1, alertType: 'bogus' });
    assert.equal(res.statusCode, 400);
  });

  it('returns 404 for a subscription on an unknown channel', async () => {
    const res = await call('POST', '/api/v1/notifications/subscriptions', { channelId: 999, alertType: 'temperature' });
    assert.equal(res.statusCode, 404);
  });

  it('rejects an out-of-range temperature threshold', async () => {
    const res = await call('PUT', '/api/v1/notifications/thresholds/1', { temperatureThresholdCelsius: 999 });
    assert.equal(res.statusCode, 400);
  });

  it('rejects a threshold body without the required field', async () => {
    const res = await call('PUT', '/api/v1/notifications/thresholds/1', { tempWarmCelsius: 45 });
    assert.equal(res.statusCode, 400);
  });

  it('returns 404 for a threshold on an unknown drive', async () => {
    const res = await call('PUT', '/api/v1/notifications/thresholds/999', { temperatureThresholdCelsius: 50 });
    assert.equal(res.statusCode, 404);
  });
});

describe('push subscriptions', () => {
  it('rejects a non-https endpoint', async () => {
    const res = await call('POST', '/api/v1/push/subscribe', {
      endpoint: 'http://push.example.com/x', keys: { p256dh: 'a', auth: 'b' },
    });
    assert.equal(res.statusCode, 400);
  });

  it('rejects a subscription without keys', async () => {
    const res = await call('POST', '/api/v1/push/subscribe', { endpoint: 'https://push.example.com/x' });
    assert.equal(res.statusCode, 400);
  });

  it('rejects an unsubscribe without an endpoint', async () => {
    const res = await call('DELETE', '/api/v1/push/unsubscribe', {});
    assert.equal(res.statusCode, 400);
  });
});

describe('settings', () => {
  it('rejects a non-boolean enabled flag', async () => {
    const res = await call('PUT', '/api/v1/settings/community-sharing', { enabled: 'yes' });
    assert.equal(res.statusCode, 400);
    assert.match(body(res).error ?? '', /enabled/);
  });
});

describe('error handler', () => {
  it('masks internal details on 5xx responses', async () => {
    const res = await call('GET', '/api/v1/__test/boom');
    assert.equal(res.statusCode, 500);
    assert.deepEqual(body(res), { error: 'Internal Server Error', status: 500 });
    assert.doesNotMatch(res.body, /secret|sectorama\.db|SQLITE/);
  });

  it('keeps 4xx messages', async () => {
    const res = await call('GET', '/api/v1/disks/abc');
    assert.equal(body(res).status, 400);
    assert.match(body(res).error ?? '', /must be integer/);
  });
});
