import '../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from './concurrency.js';

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5));

describe('mapWithConcurrency', () => {
  it('never runs more than the limit at once and keeps result order', async () => {
    let inFlight = 0;
    let peak     = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async n => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      return n * 10;
    });
    assert.equal(peak, 3);
    assert.deepEqual(results.map(r => r.status === 'fulfilled' ? r.value : null), [10, 20, 30, 40, 50, 60, 70]);
  });

  it('captures rejections without stopping the other items', async () => {
    const results = await mapWithConcurrency(['a', 'b', 'c'], 2, async s => {
      if (s === 'b') throw new Error('boom');
      return s.toUpperCase();
    });
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.match(String((results[1] as PromiseRejectedResult).reason), /boom/);
    assert.equal(results[2].status, 'fulfilled');
  });

  it('treats a limit below one as one and handles empty input', async () => {
    let peak = 0, inFlight = 0;
    await mapWithConcurrency([1, 2], 0, async () => { inFlight++; peak = Math.max(peak, inFlight); await tick(); inFlight--; });
    assert.equal(peak, 1);
    assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
  });
});
