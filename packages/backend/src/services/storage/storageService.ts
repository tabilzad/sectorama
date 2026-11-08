import { promises as fsp } from 'fs';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { drives } from '../../db/schema.js';
import { config } from '../../config.js';
import { parseMountInfo } from './mountinfo.js';
import { parseDisksIni } from './unraidDisksIni.js';
import { classifyBlockDevice, nodeSysfsReader, type SysfsReader } from './sysfsBlock.js';
import type {
  DriveType,
  StorageOverview,
  StorageClassSummary,
  StorageUsageSource,
  UnattributedStorage,
} from '@sectorama/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A registered, connected drive — the subset of the registry this service needs. */
export interface RegistryDrive {
  type: string;
  capacity: number;
}

export interface MeasuredFilesystem {
  type: DriveType;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
}

export interface UsageSample {
  source: StorageUsageSource;
  filesystems: MeasuredFilesystem[];
}

export interface FilesystemUsage {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
}

/** OS access the collector needs, injectable so the logic can be tested on any platform. */
export interface StorageHost {
  readFile(p: string): Promise<string | null>;
  statfs(p: string): Promise<FilesystemUsage | null>;
  sysfs: SysfsReader;
}

export const nodeStorageHost: StorageHost = {
  readFile: p => fsp.readFile(p, 'utf8').catch(() => null),
  statfs: async p => {
    try {
      const s = await fsp.statfs(p);
      return {
        totalBytes: s.blocks * s.bsize,
        usedBytes:  (s.blocks - s.bfree) * s.bsize,
        // bavail excludes blocks reserved for root — what df reports as "Avail".
        freeBytes:  s.bavail * s.bsize,
      };
    } catch {
      return null;
    }
  },
  sysfs: nodeSysfsReader,
};

// ─── Usage sources ────────────────────────────────────────────────────────────

/**
 * Unraid: disks.ini already carries per-slot filesystem totals, so no mounts
 * are needed. Parity has no filesystem and the flash (boot USB) is not storage.
 * Only mounted slots with a size are counted, which also skips secondary pool
 * members that report the pool through their first device.
 */
export function usageFromUnraid(iniText: string): MeasuredFilesystem[] {
  return parseDisksIni(iniText)
    .filter(d =>
      d.role !== 'Flash' && d.name !== 'flash' &&
      d.fsMounted && d.fsSizeBytes !== null && d.fsSizeBytes > 0,
    )
    .map(d => ({
      type:       d.type,
      totalBytes: d.fsSizeBytes!,
      usedBytes:  d.fsUsedBytes ?? 0,
      freeBytes:  d.fsFreeBytes ?? 0,
    }));
}

// Device majors that never back real storage: 0 = pseudo / FUSE / anonymous
// (btrfs, zfs), 1 = ramdisk, 7 = loop.
const SKIP_MAJORS = new Set(['0', '1', '7']);

/**
 * Generic Linux: every filesystem mounted under `mountRoot` that sits on a real
 * block device is measured with statfs and attributed to a drive type via sysfs.
 * Filesystems the container sees twice (bind mounts) are counted once.
 */
export async function usageFromMounts(
  mountInfoText: string,
  mountRoot: string,
  host: StorageHost,
): Promise<MeasuredFilesystem[]> {
  const root = mountRoot.replace(/\/+$/, '') || '/';
  const seen = new Set<string>();
  const result: MeasuredFilesystem[] = [];

  for (const mount of parseMountInfo(mountInfoText)) {
    const underRoot = root === '/' || mount.mountPoint === root || mount.mountPoint.startsWith(`${root}/`);
    if (!underRoot) continue;
    if (SKIP_MAJORS.has(mount.majorMinor.split(':')[0])) continue;
    if (seen.has(mount.majorMinor)) continue;
    seen.add(mount.majorMinor);

    const usage = await host.statfs(mount.mountPoint);
    if (!usage || usage.totalBytes <= 0) continue;

    const type = await classifyBlockDevice(mount.majorMinor, host.sysfs);
    result.push({ type, ...usage });
  }
  return result;
}

