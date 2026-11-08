import '../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isStandbyResult } from './smartService.js';

// Shapes as smartctl 7.x prints them with --json when it exits early.
const STANDBY = {
  smartctl: {
    exit_status: 2,
    messages: [{ string: 'Device is in STANDBY mode, exit(2)', severity: 'error' }],
  },
};

const SLEEP = {
  smartctl: {
    exit_status: 2,
    messages: [{ string: 'Device is in SLEEP mode, exit(2)', severity: 'error' }],
  },
};

const OPEN_FAILED = {
  smartctl: {
    exit_status: 2,
    messages: [{ string: 'Smartctl open device: /dev/sdz failed: No such device', severity: 'error' }],
  },
};

const FAILING_ATTRIBUTE = {
  smartctl: { exit_status: 64, messages: [] },
  smart_status: { passed: true },
};

describe('isStandbyResult', () => {
  it('recognises the standby and sleep skips produced by --nocheck=standby', () => {
    assert.equal(isStandbyResult(STANDBY, 2), true);
    assert.equal(isStandbyResult(SLEEP, 2), true);
  });

  it('does not mistake a failed device open for standby, even with the same exit bit', () => {
    assert.equal(isStandbyResult(OPEN_FAILED, 2), false);
  });

  it('ignores other non-zero exits such as failing attributes', () => {
    assert.equal(isStandbyResult(FAILING_ATTRIBUTE, 64), false);
  });

  it('falls back to the process exit code when the JSON carries no exit_status', () => {
    const noStatus = { smartctl: { messages: [{ string: 'Device is in STANDBY mode, exit(2)', severity: 'error' }] } };
    assert.equal(isStandbyResult(noStatus, 2), true);
    assert.equal(isStandbyResult(noStatus, 0), false);
  });
});
