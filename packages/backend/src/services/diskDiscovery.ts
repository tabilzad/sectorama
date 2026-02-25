import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { drives } from '../db/schema.js';
import { config } from '../config.js';
import type { DriveSummary, DriveType } from '@sectorama/shared';

const execFileAsync = promisify(execFile);

// ─── Smartctl JSON shapes ────────────────────────────────────────────────────

interface SmartctlScanDevice {
  name: string;         // e.g. "/dev/sda"
  info_name: string;
  type: string;         // e.g. "sat", "nvme", "scsi"
  protocol: string;
}

interface SmartctlScanResult {
  devices: SmartctlScanDevice[];
}

interface SmartctlInfoResult {
  device?: { name: string; type: string; protocol: string };
  model_name?: string;
  model_family?: string;
  serial_number?: string;
  firmware_version?: string;
  user_capacity?: { bytes: { n: number } };
  rotation_rate?: number;
  interface_speed?: { current?: { string: string } };
  logical_block_size?: number;
  physical_block_size?: number;
}

// ─── Mock drives for Windows dev ─────────────────────────────────────────────

const MOCK_DRIVES = [
  {
    serialNumber: 'MOCK-SSD-001',
    devicePath:   '/dev/mock0',
    vendor:       'Samsung',
    model:        '860 EVO 1TB',
    firmwareRevision: 'RVT21B6Q',
    capacity:     1_000_204_886_016,
    type:         'SSD' as DriveType,
    rpm:          null,
    interfaceType: 'SATA',
    logicalSectorSize:  512,
    physicalSectorSize: 512,
  },
  {
    serialNumber: 'MOCK-HDD-002',
    devicePath:   '/dev/mock1',
    vendor:       'Seagate',
    model:        'Barracuda 4TB',
    firmwareRevision: 'CC52',
    capacity:     4_000_787_030_016,
    type:         'HDD' as DriveType,
    rpm:          7200,
    interfaceType: 'SATA',
    logicalSectorSize:  512,
    physicalSectorSize: 4096,
  },
  {
    serialNumber: 'MOCK-NVME-003',
    devicePath:   '/dev/mock2',
    vendor:       'Western Digital',
    model:        'WD Black SN850 2TB',
    firmwareRevision: '614900WD',
    capacity:     2_000_398_934_016,
    type:         'NVMe' as DriveType,
    rpm:          null,
    interfaceType: 'NVMe',
    logicalSectorSize:  512,
    physicalSectorSize: 512,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runSmartctl(args: string[]): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync('smartctl', args);
    return JSON.parse(stdout);
  } catch (err: unknown) {
    // smartctl exits non-zero for warnings; try to parse stdout anyway
    const execErr = err as { stdout?: string; stderr?: string; code?: number };
    console.error(
      `[diskDiscovery] smartctl ${args.join(' ')} exited code=${execErr.code ?? '?'}`,
      execErr.stderr ? `\n  stderr: ${execErr.stderr.trim()}` : '',
    );
    if (execErr.stdout) {
      try { return JSON.parse(execErr.stdout); } catch { /* ignore */ }
    }
    throw err;
  }
}

