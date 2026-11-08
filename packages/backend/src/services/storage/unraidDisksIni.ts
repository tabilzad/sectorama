import type { DriveType } from '@sectorama/shared';

export interface UnraidDisk {
  /** Slot name: parity, disk1, cache, flash, … */
  name: string;
  /** Kernel device name: sdb, nvme0n1, … */
  device: string;
  /** Slot role as Unraid reports it: Data, Parity, Cache, Flash, … */
  role: string;
  type: DriveType;
  fsMounted: boolean;
  fsSizeBytes: number | null;
  fsUsedBytes: number | null;
  fsFreeBytes: number | null;
}

const KIB = 1024;

/** disks.ini size fields are in 1 KiB blocks. */
function kibToBytes(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n * KIB : null;
}

export function driveTypeFromUnraid(device: string, rotational: string | undefined): DriveType {
  if (device.startsWith('nvme')) return 'NVMe';
  if (rotational === '1') return 'HDD';
  if (rotational === '0') return 'SSD';
  return 'Unknown';
}

/**
 * Parse Unraid's /var/local/emhttp/disks.ini. emhttp rewrites this file as the
 * array state changes; it holds one ["slot"] section per device with
 * key="value" lines, including the mounted filesystem's size/used/free.
 */
export function parseDisksIni(text: string): UnraidDisk[] {
  const sections: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const header = /^\[\s*"?([^"\]]+?)"?\s*\]$/.exec(line);
    if (header) {
      current = { name: header[1] };
      sections.push(current);
      continue;
    }
    if (!current) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    current[key] = value;
  }

  return sections.map(s => {
    const device      = s['device'] ?? '';
    const fsSizeBytes = kibToBytes(s['fsSize']);
    const fsFreeBytes = kibToBytes(s['fsFree']);
    const fsUsedBytes = kibToBytes(s['fsUsed'])
      ?? (fsSizeBytes !== null && fsFreeBytes !== null ? fsSizeBytes - fsFreeBytes : null);
    return {
      name:      s['name'] ?? '',
      device,
      role:      s['type'] ?? '',
      type:      driveTypeFromUnraid(device, s['rotational']),
      fsMounted: (s['fsStatus'] ?? '').toLowerCase() === 'mounted',
      fsSizeBytes,
      fsUsedBytes,
      fsFreeBytes,
    };
  });
}
