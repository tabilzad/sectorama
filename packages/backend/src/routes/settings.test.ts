import '../test/env.js';
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import type { RuntimeSettingsResponse } from '@sectorama/shared';
import { buildApp } from '../app.js';
import { initDb } from '../db/index.js';
import { getSmartPollingSettings, RUNTIME_DEFAULTS } from '../services/settingsService.js';

let app: FastifyInstance;

before(async () => {
  initDb();
  app = await buildApp({ logger: false });
  await app.ready();
});

after(async () => {
  await app.close();
});

const get = async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/settings/runtime' });
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body) as RuntimeSettingsResponse;
};

const put = (payload: unknown) =>
  app.inject({ method: 'PUT', url: '/api/v1/settings/runtime', payload: payload as Record<string, unknown> });

describe('runtime settings — read', () => {
  it('reports the built-in defaults with nothing pinned', async () => {
    const body = await get();
    assert.deepEqual(body.settings, RUNTIME_DEFAULTS);
    assert.deepEqual(body.defaults, RUNTIME_DEFAULTS);
    assert.deepEqual(body.managedByEnv, {});
  });
});

describe('runtime settings — update', () => {
  it('applies a partial update and leaves the other fields alone', async () => {
    const res = await put({ smartPolling: { skipStandby: false, intervalMinutes: 15 } });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as RuntimeSettingsResponse;
    assert.equal(body.settings.smartPolling.skipStandby, false);
    assert.equal(body.settings.smartPolling.intervalMinutes, 15);
    assert.equal(body.settings.smartPolling.concurrency, RUNTIME_DEFAULTS.smartPolling.concurrency);
    assert.deepEqual(body.settings.temperature, RUNTIME_DEFAULTS.temperature);

    // The poller reads the same values.
    assert.deepEqual(getSmartPollingSettings(), { skipStandby: false, intervalMinutes: 15, concurrency: 4 });

    const back = await put({ smartPolling: { skipStandby: true, intervalMinutes: 5 } });
    assert.equal(back.statusCode, 200);
    assert.deepEqual((await get()).settings.smartPolling, RUNTIME_DEFAULTS.smartPolling);
  });

  it('round-trips the benchmark and temperature sections', async () => {
    const res = await put({
      benchmark:   { defaultNumPoints: 21 },
      temperature: { normalCelsius: 30, warmCelsius: 42, alertCelsius: 55, tooHotCelsius: 70 },
    });
    assert.equal(res.statusCode, 200);
    const body = (await get()).settings;
    assert.equal(body.benchmark.defaultNumPoints, 21);
    assert.deepEqual(body.temperature, { normalCelsius: 30, warmCelsius: 42, alertCelsius: 55, tooHotCelsius: 70 });

    await put({ benchmark: RUNTIME_DEFAULTS.benchmark, temperature: RUNTIME_DEFAULTS.temperature });
    assert.deepEqual((await get()).settings, RUNTIME_DEFAULTS);
  });

  it('rejects an interval that is not one of the offered choices', async () => {
    const res = await put({ smartPolling: { intervalMinutes: 7 } });
    assert.equal(res.statusCode, 400);
    assert.match(JSON.parse(res.body).error, /intervalMinutes/);
    assert.equal((await get()).settings.smartPolling.intervalMinutes, 5);
  });

  it('rejects out-of-range values and wrong types', async () => {
    for (const payload of [
      { smartPolling: { concurrency: 0 } },
      { smartPolling: { concurrency: 99 } },
      { smartPolling: { skipStandby: 'yes' } },
      { benchmark: { defaultNumPoints: 0 } },
      { temperature: { alertCelsius: 200 } },
      {},
    ]) {
      const res = await put(payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
    }
  });

  it('rejects temperature zones that are not strictly increasing, as a whole', async () => {
    // alert must stay above warm (40) — changing only one field is checked against the others.
    const res = await put({ temperature: { alertCelsius: 35 } });
    assert.equal(res.statusCode, 400);
    assert.match(JSON.parse(res.body).error, /normal < warm < alert < too hot/);
    assert.equal((await get()).settings.temperature.alertCelsius, 50);
  });
});

describe('runtime settings — pinned by the environment', () => {
  afterEach(() => {
    delete process.env['SMART_POLL_INTERVAL_MINUTES'];
    delete process.env['TEMPERATURE_ALERT_THRESHOLD_CELSIUS'];
  });

  it('reports the environment value and names the variable', async () => {
    process.env['SMART_POLL_INTERVAL_MINUTES'] = '30';
    const body = await get();
    assert.equal(body.settings.smartPolling.intervalMinutes, 30);
    assert.deepEqual(body.managedByEnv, { 'smartPolling.intervalMinutes': 'SMART_POLL_INTERVAL_MINUTES' });
  });

  it('refuses to change a pinned field but accepts its current value', async () => {
    process.env['SMART_POLL_INTERVAL_MINUTES'] = '30';

    const change = await put({ smartPolling: { intervalMinutes: 10 } });
    assert.equal(change.statusCode, 400);
    assert.match(JSON.parse(change.body).error, /SMART_POLL_INTERVAL_MINUTES/);

    // A section-level save that echoes the pinned value is a no-op, not an error.
    const same = await put({ smartPolling: { intervalMinutes: 30, concurrency: 2 } });
    assert.equal(same.statusCode, 200);
    assert.equal(JSON.parse(same.body).settings.smartPolling.concurrency, 2);
    await put({ smartPolling: { concurrency: 4 } });
  });

  it('treats a blank variable as unset and ignores an unparsable one', async () => {
    process.env['SMART_POLL_INTERVAL_MINUTES'] = '   ';
    process.env['TEMPERATURE_ALERT_THRESHOLD_CELSIUS'] = 'hot';
    const body = await get();
    assert.equal(body.settings.smartPolling.intervalMinutes, 5);
    assert.equal(body.settings.temperature.alertCelsius, 50);
    assert.deepEqual(body.managedByEnv, {});
  });

  it('lets the environment override a value saved earlier, without deleting it', async () => {
    await put({ temperature: { alertCelsius: 55 } });
    process.env['TEMPERATURE_ALERT_THRESHOLD_CELSIUS'] = '48';
    assert.equal((await get()).settings.temperature.alertCelsius, 48);
    delete process.env['TEMPERATURE_ALERT_THRESHOLD_CELSIUS'];
    assert.equal((await get()).settings.temperature.alertCelsius, 55);
    await put({ temperature: { alertCelsius: 50 } });
  });
});
