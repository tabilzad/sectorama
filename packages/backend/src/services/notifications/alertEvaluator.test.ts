import '../../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAlerts } from './alertEvaluator.js';
import type { SmartCacheRow } from '../../db/schema.js';
import type { SmartAttribute, SmartReading } from '@sectorama/shared';

const DRIVE = { driveId: 1, serial: 'SER-1', model: 'Model X' };

function reading(overrides: Partial<SmartReading> = {}): SmartReading {
  return {
    driveId: 1, timestamp: '2026-01-01T00:00:00.000Z',
    temperature: 35, powerOnHours: 100, powerCycleCount: 10,
    reallocatedSectors: 0, pendingSectors: 0, uncorrectableErrors: 0,
    healthPassed: true, attributes: [],
    ...overrides,
  };
}

function cache(overrides: Partial<SmartCacheRow> = {}, attributes: SmartAttribute[] = []): SmartCacheRow {
  return {
    driveId: 1, polledAt: '2025-12-31T23:55:00.000Z',
    temperature: 35, powerOnHours: 99, powerCycleCount: 10,
    reallocatedSectors: 0, pendingSectors: 0, uncorrectableErrors: 0,
    healthPassed: true,
    attributesJson: JSON.stringify(attributes),
    ...overrides,
  };
}

// `warn` is the NVMe parser's advisory tier; it is read structurally by the evaluator.
function attr(partial: Partial<SmartAttribute> & { attrId: number; name: string; warn?: boolean }): SmartAttribute {
  return { value: 100, worst: 100, threshold: 0, rawValue: 0, failing: false, ...partial };
}

const types = (alerts: ReturnType<typeof evaluateAlerts>) => alerts.map(a => a.type);

describe('evaluateAlerts — growth counters', () => {
  it('fires once when a counter increases, with the old and new values', () => {
    const alerts = evaluateAlerts(DRIVE, reading({ reallocatedSectors: 8 }), cache({ reallocatedSectors: 3 }), 50);
    assert.deepEqual(types(alerts), ['smart_attribute']);
    assert.equal(alerts[0].attribute, 'Reallocated sectors');
    assert.equal(alerts[0].previousValue, 3);
    assert.equal(alerts[0].value, 8);
    assert.match(alerts[0].message, /increased from 3 to 8/);
  });

  it('stays silent while a counter is unchanged or decreases', () => {
    assert.deepEqual(types(evaluateAlerts(DRIVE, reading({ pendingSectors: 4 }), cache({ pendingSectors: 4 }), 50)), []);
    assert.deepEqual(types(evaluateAlerts(DRIVE, reading({ pendingSectors: 2 }), cache({ pendingSectors: 4 }), 50)), []);
  });

  it('reports a non-zero counter once when there is no baseline, and never for zero', () => {
    const first = evaluateAlerts(DRIVE, reading({ uncorrectableErrors: 2 }), undefined, 50);
    assert.deepEqual(types(first), ['smart_attribute']);
    assert.match(first[0].message, /no earlier reading/);
    assert.deepEqual(types(evaluateAlerts(DRIVE, reading(), undefined, 50)), []);
  });

  it('reports each counter that grew in the same poll', () => {
    const alerts = evaluateAlerts(
      DRIVE,
      reading({ reallocatedSectors: 1, pendingSectors: 5, uncorrectableErrors: 1 }),
      cache(),
      50,
    );
    assert.deepEqual(alerts.map(a => a.attribute), ['Reallocated sectors', 'Pending sectors', 'Uncorrectable errors']);
  });
});

describe('evaluateAlerts — attribute flags', () => {
  it('fires when an ATA attribute starts reporting failure and not again while it stays failed', () => {
    const failing = attr({ attrId: 5, name: 'Reallocated_Sector_Ct', value: 30, threshold: 36, rawValue: 120, failing: true });
    const first = evaluateAlerts(DRIVE, reading({ attributes: [failing] }), cache({}, [attr({ attrId: 5, name: 'Reallocated_Sector_Ct' })]), 50);
    assert.deepEqual(types(first), ['smart_attribute']);
    assert.match(first[0].message, /Reallocated_Sector_Ct is reporting failure/);
    assert.equal(first[0].threshold, 36);

    const again = evaluateAlerts(DRIVE, reading({ attributes: [failing] }), cache({}, [failing]), 50);
    assert.deepEqual(types(again), []);
  });

  it('fires for NVMe critical warning bits and spare below threshold via the failing flag', () => {
    const critical = attr({ attrId: 1, name: 'Critical Warning', value: 4, rawValue: 4, failing: true });
    const spare    = attr({ attrId: 2, name: 'Available Spare %', value: 5, threshold: 10, rawValue: 5, failing: true });
    const alerts = evaluateAlerts(DRIVE, reading({ attributes: [critical, spare] }), cache(), 50);
    assert.deepEqual(alerts.map(a => a.attribute), ['Critical Warning', 'Available Spare %']);
  });

  it('fires once for the advisory tier, e.g. NVMe wear reaching 90 %', () => {
    const worn = attr({ attrId: 3, name: 'Percentage Used', value: 91, rawValue: 91, warn: true });
    const first = evaluateAlerts(DRIVE, reading({ attributes: [worn] }), cache({}, [attr({ attrId: 3, name: 'Percentage Used', rawValue: 89 })]), 50);
    assert.deepEqual(types(first), ['smart_attribute']);
    assert.match(first[0].message, /needs attention/);
    assert.deepEqual(types(evaluateAlerts(DRIVE, reading({ attributes: [worn] }), cache({}, [worn]), 50)), []);
  });

  it('tolerates a corrupt cached attribute list', () => {
    const alerts = evaluateAlerts(DRIVE, reading(), cache({ attributesJson: '{not json' }), 50);
    assert.deepEqual(types(alerts), []);
  });
});

describe('evaluateAlerts — existing rules still hold', () => {
  it('fires smart_error on the passing → failing transition only', () => {
    assert.deepEqual(types(evaluateAlerts(DRIVE, reading({ healthPassed: false }), cache(), 50)), ['smart_error']);
    assert.deepEqual(types(evaluateAlerts(DRIVE, reading({ healthPassed: false }), cache({ healthPassed: false }), 50)), []);
  });

  it('fires temperature and recovery on threshold crossings', () => {
    assert.deepEqual(types(evaluateAlerts(DRIVE, reading({ temperature: 55 }), cache({ temperature: 45 }), 50)), ['temperature']);
    assert.deepEqual(types(evaluateAlerts(DRIVE, reading({ temperature: 45 }), cache({ temperature: 55 }), 50)), ['temperature_recovery']);
    assert.deepEqual(types(evaluateAlerts(DRIVE, reading({ temperature: 55 }), cache({ temperature: 56 }), 50)), []);
  });
});
