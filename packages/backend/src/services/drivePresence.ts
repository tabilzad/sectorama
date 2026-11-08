import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { drives } from '../db/schema.js';
import { config } from '../config.js';
import { broadcast } from '../ws/liveFeed.js';
import {
  scanDisks,
  scanDevicePaths,
  registerDrives,
  getDriveSummaries,
  type DiscoveredDrive,
  type DriveChanges,
} from './diskDiscovery.js';
import { notifyDrivePresence } from './notifications/notificationService.js';

/**
 * Register a discovery result and act on what changed: broadcast drive
 * detection / removal to live clients and raise drive_missing / drive_returned
 * alerts. Used at startup (so a drive that vanished while the service was down
 * is reported) and whenever the periodic presence check sees a difference.
 */
export async function reconcileDrives(discovered: DiscoveredDrive[]): Promise<DriveChanges> {
  const changes = await registerDrives(discovered);

  const appeared = [...changes.added, ...changes.returned];
  if (appeared.length > 0) {
    const summaries = await getDriveSummaries();
    for (const drive of appeared) {
      const summary = summaries.find(s => s.driveId === drive.driveId);
      if (summary) broadcast({ type: 'disk_detected', drive: summary });
    }
  }

  for (const drive of changes.removed) {
    broadcast({ type: 'disk_removed', driveId: drive.driveId });
    await notifyDrivePresence(drive, 'drive_missing');
  }
  for (const drive of changes.returned) {
    await notifyDrivePresence(drive, 'drive_returned');
  }

  return changes;
}

/**
 * Cheap presence check run before every SMART poll: compare the device paths
 * the host currently lists against the connected drives in the registry. Only
 * when something differs is a full discovery (one IDENTIFY per device) run and
 * reconciled, so the steady state costs a single `smartctl --scan`, which opens
 * no device and therefore wakes nothing.
 */
export async function checkDrivePresence(): Promise<DriveChanges | null> {
  if (config.disk.mock) return null;

  const present   = await scanDevicePaths();
  const connected = await getDb()
    .select({ devicePath: drives.devicePath })
    .from(drives)
    .where(eq(drives.isConnected, true));
  const knownPaths = new Set(connected.map(r => r.devicePath));

  const somethingMissing = [...knownPaths].some(p => !present.has(p));
  const somethingNew     = [...present].some(p => !knownPaths.has(p));
  if (!somethingMissing && !somethingNew) return null;

  return reconcileDrives(await scanDisks());
}
