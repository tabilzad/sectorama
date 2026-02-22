import type { FastifyInstance } from 'fastify';
import { eq, count } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { drives, benchmarkRuns, smartCache } from '../../db/schema.js';
import type { SystemStats } from '@sectorama/shared';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: SystemStats }>('/api/v1/stats', async (_req, reply) => {
    const db = getDb();

    const allDrives = await db.select({
      driveId:     drives.driveId,
      isConnected: drives.isConnected,
    }).from(drives);

    const driveIds = allDrives.map(d => d.driveId);
    const cacheRows = driveIds.length > 0
      ? await db.select().from(smartCache)
      : [];

    const cacheMap = new Map(cacheRows.map(r => [r.driveId, r]));

    let healthy = 0, warning = 0, failed = 0;
    for (const d of allDrives) {
      if (!d.isConnected) continue;
      const sc = cacheMap.get(d.driveId);
      if (!sc || sc.healthPassed === null || sc.healthPassed === undefined) continue;
      if (sc.healthPassed === false) { failed++; continue; }
      const hasWarning = (sc.reallocatedSectors ?? 0) > 0 || (sc.pendingSectors ?? 0) > 5;
      if (hasWarning) { warning++; } else { healthy++; }
    }

    const runsRow = await db.select({ cnt: count() }).from(benchmarkRuns);
    const totalBenchmarkRuns = Number(runsRow[0]?.cnt ?? 0);

    // lastScanTime = latest lastSeen across connected drives
    const latestDrive = allDrives.length > 0
      ? await db.query.drives.findFirst({
          orderBy: (d, { desc }) => [desc(d.lastSeen)],
        })
      : null;

    const stats: SystemStats = {
      totalDrives:       allDrives.length,
      connectedDrives:   allDrives.filter(d => d.isConnected).length,
      healthyDrives:     healthy,
      warningDrives:     warning,
      failedDrives:      failed,
      totalBenchmarkRuns,
      lastScanTime:      latestDrive?.lastSeen ?? null,
    };

    return reply.send(stats);
  });
}
