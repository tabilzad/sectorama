import '../test/env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { initDb } from '../db/index.js';
import { getSmartPollingSettings } from '../services/settingsService.js';

let app: FastifyInstance;

before(async () => {
  initDb();
  app = await buildApp({ logger: false });
  await app.ready();
});

after(async () => {
  await app.close();
});

describe('SMART polling settings', () => {
  it('defaults to skipping drives in standby', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/settings/smart-polling' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { skipStandby: true });
  });

  it('round-trips the setting and exposes it to the poller', async () => {
    const off = await app.inject({ method: 'PUT', url: '/api/v1/settings/smart-polling', payload: { skipStandby: false } });
    assert.equal(off.statusCode, 200);
    assert.deepEqual(JSON.parse(off.body), { skipStandby: false });
    assert.equal(getSmartPollingSettings().skipStandby, false);

    const on = await app.inject({ method: 'PUT', url: '/api/v1/settings/smart-polling', payload: { skipStandby: true } });
    assert.deepEqual(JSON.parse(on.body), { skipStandby: true });
    assert.equal(getSmartPollingSettings().skipStandby, true);
  });

  it('rejects a non-boolean value', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/settings/smart-polling', payload: { skipStandby: 'yes' } });
    assert.equal(res.statusCode, 400);
    assert.match(JSON.parse(res.body).error, /skipStandby/);
  });
});
