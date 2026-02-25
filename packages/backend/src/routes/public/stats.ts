import type { FastifyInstance } from 'fastify';
import { eq, count } from 'drizzle-orm';
import { getDb } from '../../db';
import { drives, benchmarkRuns, smartCache } from '../../db/schema.js';
import { deriveHealth } from '../../utils/health.js';
import type { SystemStats } from '@sectorama/shared';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: SystemStats }>('/api/v1/stats', async (_req, reply) => {
    const db = getDb();

    // Single LEFT JOIN replaces the two-query pattern (drives + separate smartCache select)
    const driveWithCache = await db
      .select({
        driveId:             drives.driveId,
        isConnected:         drives.isConnected,
        lastSeen:            drives.lastSeen,
        healthPassed:        smartCache.healthPassed,
        reallocatedSectors:  smartCache.reallocatedSectors,
        pendingSectors:      smartCache.pendingSectors,
        uncorrectableErrors: smartCache.uncorrectableErrors,
      })
      .from(drives)
      .leftJoin(smartCache, eq(smartCache.driveId, drives.driveId));

    let healthy = 0, warning = 0, failed = 0;
    for (const row of driveWithCache) {
      if (!row.isConnected) continue;
      const health = deriveHealth(
        row.healthPassed,
        row.reallocatedSectors,
        row.pendingSectors,
        row.uncorrectableErrors,
      );
      if (health === 'failed')  { failed++;  continue; }
      if (health === 'warning') { warning++; continue; }
      if (health === 'ok')      { healthy++;            }
    }

    const runsRow = await db.select({ cnt: count() }).from(benchmarkRuns);
    const totalBenchmarkRuns = Number(runsRow[0]?.cnt ?? 0);

    const lastSeen = driveWithCache
      .map(r => r.lastSeen)
      .filter((s): s is string => !!s)
      .reduce((max, s) => (s > max ? s : max), '');

    const stats: SystemStats = {
      totalDrives:       driveWithCache.length,
      connectedDrives:   driveWithCache.filter(d => d.isConnected).length,
      healthyDrives:     healthy,
      warningDrives:     warning,
      failedDrives:      failed,
      totalBenchmarkRuns,
      lastScanTime:      lastSeen || null,
    };

    return reply.send(stats);
  });
}