/** Synthetic usage for Windows/macOS development: a plausible fill level per drive class. */
function mockUsage(registry: RegistryDrive[]): MeasuredFilesystem[] {
  const fill: Record<string, number> = { HDD: 0.74, SSD: 0.61, NVMe: 0.38 };
  return registry.map(d => {
    const total = Math.round(d.capacity * 0.97);
    const used  = Math.round(total * (fill[d.type] ?? 0.5));
    return { type: d.type as DriveType, totalBytes: total, usedBytes: used, freeBytes: total - used };
  });
}

/** Pick the best available usage source: mock → Unraid disks.ini → mounted filesystems → nothing. */
export async function collectUsage(registry: RegistryDrive[], host: StorageHost = nodeStorageHost): Promise<UsageSample> {
  if (config.disk.mock) {
    return { source: 'mock', filesystems: mockUsage(registry) };
  }

  const ini = await host.readFile(`${config.storage.unraidEmhttpDir}/disks.ini`);
  if (ini !== null) {
    return { source: 'unraid', filesystems: usageFromUnraid(ini) };
  }

  const mountInfo = await host.readFile('/proc/self/mountinfo');
  if (mountInfo !== null) {
    const filesystems = await usageFromMounts(mountInfo, config.storage.mountRoot, host);
    if (filesystems.length > 0) return { source: 'linux', filesystems };
  }

  return { source: 'none', filesystems: [] };
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

const CLASS_ORDER: DriveType[] = ['HDD', 'SSD', 'NVMe', 'Unknown'];

function asDriveType(value: string): DriveType {
  return (CLASS_ORDER as string[]).includes(value) ? (value as DriveType) : 'Unknown';
}

/** Combine registry capacity with measured usage into one summary per drive class. */
export function buildOverview(registry: RegistryDrive[], sample: UsageSample, now = new Date()): StorageOverview {
  const byType = new Map<DriveType, StorageClassSummary>();
  const summary = (type: DriveType): StorageClassSummary => {
    let s = byType.get(type);
    if (!s) {
      s = {
        type, driveCount: 0, rawCapacityBytes: 0, filesystemCount: 0,
        fsTotalBytes: null, fsUsedBytes: null, fsFreeBytes: null,
      };
      byType.set(type, s);
    }
    return s;
  };

  for (const drive of registry) {
    const s = summary(asDriveType(drive.type));
    s.driveCount += 1;
    s.rawCapacityBytes += drive.capacity;
  }

  let unattributed: UnattributedStorage | null = null;
  for (const fs of sample.filesystems) {
    if (fs.type === 'Unknown') {
      unattributed ??= { filesystemCount: 0, fsTotalBytes: 0, fsUsedBytes: 0, fsFreeBytes: 0 };
      unattributed.filesystemCount += 1;
      unattributed.fsTotalBytes += fs.totalBytes;
      unattributed.fsUsedBytes  += fs.usedBytes;
      unattributed.fsFreeBytes  += fs.freeBytes;
      continue;
    }
    const s = summary(fs.type);
    s.filesystemCount += 1;
    s.fsTotalBytes = (s.fsTotalBytes ?? 0) + fs.totalBytes;
    s.fsUsedBytes  = (s.fsUsedBytes  ?? 0) + fs.usedBytes;
    s.fsFreeBytes  = (s.fsFreeBytes  ?? 0) + fs.freeBytes;
  }

  return {
    generatedAt:  now.toISOString(),
    usageSource:  sample.source,
    classes:      CLASS_ORDER.filter(t => byType.has(t)).map(t => byType.get(t)!),
    unattributed,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getStorageOverview(host: StorageHost = nodeStorageHost): Promise<StorageOverview> {
  const registry = await getDb()
    .select({ type: drives.type, capacity: drives.capacity })
    .from(drives)
    .where(eq(drives.isConnected, true));
  const sample = await collectUsage(registry, host);
  return buildOverview(registry, sample);
}
