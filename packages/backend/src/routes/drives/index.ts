import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { drives, benchmarkRuns, smartCache as smartCacheTable } from '../../db/schema.js';
import { scanDisks, registerDrives, getDriveSummaries } from '../../services/diskDiscovery.js';
import { pollSmartForDrive, getSmartHistory } from '../../services/smartService.js';
import { createRun, executeBenchmark, getRunDetail, getDriveSeries, deleteRun, purgeAllRuns } from '../../services/benchmarkEngine.js';
import { config } from '../../config.js';
import type {
  Drive, DriveSummary, SmartReading, BenchmarkRun, BenchmarkRunDetail, BenchmarkSeries,
} from '@sectorama/shared';

export async function driveRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/v1/disks — list all known drives
  app.get<{ Reply: DriveSummary[] }>('/api/v1/disks', async (_req, reply) => {
    const summaries = await getDriveSummaries();
    return reply.send(summaries);
  });

  // POST /api/v1/disks/scan — re-scan host for new/removed disks
  app.post('/api/v1/disks/scan', async (_req, reply) => {
    const discovered = await scanDisks();
    await registerDrives(discovered);
    const summaries = await getDriveSummaries();
    return reply.send({ scanned: discovered.length, drives: summaries });
  });

  // GET /api/v1/disks/:driveId — drive detail + last SMART snapshot
  app.get<{ Params: { driveId: string }; Reply: Drive }>('/api/v1/disks/:driveId', async (req, reply) => {
    const driveId = parseInt(req.params.driveId, 10);
    const db = getDb();
    const row = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId) });
    if (!row) return reply.status(404).send({ error: 'Drive not found' } as any);

    const drive: Drive = {
      driveId:            row.driveId,
      serialNumber:       row.serialNumber,
      devicePath:         row.devicePath,
      vendor:             row.vendor,
      model:              row.model,
      firmwareRevision:   row.firmwareRevision,
      capacity:           row.capacity,
      type:               row.type as Drive['type'],
      rpm:                row.rpm ?? null,
      interfaceType:      row.interfaceType ?? null,
      logicalSectorSize:  row.logicalSectorSize ?? null,
      physicalSectorSize: row.physicalSectorSize ?? null,
      firstSeen:          row.firstSeen,
      lastSeen:           row.lastSeen,
      isConnected:        row.isConnected,
    };
    return reply.send(drive);
  });

  // GET /api/v1/disks/:driveId/smart — latest full SMART reading
  app.get<{ Params: { driveId: string }; Reply: SmartReading }>('/api/v1/disks/:driveId/smart', async (req, reply) => {
    const driveId = parseInt(req.params.driveId, 10);

    // Trigger a fresh poll
    const reading = await pollSmartForDrive(driveId);
    if (!reading) return reply.status(404).send({ error: 'Drive not found' } as any);
    return reply.send(reading);
  });

  // GET /api/v1/disks/:driveId/smart/history
  app.get<{
    Params: { driveId: string };
    Querystring: { attr?: string; from?: string; to?: string };
  }>('/api/v1/disks/:driveId/smart/history', async (req, reply) => {
    const driveId = parseInt(req.params.driveId, 10);
    const db = getDb();
    const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId) });
    if (!driveRow) return reply.status(404).send({ error: 'Drive not found' } as any);

    const from = req.query.from ?? '-7d';
    const to   = req.query.to   ?? 'now()';
    const attr = req.query.attr ?? null;

    const history = await getSmartHistory(driveRow.serialNumber, attr, from, to);
    return reply.send(history);
  });

  // GET /api/v1/disks/:driveId/benchmarks — all runs for a drive
  app.get<{ Params: { driveId: string }; Reply: BenchmarkRun[] }>('/api/v1/disks/:driveId/benchmarks', async (req, reply) => {
    const driveId = parseInt(req.params.driveId, 10);
    const db = getDb();
    const runs = await db.select().from(benchmarkRuns)
      .where(eq(benchmarkRuns.driveId, driveId))
      .orderBy(desc(benchmarkRuns.startedAt));

    return reply.send(runs.map(r => ({
      runId:        r.runId,
      driveId:      r.driveId,
      startedAt:    r.startedAt,
      completedAt:  r.completedAt ?? null,
      status:       r.status as BenchmarkRun['status'],
      triggerType:  r.triggerType as BenchmarkRun['triggerType'],
      numPoints:    r.numPoints,
      errorMessage: r.errorMessage ?? null,
    })));
  });

  // POST /api/v1/disks/:driveId/benchmark — trigger a new benchmark run
  app.post<{ Params: { driveId: string }; Body: { numPoints?: number } }>('/api/v1/disks/:driveId/benchmark', async (req, reply) => {
    const driveId   = parseInt(req.params.driveId, 10);
    const numPoints = req.body?.numPoints ?? config.benchmark.numPoints;

    const db = getDb();
    const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId) });
    if (!driveRow) return reply.status(404).send({ error: 'Drive not found' } as any);

    const runId = await createRun(driveId, numPoints, 'manual');

    // Fire-and-forget — progress delivered via WebSocket
    executeBenchmark(runId).catch(err =>
      app.log.error({ err, runId }, 'Benchmark execution failed'),
    );

    return reply.status(202).send({ runId, status: 'pending' });
  });

  // GET /api/v1/disks/:driveId/benchmarks/series — all completed runs as BenchmarkSeries[]
  // Must be registered before /:runId so the static segment "series" takes priority.
  app.get<{ Params: { driveId: string }; Reply: BenchmarkSeries[] }>('/api/v1/disks/:driveId/benchmarks/series', async (req, reply) => {
    const driveId = parseInt(req.params.driveId, 10);
    const series = await getDriveSeries(driveId);
    return reply.send(series);
  });

  // GET /api/v1/disks/:driveId/benchmarks/:runId — specific run detail
  app.get<{ Params: { driveId: string; runId: string }; Reply: BenchmarkRunDetail }>('/api/v1/disks/:driveId/benchmarks/:runId', async (req, reply) => {
    const runId = parseInt(req.params.runId, 10);
    const detail = await getRunDetail(runId);
    if (!detail) return reply.status(404).send({ error: 'Run not found' } as any);
    return reply.send(detail);
  });

  // DELETE /api/v1/disks/:driveId/benchmarks/:runId — delete a single run
  app.delete<{ Params: { driveId: string; runId: string } }>('/api/v1/disks/:driveId/benchmarks/:runId', async (req, reply) => {
    const runId = parseInt(req.params.runId, 10);
    try {
      await deleteRun(runId);
      return reply.status(204).send();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(409).send({ error: msg });
    }
  });

  // DELETE /api/v1/disks/:driveId/benchmarks — purge all runs for the drive
  app.delete<{ Params: { driveId: string } }>('/api/v1/disks/:driveId/benchmarks', async (req, reply) => {
    const driveId = parseInt(req.params.driveId, 10);
    try {
      await purgeAllRuns(driveId);
      return reply.status(204).send();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(409).send({ error: msg });
    }
  });
}
