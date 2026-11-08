import '../../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMountInfo } from './mountinfo.js';
import { parseDisksIni } from './unraidDisksIni.js';
import { classifyBlockDevice, type SysfsReader } from './sysfsBlock.js';
import {
  usageFromUnraid,
  usageFromMounts,
  buildOverview,
  type StorageHost,
  type FilesystemUsage,
} from './storageService.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function fakeSysfs(spec: {
  links?: Record<string, string>;
  files?: Record<string, string>;
  dirs?:  Record<string, string[]>;
}): SysfsReader {
  const links = spec.links ?? {};
  const files = spec.files ?? {};
  const dirs  = spec.dirs  ?? {};
  const exists = (p: string) => p in files || p in dirs || p in links;
  return {
    realpath: async p => links[p] ?? (exists(p) ? p : null),
    readFile: async p => files[p] ?? null,
    readdir:  async p => dirs[p] ?? [],
    exists:   async p => exists(p),
  };
}

const SYSFS = fakeSysfs({
  links: {
    '/sys/dev/block/8:17':   '/sys/devices/pci0/host0/block/sdb/sdb1',          // HDD partition
    '/sys/dev/block/259:1':  '/sys/devices/pci0/nvme/nvme0/nvme0n1/nvme0n1p1',  // NVMe partition
    '/sys/dev/block/253:0':  '/sys/devices/virtual/block/dm-0',                 // dm-crypt over sdc
    '/sys/dev/block/9:1':    '/sys/devices/virtual/block/md1/md1p1',            // md over mixed members
    '/sys/class/block/sdc':  '/sys/devices/pci0/host0/block/sdc',
    '/sys/class/block/sdd':  '/sys/devices/pci0/host0/block/sdd',
    '/sys/class/block/sde':  '/sys/devices/pci0/host0/block/sde',
  },
  files: {
    '/sys/devices/pci0/host0/block/sdb/sdb1/partition':            '1',
    '/sys/devices/pci0/host0/block/sdb/queue/rotational':          '1\n',
    '/sys/devices/pci0/nvme/nvme0/nvme0n1/nvme0n1p1/partition':    '1',
    '/sys/devices/pci0/host0/block/sdc/queue/rotational':          '0\n',
    '/sys/devices/virtual/block/md1/md1p1/partition':              '1',
    '/sys/devices/pci0/host0/block/sdd/queue/rotational':          '1\n',
    '/sys/devices/pci0/host0/block/sde/queue/rotational':          '0\n',
  },
  dirs: {
    '/sys/devices/virtual/block/dm-0/slaves': ['sdc'],
    '/sys/devices/virtual/block/md1/slaves':  ['sdd', 'sde'],
  },
});

const MOUNTINFO = [
  '20 1 0:19  / /mnt/user rw - fuse.shfs shfs rw',
  '21 1 8:17  / /mnt/disk1 rw,noatime - xfs /dev/md1p1 rw',
  '22 1 259:1 / /mnt/cache rw - xfs /dev/nvme0n1p1 rw',
  '23 1 8:17  /sub /mnt/disk1-again rw - xfs /dev/md1p1 rw',
  '24 1 8:3   / /data rw - ext4 /dev/sda3 rw',
  '25 1 7:0   / /mnt/loop rw - ext4 /dev/loop0 rw',
  '26 1 253:0 / /mnt/secure\\040vault rw shared:5 master:2 - ext4 /dev/mapper/vault rw',
].join('\n');

const STATFS: Record<string, FilesystemUsage> = {
  '/mnt/disk1':        { totalBytes: 1000, usedBytes: 700, freeBytes: 300 },
  '/mnt/cache':        { totalBytes: 2000, usedBytes: 500, freeBytes: 1500 },
  '/mnt/secure vault': { totalBytes: 400,  usedBytes: 100, freeBytes: 300 },
  '/mnt/loop':         { totalBytes: 50,   usedBytes: 10,  freeBytes: 40 },
  '/data':             { totalBytes: 99,   usedBytes: 9,   freeBytes: 90 },
};

const HOST: StorageHost = {
  readFile: async () => null,
  statfs:   async p => STATFS[p] ?? null,
  sysfs:    SYSFS,
};

const DISKS_INI = `
["parity"]
name="parity"
device="sdb"
size="13672382412"
rotational="1"
type="Parity"
fsStatus="-"
["disk1"]
name="disk1"
device="sdc"
rotational="1"
type="Data"
fsStatus="Mounted"
fsType="xfs"
fsSize="13671666496"
fsFree="3000000000"
fsUsed="10671666496"
["cache"]
name="cache"
device="nvme0n1"
rotational="0"
type="Cache"
fsStatus="Mounted"
fsType="btrfs"
fsSize="976762584"
fsFree="476762584"
["cache2"]
name="cache2"
device="nvme1n1"
rotational="0"
type="Cache"
fsStatus="-"
["flash"]
name="flash"
device="sda"
rotational="0"
type="Flash"
fsStatus="Mounted"
fsType="vfat"
fsSize="15000000"
fsFree="14000000"
`;

// ─── mountinfo ────────────────────────────────────────────────────────────────

describe('parseMountInfo', () => {
  it('extracts major:minor, mount point, fs type and source', () => {
    const [first] = parseMountInfo('36 35 98:0 /mnt1 /mnt2 rw,noatime master:1 - ext3 /dev/root rw,errors=continue');
    assert.deepEqual(first, { majorMinor: '98:0', mountPoint: '/mnt2', fsType: 'ext3', source: '/dev/root' });
  });

  it('decodes octal escapes in paths and tolerates optional fields', () => {
    const entries = parseMountInfo(MOUNTINFO);
    assert.equal(entries.length, 7);
    assert.equal(entries[6].mountPoint, '/mnt/secure vault');
    assert.equal(entries[6].fsType, 'ext4');
  });

  it('skips blank and malformed lines', () => {
    assert.equal(parseMountInfo('\n\nnot a mount line\n').length, 0);
  });
});

