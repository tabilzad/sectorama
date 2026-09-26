import type { FastifyInstance } from 'fastify';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { getDb } from '../../db';
import { drives, benchmarkRuns, driveDisplayPrefs, settings } from '../../db/schema.js';
import { scanDisks, registerDrives, getDriveSummaries } from '../../services/diskDiscovery.js';
import { getSmartReadingFromCache, getSmartHistory } from '../../services/smartService.js';
import {
  createRun, executeBenchmark, getRunDetail, getDriveSeries, deleteRun, purgeAllRuns, BenchmarkBusyError,
} from '../../services/benchmarkEngine.js';
import { getActiveBenchmark } from '../../services/benchmarkLock.js';
import { config } from '../../config.js';
import {
  driveIdParams, runParams, numPoints, dashboardPreset, positiveInt, nullableShortText, fluxTimeBound,
} from '../schemas.js';
import type { Drive, DriveSummary, BenchmarkRun, DashboardPreset } from '@sectorama/shared';

interface DriveIdParams { driveId: number }
interface RunParams     { driveId: number; runId: number }

// An empty list is legal: the dashboard saves its (possibly empty) custom order as-is.
const driveIdList = { type: 'array', items: positiveInt, maxItems: 500, uniqueItems: true } as const;
const attrName    = { type: 'string', minLength: 1, maxLength: 128 } as const;

async function driveExists(driveId: number): Promise<boolean> {
  const row = await getDb().query.drives.findFirst({
    where:   eq(drives.driveId, driveId),
    columns: { driveId: true },
  });
  return row !== undefined;
}

/** Ids from `driveIds` that are not in the registry, so callers can answer 400 instead of tripping a foreign-key error. */
async function findUnknownDriveIds(driveIds: number[]): Promise<number[]> {
  if (driveIds.length === 0) return [];
  const rows = await getDb()
    .select({ driveId: drives.driveId })
    .from(drives)
    .where(inArray(drives.driveId, driveIds));
  const known = new Set(rows.map(r => r.driveId));
  return driveIds.filter(id => !known.has(id));
}

