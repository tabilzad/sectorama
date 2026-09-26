import '../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { flux } from '@influxdata/influxdb-client';
import { fluxTime, deletePredicate, FLUX_TIME_PATTERN } from './flux.js';

describe('fluxTime', () => {
  it('renders relative durations as Flux duration literals', () => {
    assert.equal(String(fluxTime('-7d')),  'duration(v: "-7d")');
    assert.equal(String(fluxTime('-24h')), 'duration(v: "-24h")');
    assert.equal(String(fluxTime('-30m')), 'duration(v: "-30m")');
  });

  it('renders now() as a bare expression', () => {
    assert.equal(String(fluxTime('now()')), 'now()');
  });

  it('renders RFC 3339 timestamps as Flux time literals', () => {
    assert.equal(String(fluxTime('2026-01-02T03:04:05Z')),          'time(v: "2026-01-02T03:04:05Z")');
    assert.equal(String(fluxTime('2026-01-02T03:04:05.123+02:00')), 'time(v: "2026-01-02T03:04:05.123+02:00")');
  });

  it('rejects anything that is not a duration, timestamp, or now()', () => {
    for (const bad of [
      '',
      '7d',
      '-7d) |> yield()',
      'now() |> drop()',
      '2026-01-02',
      '-7d"',
      'from(bucket: "x")',
    ]) {
      assert.throws(() => fluxTime(bad), /Invalid Flux time bound/, `expected rejection for ${JSON.stringify(bad)}`);
    }
  });

  it('exposes a pattern that AJV can compile under the u flag', () => {
    const re = new RegExp(FLUX_TIME_PATTERN, 'u');
    assert.ok(re.test('-90d'));
    assert.ok(!re.test('-90d; drop'));
  });
});

describe('flux template tag (library guarantee this code relies on)', () => {
  it('escapes double quotes and backslashes in interpolated strings', () => {
    const q = flux`|> filter(fn: (r) => r.serial == ${'AB"C\\D'})`;
    assert.equal(q.toString(), '|> filter(fn: (r) => r.serial == "AB\\"C\\\\D")');
  });

  it('inserts numbers as numeric literals', () => {
    assert.equal(flux`range(start: ${1700000000})`.toString(), 'range(start: 1700000000)');
  });
});

describe('deletePredicate', () => {
  it('builds an exact-match predicate', () => {
    assert.equal(
      deletePredicate('benchmark_points', { run_id: '7' }),
      '_measurement="benchmark_points" AND run_id="7"',
    );
  });

  it('escapes quotes and backslashes in tag values', () => {
    assert.equal(
      deletePredicate('benchmark_points', { serial: 'S"N\\1' }),
      '_measurement="benchmark_points" AND serial="S\\"N\\\\1"',
    );
  });

  it('rejects tag keys that are not identifiers', () => {
    assert.throws(() => deletePredicate('m', { 'run_id" OR 1=1 OR x': '1' }), /Invalid tag key/);
  });

  it('rejects control characters in values', () => {
    assert.throws(() => deletePredicate('m', { serial: 'a\nb' }), /control characters/);
  });
});
