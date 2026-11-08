import { promises as fsp } from 'fs';
import path from 'path';
import type { DriveType } from '@sectorama/shared';

/** Minimal read-only filesystem access so the classifier can run against a fake sysfs in tests. */
export interface SysfsReader {
  realpath(p: string): Promise<string | null>;
  readFile(p: string): Promise<string | null>;
  readdir(p: string): Promise<string[]>;
  exists(p: string): Promise<boolean>;
}

export const nodeSysfsReader: SysfsReader = {
  realpath: p => fsp.realpath(p).catch(() => null),
  readFile: p => fsp.readFile(p, 'utf8').catch(() => null),
  readdir:  p => fsp.readdir(p).catch(() => [] as string[]),
  exists:   p => fsp.access(p).then(() => true, () => false),
};

/** How many layers of stacked devices (dm → md → disk) to walk before giving up. */
const MAX_DEPTH = 4;

/**
 * Classify a whole-disk sysfs directory such as …/block/sdb, …/nvme0/nvme0n1,
 * or …/virtual/block/dm-0.
 */
async function classifyDiskDir(diskDir: string, fs: SysfsReader, sysRoot: string, depth: number): Promise<DriveType> {
  const name = path.posix.basename(diskDir);
  if (name.startsWith('nvme')) return 'NVMe';

  // Stacked devices (dm-crypt, LVM, md-raid) list their members under slaves/.
  // Classify by the members; a mix of drive types has no single answer.
  const slaves = await fs.readdir(`${diskDir}/slaves`);
  if (slaves.length > 0) {
    if (depth >= MAX_DEPTH) return 'Unknown';
    const types = new Set<DriveType>();
    for (const slave of slaves) {
      types.add(await classifyByName(slave, fs, sysRoot, depth + 1));
    }
    return types.size === 1 ? [...types][0] : 'Unknown';
  }

  const rotational = (await fs.readFile(`${diskDir}/queue/rotational`))?.trim();
  if (rotational === '1') return 'HDD';
  if (rotational === '0') return 'SSD';
  return 'Unknown';
}

/** A partition directory lives inside its disk's directory and carries a `partition` file. */
async function classifyResolved(devDir: string, fs: SysfsReader, sysRoot: string, depth: number): Promise<DriveType> {
  const diskDir = (await fs.exists(`${devDir}/partition`)) ? path.posix.dirname(devDir) : devDir;
  return classifyDiskDir(diskDir, fs, sysRoot, depth);
}

/** Resolve a kernel device name (sdb, sdb1, dm-0) through /sys/class/block. */
async function classifyByName(name: string, fs: SysfsReader, sysRoot: string, depth: number): Promise<DriveType> {
  const devDir = await fs.realpath(`${sysRoot}/class/block/${name}`);
  return devDir ? classifyResolved(devDir, fs, sysRoot, depth) : 'Unknown';
}

/**
 * Classify the block device behind a mountinfo major:minor as HDD, SSD or NVMe.
 * sysfs is host-global even inside a container, so this works for any bind-mounted
 * host filesystem whose st_dev is a real block device. Returns 'Unknown' for
 * devices sysfs cannot explain (no slaves list, missing rotational flag, mixed pools).
 */
export async function classifyBlockDevice(
  majorMinor: string,
  fs: SysfsReader = nodeSysfsReader,
  sysRoot = '/sys',
): Promise<DriveType> {
  const devDir = await fs.realpath(`${sysRoot}/dev/block/${majorMinor}`);
  if (!devDir) return 'Unknown';
  return classifyResolved(devDir, fs, sysRoot, 0);
}
