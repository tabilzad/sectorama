import '../test/env.js';
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../db/index.js';
import { scanDisks } from './diskDiscovery.js';
import { reconcileDrives } from './drivePresence.js';
import { getAlertHistory } from './notifications/notificationService.js';

before(() => {
  initDb();
});

describe('reconcileDrives', () => {
  it('reports new, missing and returning drives, and raises presence alerts', async () => {
    const all = await scanDisks();   // the three mock drives
    assert.equal(all.length, 3);

    const first = await reconcileDrives(all);
    assert.equal(first.added.length, 3);
    assert.equal(first.removed.length, 0);
    assert.equal(first.returned.length, 0);

    // The NVMe drive disappears from the host.
    const withoutNvme = all.filter(d => d.type !== 'NVMe');
    const second = await reconcileDrives(withoutNvme);
    assert.equal(second.added.length, 0);
    assert.equal(second.returned.length, 0);
    assert.deepEqual(second.removed.map(d => d.serialNumber), ['MOCK-NVME-003']);

    // Nothing changed: no churn.
    const steady = await reconcileDrives(withoutNvme);
    assert.deepEqual([steady.added.length, steady.removed.length, steady.returned.length], [0, 0, 0]);

    // It comes back.
    const third = await reconcileDrives(all);
    assert.deepEqual(third.returned.map(d => d.serialNumber), ['MOCK-NVME-003']);
    assert.equal(third.removed.length, 0);

    const history = await getAlertHistory(10);
    const presence = history.filter(h => h.driveSerial === 'MOCK-NVME-003').map(h => h.type);
    assert.deepEqual(presence, ['drive_returned', 'drive_missing']);   // newest first
    assert.match(history.find(h => h.type === 'drive_missing')!.message, /no longer detected/);
  });
});