// ─── Unraid disks.ini ─────────────────────────────────────────────────────────

describe('parseDisksIni', () => {
  it('reads every slot with its role, drive type and KiB-scaled filesystem figures', () => {
    const disks = parseDisksIni(DISKS_INI);
    assert.deepEqual(disks.map(d => d.name), ['parity', 'disk1', 'cache', 'cache2', 'flash']);

    const disk1 = disks[1];
    assert.equal(disk1.type, 'HDD');
    assert.equal(disk1.role, 'Data');
    assert.equal(disk1.fsMounted, true);
    assert.equal(disk1.fsSizeBytes, 13671666496 * 1024);
    assert.equal(disk1.fsUsedBytes, 10671666496 * 1024);

    const cache = disks[2];
    assert.equal(cache.type, 'NVMe');
    // fsUsed missing → derived from size - free
    assert.equal(cache.fsUsedBytes, (976762584 - 476762584) * 1024);
  });
});

describe('usageFromUnraid', () => {
  it('counts mounted data and pool slots only', () => {
    const fs = usageFromUnraid(DISKS_INI);
    assert.deepEqual(fs.map(f => f.type), ['HDD', 'NVMe']);   // parity, cache2 (unmounted) and flash excluded
    assert.equal(fs[1].freeBytes, 476762584 * 1024);
  });
});

// ─── sysfs classification ─────────────────────────────────────────────────────

describe('classifyBlockDevice', () => {
  it('walks a partition up to its rotational disk', async () => {
    assert.equal(await classifyBlockDevice('8:17', SYSFS), 'HDD');
  });

  it('recognises NVMe by device name', async () => {
    assert.equal(await classifyBlockDevice('259:1', SYSFS), 'NVMe');
  });

  it('classifies a stacked device by its slaves', async () => {
    assert.equal(await classifyBlockDevice('253:0', SYSFS), 'SSD');
  });

  it('returns Unknown for mixed members or devices sysfs cannot resolve', async () => {
    assert.equal(await classifyBlockDevice('9:1', SYSFS), 'Unknown');
    assert.equal(await classifyBlockDevice('8:99', SYSFS), 'Unknown');
  });
});

// ─── Mount-based usage ────────────────────────────────────────────────────────

describe('usageFromMounts', () => {
  it('measures each real filesystem under the mount root once and attributes it to a drive type', async () => {
    const fs = await usageFromMounts(MOUNTINFO, '/mnt', HOST);
    assert.deepEqual(fs, [
      { type: 'HDD',  totalBytes: 1000, usedBytes: 700, freeBytes: 300 },
      { type: 'NVMe', totalBytes: 2000, usedBytes: 500, freeBytes: 1500 },
      { type: 'SSD',  totalBytes: 400,  usedBytes: 100, freeBytes: 300 },
    ]);
    // FUSE (0:19), the bind-mount duplicate (8:17 again), loop (7:0) and /data (outside /mnt) are all excluded.
  });

  it('honours a different mount root', async () => {
    const fs = await usageFromMounts(MOUNTINFO, '/data', HOST);
    assert.equal(fs.length, 1);
    assert.equal(fs[0].totalBytes, 99);
  });
});

// ─── Aggregation ──────────────────────────────────────────────────────────────

describe('buildOverview', () => {
  const registry = [
    { type: 'HDD',  capacity: 4_000_000_000_000 },
    { type: 'HDD',  capacity: 4_000_000_000_000 },
    { type: 'NVMe', capacity: 2_000_000_000_000 },
  ];

  it('merges registry capacity with measured usage per class, in fixed class order', () => {
    const overview = buildOverview(registry, {
      source: 'linux',
      filesystems: [
        { type: 'HDD',     totalBytes: 1000, usedBytes: 700, freeBytes: 300 },
        { type: 'NVMe',    totalBytes: 2000, usedBytes: 500, freeBytes: 1500 },
        { type: 'SSD',     totalBytes: 400,  usedBytes: 100, freeBytes: 300 },
        { type: 'Unknown', totalBytes: 50,   usedBytes: 20,  freeBytes: 30 },
      ],
    }, new Date('2026-01-01T00:00:00Z'));

    assert.equal(overview.usageSource, 'linux');
    assert.equal(overview.generatedAt, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(overview.classes.map(c => c.type), ['HDD', 'SSD', 'NVMe']);

    const [hdd, ssd, nvme] = overview.classes;
    assert.equal(hdd.driveCount, 2);
    assert.equal(hdd.rawCapacityBytes, 8_000_000_000_000);
    assert.equal(hdd.filesystemCount, 1);
    assert.equal(hdd.fsUsedBytes, 700);

    // Measured usage on a class with no registered drives still shows up.
    assert.equal(ssd.driveCount, 0);
    assert.equal(ssd.fsTotalBytes, 400);

    assert.equal(nvme.driveCount, 1);
    assert.equal(nvme.fsFreeBytes, 1500);

    assert.deepEqual(overview.unattributed, { filesystemCount: 1, fsTotalBytes: 50, fsUsedBytes: 20, fsFreeBytes: 30 });
  });

  it('reports raw capacity with null usage when nothing could be measured', () => {
    const overview = buildOverview(registry, { source: 'none', filesystems: [] });
    assert.equal(overview.usageSource, 'none');
    assert.equal(overview.unattributed, null);
    for (const c of overview.classes) {
      assert.equal(c.filesystemCount, 0);
      assert.equal(c.fsTotalBytes, null);
      assert.ok(c.rawCapacityBytes > 0);
    }
  });
});