async function upsertDisplayOrder(driveIds: number[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < driveIds.length; i++) {
    await db.insert(driveDisplayPrefs)
      .values({ driveId: driveIds[i], displayOrder: i })
      .onConflictDoUpdate({ target: driveDisplayPrefs.driveId, set: { displayOrder: i } });
  }
}

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

  // GET /api/v1/disks/display-prefs/layout — get current dashboard preset
  app.get('/api/v1/disks/display-prefs/layout', async (_req, reply) => {
    const db = getDb();
    const row = await db.select().from(settings)
      .where(eq(settings.key, 'dashboard_layout_preset'));
    return reply.send({ preset: row[0]?.value ?? 'custom' });
  });

  // PUT /api/v1/disks/display-prefs/layout — save preset + optional custom order
  app.put<{ Body: { preset: DashboardPreset; driveIds?: number[] } }>(
    '/api/v1/disks/display-prefs/layout',
    {
      schema: {
        body: {
          type:       'object',
          required:   ['preset'],
          properties: { preset: dashboardPreset, driveIds: driveIdList },
        },
      },
    },
    async (req, reply) => {
      const { preset, driveIds } = req.body;
      if (preset === 'custom' && driveIds?.length) {
        const unknown = await findUnknownDriveIds(driveIds);
        if (unknown.length > 0) {
          return reply.status(400).send({ error: `Unknown drive id(s): ${unknown.join(', ')}` });
        }
      }

      const db = getDb();
      await db.insert(settings)
        .values({ key: 'dashboard_layout_preset', value: preset })
        .onConflictDoUpdate({ target: settings.key, set: { value: preset } });
      if (preset === 'custom' && driveIds?.length) {
        await upsertDisplayOrder(driveIds);
      }
      return reply.status(204).send();
    },
  );

  // PUT /api/v1/disks/display-prefs/order — batch reorder drives
  app.put<{ Body: { driveIds: number[] } }>(
    '/api/v1/disks/display-prefs/order',
    {
      schema: {
        body: { type: 'object', required: ['driveIds'], properties: { driveIds: driveIdList } },
      },
    },
    async (req, reply) => {
      const { driveIds } = req.body;
      const unknown = await findUnknownDriveIds(driveIds);
      if (unknown.length > 0) {
        return reply.status(400).send({ error: `Unknown drive id(s): ${unknown.join(', ')}` });
      }
      await upsertDisplayOrder(driveIds);
      return reply.status(204).send();
    },
  );

  // GET /api/v1/disks/:driveId — drive detail
  app.get<{ Params: DriveIdParams }>(
    '/api/v1/disks/:driveId',
    { schema: { params: driveIdParams } },
    async (req, reply) => {
      const db  = getDb();
      const row = await db.query.drives.findFirst({ where: eq(drives.driveId, req.params.driveId) });
      if (!row) return reply.status(404).send({ error: 'Drive not found' });

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
    },
  );

  // GET /api/v1/disks/:driveId/smart — latest cached SMART reading (no live smartctl call)
  app.get<{ Params: DriveIdParams }>(
    '/api/v1/disks/:driveId/smart',
    { schema: { params: driveIdParams } },
    async (req, reply) => {
      const reading = await getSmartReadingFromCache(req.params.driveId);
      if (!reading) return reply.status(404).send({ error: 'No SMART data cached yet' });
      return reply.send(reading);
    },
  );

  // GET /api/v1/disks/:driveId/smart/history
  app.get<{ Params: DriveIdParams; Querystring: { attr?: string; from: string; to: string } }>(
    '/api/v1/disks/:driveId/smart/history',
    {
      schema: {
        params:      driveIdParams,
        querystring: {
          type:       'object',
          properties: {
            attr: attrName,
            from: { ...fluxTimeBound, default: '-7d' },
            to:   { ...fluxTimeBound, default: 'now()' },
          },
        },
      },
    },
    async (req, reply) => {
      const db       = getDb();
      const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, req.params.driveId) });
      if (!driveRow) return reply.status(404).send({ error: 'Drive not found' });

      const history = await getSmartHistory(
        driveRow.serialNumber,
        req.query.attr ?? null,
        req.query.from,
        req.query.to,
      );
      return reply.send(history);
    },
  );

  // GET /api/v1/disks/:driveId/benchmarks — all runs for a drive
  app.get<{ Params: DriveIdParams }>(
    '/api/v1/disks/:driveId/benchmarks',
    { schema: { params: driveIdParams } },
    async (req, reply) => {
      const db   = getDb();
      const runs = await db.select().from(benchmarkRuns)
        .where(eq(benchmarkRuns.driveId, req.params.driveId))
        .orderBy(desc(benchmarkRuns.startedAt));

      const result: BenchmarkRun[] = runs.map(r => ({
        runId:        r.runId,
        driveId:      r.driveId,
        startedAt:    r.startedAt,
        completedAt:  r.completedAt ?? null,
        status:       r.status as BenchmarkRun['status'],
        triggerType:  r.triggerType as BenchmarkRun['triggerType'],
        numPoints:    r.numPoints,
        errorMessage: r.errorMessage ?? null,
      }));
      return reply.send(result);
    },
  );

  // POST /api/v1/disks/:driveId/benchmark — trigger a new benchmark run
  app.post<{ Params: DriveIdParams; Body: { numPoints?: number } }>(
    '/api/v1/disks/:driveId/benchmark',
    {
      schema: {
        params: driveIdParams,
        body:   { type: 'object', properties: { numPoints } },
      },
      // A bare POST with no body is a valid "use the defaults" request.
      preValidation: async (req) => {
        if (req.body === undefined) req.body = {};
      },
    },
    async (req, reply) => {
      const driveId   = req.params.driveId;
      const numPoints = req.body.numPoints ?? config.benchmark.numPoints;

      if (!(await driveExists(driveId))) return reply.status(404).send({ error: 'Drive not found' });

      // Refuse early while another benchmark holds the global lock — avoids
      // creating a run row that executeBenchmark would immediately mark failed.
      const active = getActiveBenchmark();
      if (active) {
        return reply.status(409).send({
          error: `Benchmark run ${active.runId} is already in progress (drive ${active.driveId})`,
        });
      }

      const runId = await createRun(driveId, numPoints, 'manual');

      // Fire-and-forget — progress delivered via WebSocket
      executeBenchmark(runId).catch(err =>
        app.log.error({ err, runId }, 'Benchmark execution failed'),
      );

      return reply.status(202).send({ runId, status: 'pending' });
    },
  );

  // GET /api/v1/disks/:driveId/benchmarks/series — all completed runs as BenchmarkSeries[]
  app.get<{ Params: DriveIdParams }>(
    '/api/v1/disks/:driveId/benchmarks/series',
    { schema: { params: driveIdParams } },
    async (req, reply) => {
      const series = await getDriveSeries(req.params.driveId);
      return reply.send(series);
    },
  );

  // GET /api/v1/disks/:driveId/benchmarks/:runId — specific run detail
  app.get<{ Params: RunParams }>(
    '/api/v1/disks/:driveId/benchmarks/:runId',
    { schema: { params: runParams } },
    async (req, reply) => {
      const detail = await getRunDetail(req.params.runId);
      if (!detail || detail.driveId !== req.params.driveId) {
        return reply.status(404).send({ error: 'Run not found' });
      }
      return reply.send(detail);
    },
  );

  // DELETE /api/v1/disks/:driveId/benchmarks/:runId — delete a single run
  app.delete<{ Params: RunParams }>(
    '/api/v1/disks/:driveId/benchmarks/:runId',
    { schema: { params: runParams } },
    async (req, reply) => {
      const { driveId, runId } = req.params;
      const run = await getDb().query.benchmarkRuns.findFirst({
        where:   and(eq(benchmarkRuns.runId, runId), eq(benchmarkRuns.driveId, driveId)),
        columns: { runId: true },
      });
      if (!run) return reply.status(404).send({ error: 'Run not found' });

      try {
        await deleteRun(runId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof BenchmarkBusyError) return reply.status(409).send({ error: err.message });
        throw err;
      }
    },
  );

  // DELETE /api/v1/disks/:driveId/benchmarks — purge all runs for the drive
  app.delete<{ Params: DriveIdParams }>(
    '/api/v1/disks/:driveId/benchmarks',
    { schema: { params: driveIdParams } },
    async (req, reply) => {
      if (!(await driveExists(req.params.driveId))) return reply.status(404).send({ error: 'Drive not found' });

      try {
        await purgeAllRuns(req.params.driveId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof BenchmarkBusyError) return reply.status(409).send({ error: err.message });
        throw err;
      }
    },
  );

  // PATCH /api/v1/disks/:driveId/display-prefs — update custom label for one drive
  app.patch<{ Params: DriveIdParams; Body: { customLabel: string | null } }>(
    '/api/v1/disks/:driveId/display-prefs',
    {
      schema: {
        params: driveIdParams,
        body:   { type: 'object', required: ['customLabel'], properties: { customLabel: nullableShortText } },
      },
    },
    async (req, reply) => {
      const driveId = req.params.driveId;
      if (!(await driveExists(driveId))) return reply.status(404).send({ error: 'Drive not found' });

      const customLabel = req.body.customLabel ?? null;
      await getDb().insert(driveDisplayPrefs)
        .values({ driveId, customLabel, displayOrder: 0 })
        .onConflictDoUpdate({ target: driveDisplayPrefs.driveId, set: { customLabel } });
      return reply.status(204).send();
    },
  );
}
