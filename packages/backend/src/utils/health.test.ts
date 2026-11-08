import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveHealth, PENDING_SECTORS_WARNING_THRESHOLD, type HealthSignals } from '@sectorama/shared';
import { healthFromCache, parseCachedAttributes } from './smartCache.js';

const passing: HealthSignals = {
  healthPassed: true, reallocatedSectors: 0, pendingSectors: 0, uncorrectableErrors: 0, attributes: [],
};

describe('deriveHealth', () => {
  it('is failed whenever the overall self-assessment failed, regardless of anything else', () => {
    assert.equal(deriveHealth({ ...passing, healthPassed: false }), 'failed');
    assert.equal(deriveHealth({ healthPassed: false, reallocatedSectors: null, pendingSectors: null, uncorrectableErrors: null }), 'failed');
  });

  it('is ok when the device passes and nothing is raised', () => {
    assert.equal(deriveHealth(passing), 'ok');
    assert.equal(deriveHealth({ ...passing, attributes: undefined }), 'ok');
    assert.equal(deriveHealth({ ...passing, reallocatedSectors: null, pendingSectors: null, uncorrectableErrors: null }), 'ok');
  });

  it('is warning on growth counters, with the pending-sector threshold honoured', () => {
    assert.equal(deriveHealth({ ...passing, reallocatedSectors: 1 }), 'warning');
    assert.equal(deriveHealth({ ...passing, uncorrectableErrors: 1 }), 'warning');
    assert.equal(deriveHealth({ ...passing, pendingSectors: PENDING_SECTORS_WARNING_THRESHOLD }), 'ok');
    assert.equal(deriveHealth({ ...passing, pendingSectors: PENDING_SECTORS_WARNING_THRESHOLD + 1 }), 'warning');
  });

  it('is warning when the device passes but flags an attribute as failing, e.g. ATA "in the past"', () => {
    assert.equal(deriveHealth({ ...passing, attributes: [{ failing: true }] }), 'warning');
  });

  it('is warning on an advisory attribute, e.g. NVMe wear at 90 %', () => {
    assert.equal(deriveHealth({ ...passing, attributes: [{ failing: false, warn: true }] }), 'warning');
    assert.equal(deriveHealth({ ...passing, attributes: [{ failing: false, warn: false }, { failing: false }] }), 'ok');
  });

  it('is unknown without a self-assessment, unless something is already raised', () => {
    assert.equal(deriveHealth({ ...passing, healthPassed: null }), 'unknown');
    assert.equal(deriveHealth({ ...passing, healthPassed: null, attributes: [{ failing: true }] }), 'warning');
  });
});

describe('healthFromCache', () => {
  const row = {
    healthPassed: true, reallocatedSectors: 0, pendingSectors: 0, uncorrectableErrors: 0, attributesJson: null as string | null,
  };

  it('reads the flags out of the stored attribute JSON', () => {
    const warn = JSON.stringify([{ attrId: 3, name: 'Percentage Used', value: 93, worst: 93, threshold: 0, rawValue: 93, failing: false, warn: true }]);
    assert.equal(healthFromCache({ ...row, attributesJson: warn }), 'warning');
    assert.equal(healthFromCache({ ...row, attributesJson: '[]' }), 'ok');
  });

  it('treats a missing row as unknown and a corrupt attribute list as empty', () => {
    assert.equal(healthFromCache(null), 'unknown');
    assert.equal(healthFromCache({ ...row, attributesJson: '{not json' }), 'ok');
    assert.deepEqual(parseCachedAttributes('{"a":1}'), []);
    assert.deepEqual(parseCachedAttributes(undefined), []);
  });
});