function detectType(info: SmartctlInfoResult, scanType: string): DriveType {
  const proto = (info.device?.protocol ?? '').toLowerCase();
  if (proto === 'nvme' || scanType === 'nvme') return 'NVMe';
  const rotation = info.rotation_rate;
  if (rotation === 0 || rotation === null || rotation === undefined) return 'SSD';
  if (typeof rotation === 'number' && rotation > 0)                    return 'HDD';
  return 'Unknown';
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface DiscoveredDrive {
  serialNumber:      string;
  devicePath:        string;
  vendor:            string;
  model:             string;
  firmwareRevision:  string;
  capacity:          number;
  type:              DriveType;
  rpm:               number | null;
  interfaceType:     string | null;
  logicalSectorSize:  number | null;
  physicalSectorSize: number | null;
}

/** Scan host for physical disks using smartctl --scan */
export async function scanDisks(): Promise<DiscoveredDrive[]> {
  if (config.disk.mock) return MOCK_DRIVES;

  const scanResult = await runSmartctl(['--scan', '--json']) as SmartctlScanResult;
  const devices = scanResult.devices ?? [];
  console.log(`[diskDiscovery] smartctl --scan found ${devices.length} device(s):`,
    devices.map(d => `${d.name} (type=${d.type})`).join(', ') || 'none');

  const discovered: DiscoveredDrive[] = [];
  for (const dev of devices) {
    try {
      console.log(`[diskDiscovery] Querying info for ${dev.name}...`);
      const info = await runSmartctl(['--info', '--json', dev.name]) as SmartctlInfoResult;
      const serial = info.serial_number;
      if (!serial) {
        console.log(`[diskDiscovery] Skipping ${dev.name}: no serial number (virtual/unsupported device)`);
        continue;
      }

      const type = detectType(info, dev.type);
      const rotation = info.rotation_rate;

      // Capacity from smartctl; fall back to sysfs for drives that don't report it.
      // /sys/block/<devname>/size is always in 512-byte units on Linux.
      let capacity: number = info.user_capacity?.bytes?.n ?? 0;
      if (!capacity) {
        try {
          const devName = dev.name.split('/').pop() ?? '';
          const sectorCount = parseInt(readFileSync(`/sys/block/${devName}/size`, 'utf8').trim(), 10);
          if (!isNaN(sectorCount) && sectorCount > 0) {
            capacity = sectorCount * 512;
            console.log(`[diskDiscovery] ${dev.name}: smartctl missing capacity, got ${capacity} bytes from sysfs`);
          }
        } catch {
          console.error(`[diskDiscovery] ${dev.name}: could not read capacity from sysfs`);
        }
      }

      discovered.push({
        serialNumber:      serial,
        devicePath:        dev.name,
        vendor:            info.model_family ?? '',
        model:             info.model_name ?? '',
        firmwareRevision:  info.firmware_version ?? '',
        capacity,
        type,
        rpm:               (typeof rotation === 'number' && rotation > 0) ? rotation : null,
        interfaceType:     info.interface_speed?.current?.string ?? dev.type ?? null,
        logicalSectorSize:  info.logical_block_size ?? null,
        physicalSectorSize: info.physical_block_size ?? null,
      });
    } catch (err) {
      const e = err as { code?: number; stderr?: string; message?: string };
      console.error(
        `[diskDiscovery] Skipping ${dev.name} (exit code=${e.code ?? '?'}): ${e.message ?? String(err)}`,
        e.stderr ? `\n  stderr: ${e.stderr.trim()}` : '',
      );
    }
  }
  console.log(`[diskDiscovery] Registered ${discovered.length} usable drive(s)`);
  return discovered;
}

/** Upsert discovered drives into SQLite, mark missing ones as disconnected */
export async function registerDrives(discovered: DiscoveredDrive[]): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const foundSerials = new Set(discovered.map(d => d.serialNumber));

  // Upsert each discovered drive
  for (const d of discovered) {
    const existing = await db.query.drives.findFirst({
      where: eq(drives.serialNumber, d.serialNumber),
    });

    if (existing) {
      await db.update(drives)
        .set({
          devicePath:         d.devicePath,
          vendor:             d.vendor,
          model:              d.model,
          firmwareRevision:   d.firmwareRevision,
          capacity:           d.capacity,
          type:               d.type,
          rpm:                d.rpm,
          interfaceType:      d.interfaceType,
          logicalSectorSize:  d.logicalSectorSize,
          physicalSectorSize: d.physicalSectorSize,
          lastSeen:           now,
          isConnected:        true,
        })
        .where(eq(drives.serialNumber, d.serialNumber));
    } else {
      await db.insert(drives).values({
        serialNumber:       d.serialNumber,
        devicePath:         d.devicePath,
        vendor:             d.vendor,
        model:              d.model,
        firmwareRevision:   d.firmwareRevision,
        capacity:           d.capacity,
        type:               d.type,
        rpm:                d.rpm,
        interfaceType:      d.interfaceType,
        logicalSectorSize:  d.logicalSectorSize,
        physicalSectorSize: d.physicalSectorSize,
        firstSeen:          now,
        lastSeen:           now,
        isConnected:        true,
      });
    }
  }

  // Mark drives not found in this scan as disconnected
  const allDrives = await db.select().from(drives);
  for (const row of allDrives) {
    if (row.isConnected && !foundSerials.has(row.serialNumber)) {
      await db.update(drives)
        .set({ isConnected: false })
        .where(eq(drives.driveId, row.driveId));
    }
  }
}

/** Get a drive summary (no SMART data — use smartCache for that) */
export async function getDriveSummaries(): Promise<DriveSummary[]> {
  const db = getDb();
  const rows = await db.query.drives.findMany({
    with: { smartCache: true },
  });
  return rows.map(row => {
    const sc = (row as typeof row & { smartCache?: { healthPassed?: boolean | null; temperature?: number | null; polledAt?: string | null } }).smartCache;
    return {
      driveId:          row.driveId,
      serialNumber:     row.serialNumber,
      devicePath:       row.devicePath,
      vendor:           row.vendor,
      model:            row.model,
      capacity:         row.capacity,
      type:             row.type as import('@sectorama/shared').DriveType,
      isConnected:      row.isConnected,
      health:           sc?.healthPassed === false ? 'failed'
                      : sc?.healthPassed === true  ? 'ok'
                      : 'unknown' as import('@sectorama/shared').DriveHealth,
      temperature:      sc?.temperature ?? null,
      lastSmartPoll:    sc?.polledAt ?? null,
      lastBenchmarkRun: null,
    };
  });
}
