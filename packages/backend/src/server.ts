import { config } from './config.js';
import { initDb } from './db';
import { buildApp } from './app.js';
import { initVapid } from './services/pushService.js';
import { initSmartReplay } from './ws/liveFeed.js';
import { initScheduler, initSmartPoller } from './services/scheduler.js';
import { scanDisks, registerDrives } from './services/diskDiscovery.js';
import { recoverOrphanedRuns } from './services/benchmarkEngine.js';
import { refreshAllSmart, getAllCachedSmartEvents } from './services/smartService.js';

async function main() {
  // ── Initialize SQLite ──────────────────────────────────────────────────────
  console.log(`[sectorama] Initializing SQLite at ${config.sqlite.path}...`);
  initDb();
  console.log('[sectorama] SQLite ready');

  // Fail any runs stranded in 'pending'/'running' by a previous process —
  // must happen before routes and schedulers can start new runs.
  await recoverOrphanedRuns();

  // ── Initialize VAPID keys for Web Push ────────────────────────────────────
  initVapid();

  // ── Build Fastify app ──────────────────────────────────────────────────────
  const app = await buildApp();

  // ── Initial disk scan ──────────────────────────────────────────────────────
  console.log('[sectorama] Scanning for disks...');
  try {
    const discovered = await scanDisks();
    await registerDrives(discovered);
    console.log(`[sectorama] Found ${discovered.length} disk(s)`);
  } catch (err) {
    console.warn('[sectorama] Initial disk scan failed (non-fatal):', err);
  }

  // ── Start server ──────────────────────────────────────────────────────────
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[sectorama] Server running on http://0.0.0.0:${config.port}`);

  // ── Start schedulers ──────────────────────────────────────────────────────
  await initScheduler();
  initSmartPoller();

  // ── Initial SMART cache warm-up (non-blocking, runs in background) ────────
  // After warm-up, seed the WS replay map so clients connecting before the first
  // scheduled poll receive the last-known readings without an HTTP round-trip.
  refreshAllSmart()
    .then(() => getAllCachedSmartEvents())
    .then(events => initSmartReplay(events))
    .catch(err => console.warn('[sectorama] SMART cache warm-up failed (non-fatal):', err));
}

main().catch(err => {
  console.error('[sectorama] Fatal error:', err);
  process.exit(1);
});
