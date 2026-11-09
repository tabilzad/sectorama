import '../test/env.js';
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'node-cron';
import { SMART_POLL_INTERVAL_CHOICES } from '@sectorama/shared';
import { initDb } from '../db/index.js';
import {
  getRuntimeSettings,
  onRuntimeSettingsChanged,
  updateRuntimeSettings,
  RUNTIME_DEFAULTS,
} from './settingsService.js';
import { smartPollCronExpression } from './scheduler.js';

before(() => initDb());

describe('runtime settings — change notification', () => {
  it('notifies listeners with before and after values, only when something changed', () => {
    const seen: Array<[number, number]> = [];
    const off = onRuntimeSettingsChanged((next, prev) =>
      seen.push([prev.smartPolling.intervalMinutes, next.smartPolling.intervalMinutes]),
    );

    updateRuntimeSettings({ smartPolling: { intervalMinutes: 10 } });
    updateRuntimeSettings({ smartPolling: { intervalMinutes: 10 } });   // no-op
    updateRuntimeSettings({ smartPolling: { intervalMinutes: 5 } });
    off();
    updateRuntimeSettings({ smartPolling: { intervalMinutes: 15 } });
    updateRuntimeSettings({ smartPolling: { intervalMinutes: 5 } });

    assert.deepEqual(seen, [[5, 10], [10, 5]]);
    assert.deepEqual(getRuntimeSettings(), RUNTIME_DEFAULTS);
  });

  it('writes nothing when validation fails', () => {
    assert.throws(
      () => updateRuntimeSettings({ temperature: { normalCelsius: 70 }, benchmark: { defaultNumPoints: 31 } }),
      /normal < warm < alert < too hot/,
    );
    assert.equal(getRuntimeSettings().benchmark.defaultNumPoints, RUNTIME_DEFAULTS.benchmark.defaultNumPoints);
  });
});

describe('SMART poll cron expression', () => {
  it('ticks at second 30 every N minutes below an hour', () => {
    assert.equal(smartPollCronExpression(5),  '30 */5 * * * *');
    assert.equal(smartPollCronExpression(30), '30 */30 * * * *');
  });

  it('uses whole hours from 60 minutes and once a day at 24 hours', () => {
    assert.equal(smartPollCronExpression(60),   '30 0 */1 * * *');
    assert.equal(smartPollCronExpression(360),  '30 0 */6 * * *');
    assert.equal(smartPollCronExpression(1440), '30 0 0 * * *');
  });

  it('produces a valid expression for every offered interval', () => {
    for (const minutes of SMART_POLL_INTERVAL_CHOICES) {
      assert.ok(validate(smartPollCronExpression(minutes)), `${minutes} min`);
    }
  });
});
