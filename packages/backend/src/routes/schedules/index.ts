import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { validate } from 'node-cron';
import { getDb } from '../../db/index.js';
import { benchmarkSchedules, drives } from '../../db/schema.js';
import { rowToSchedule } from '../../db/mappers.js';
import { registerSchedule, unregisterSchedule } from '../../services/scheduler.js';
import { idParams, numPoints, nullableShortText, positiveInt } from '../schemas.js';
import type { BenchmarkSchedule } from '@sectorama/shared';

interface IdParams { id: number }

const cronExpression = { type: 'string', minLength: 1, maxLength: 100 } as const;

async function driveExists(driveId: number): Promise<boolean> {
  const row = await getDb().query.drives.findFirst({
    where:   eq(drives.driveId, driveId),
    columns: { driveId: true },
  });
  return row !== undefined;
}

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/v1/schedules
  app.get<{ Reply: BenchmarkSchedule[] }>('/api/v1/schedules', async (_req, reply) => {
    const db   = getDb();
    const rows = await db.select().from(benchmarkSchedules);
    return reply.send(rows.map(rowToSchedule));
  });

  // POST /api/v1/schedules
  app.post<{ Body: { driveId?: number | null; cronExpression: string; numPoints?: number; label?: string | null } }>(
    '/api/v1/schedules',
    {
      schema: {
        body: {
          type:       'object',
          required:   ['cronExpression'],
          properties: {
            driveId:        { ...positiveInt, nullable: true },   // null / omitted = all drives
            cronExpression,
            numPoints,
            label:          nullableShortText,
          },
        },
      },
    },
    async (req, reply) => {
      const { driveId = null, cronExpression, numPoints = 11, label = null } = req.body;

      if (!validate(cronExpression)) {
        return reply.status(400).send({ error: 'Invalid cron expression' });
      }
      if (driveId !== null && !(await driveExists(driveId))) {
        return reply.status(404).send({ error: 'Drive not found' });
      }

      const db  = getDb();
      const now = new Date().toISOString();

      const result = await db.insert(benchmarkSchedules).values({
        driveId,
        cronExpression,
        enabled:   true,
        numPoints,
        createdAt: now,
        label,
      });

      const newId = Number(result.lastInsertRowid);
      registerSchedule(newId, cronExpression, driveId, numPoints);

      const row = await db.query.benchmarkSchedules.findFirst({ where: eq(benchmarkSchedules.id, newId) });
      return reply.status(201).send(rowToSchedule(row!));
    },
  );

  // PUT /api/v1/schedules/:id
  app.put<{
    Params: IdParams;
    Body:   { enabled?: boolean; cronExpression?: string; numPoints?: number; label?: string | null };
  }>(
    '/api/v1/schedules/:id',
    {
      schema: {
        params: idParams,
        body:   {
          type:       'object',
          properties: {
            enabled:        { type: 'boolean' },
            cronExpression,
            numPoints,
            label:          nullableShortText,
          },
        },
      },
    },
    async (req, reply) => {
      const id = req.params.id;

      if (req.body.cronExpression !== undefined && !validate(req.body.cronExpression)) {
        return reply.status(400).send({ error: 'Invalid cron expression' });
      }

      const db = getDb();

      const existing = await db.query.benchmarkSchedules.findFirst({ where: eq(benchmarkSchedules.id, id) });
      if (!existing) return reply.status(404).send({ error: 'Schedule not found' });

      const updates: Partial<typeof benchmarkSchedules.$inferInsert> = {};
      if (req.body.enabled        !== undefined) updates.enabled        = req.body.enabled;
      if (req.body.cronExpression !== undefined) updates.cronExpression = req.body.cronExpression;
      if (req.body.numPoints      !== undefined) updates.numPoints      = req.body.numPoints;
      if (req.body.label          !== undefined) updates.label          = req.body.label;

      if (Object.keys(updates).length > 0) {
        await db.update(benchmarkSchedules).set(updates).where(eq(benchmarkSchedules.id, id));
      }

      const updated = await db.query.benchmarkSchedules.findFirst({ where: eq(benchmarkSchedules.id, id) });

      // Re-register cron if expression or enabled changed
      if (updated!.enabled) {
        registerSchedule(id, updated!.cronExpression, updated!.driveId ?? null, updated!.numPoints);
      } else {
        unregisterSchedule(id);
      }

      return reply.send(rowToSchedule(updated!));
    },
  );

  // DELETE /api/v1/schedules/:id
  app.delete<{ Params: IdParams }>(
    '/api/v1/schedules/:id',
    { schema: { params: idParams } },
    async (req, reply) => {
      const id = req.params.id;
      const db = getDb();

      unregisterSchedule(id);
      await db.delete(benchmarkSchedules).where(eq(benchmarkSchedules.id, id));
      return reply.status(204).send();
    },
  );
}
