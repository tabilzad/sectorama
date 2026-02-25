import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { validate } from 'node-cron';
import { getDb } from '../../db/index.js';
import { benchmarkSchedules } from '../../db/schema.js';
import { rowToSchedule } from '../../db/mappers.js';
import { registerSchedule, unregisterSchedule } from '../../services/scheduler.js';
import type { BenchmarkSchedule } from '@sectorama/shared';

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/v1/schedules
  app.get<{ Reply: BenchmarkSchedule[] }>('/api/v1/schedules', async (_req, reply) => {
    const db = getDb();
    const rows = await db.select().from(benchmarkSchedules);
    return reply.send(rows.map(rowToSchedule));
  });

  // POST /api/v1/schedules
  app.post<{ Body: { driveId?: number; cronExpression: string; numPoints?: number } }>('/api/v1/schedules', async (req, reply) => {
    const { driveId, cronExpression, numPoints = 11 } = req.body;

    if (!validate(cronExpression)) {
      return reply.status(400).send({ error: 'Invalid cron expression' } as any);
    }

    const db  = getDb();
    const now = new Date().toISOString();

    const result = await db.insert(benchmarkSchedules).values({
      driveId:        driveId ?? null,
      cronExpression,
      enabled:        true,
      numPoints,
      createdAt:      now,
    });

    const newId = Number(result.lastInsertRowid);
    registerSchedule(newId, cronExpression, driveId ?? null, numPoints);

    const row = await db.query.benchmarkSchedules.findFirst({ where: eq(benchmarkSchedules.id, newId) });
    return reply.status(201).send(rowToSchedule(row!));
  });

  // PUT /api/v1/schedules/:id
  app.put<{ Params: { id: string }; Body: { enabled?: boolean; cronExpression?: string; numPoints?: number } }>('/api/v1/schedules/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);

    if (req.body.cronExpression !== undefined && !validate(req.body.cronExpression)) {
      return reply.status(400).send({ error: 'Invalid cron expression' } as any);
    }

    const db = getDb();

    const existing = await db.query.benchmarkSchedules.findFirst({ where: eq(benchmarkSchedules.id, id) });
    if (!existing) return reply.status(404).send({ error: 'Schedule not found' } as any);

    const updates: Partial<typeof benchmarkSchedules.$inferInsert> = {};
    if (req.body.enabled        !== undefined) updates.enabled        = req.body.enabled;
    if (req.body.cronExpression !== undefined) updates.cronExpression = req.body.cronExpression;
    if (req.body.numPoints      !== undefined) updates.numPoints      = req.body.numPoints;

    await db.update(benchmarkSchedules).set(updates).where(eq(benchmarkSchedules.id, id));

    const updated = await db.query.benchmarkSchedules.findFirst({ where: eq(benchmarkSchedules.id, id) });

    // Re-register cron if expression or enabled changed
    if (updated!.enabled) {
      registerSchedule(id, updated!.cronExpression, updated!.driveId ?? null, updated!.numPoints);
    } else {
      unregisterSchedule(id);
    }

    return reply.send(rowToSchedule(updated!));
  });

  // DELETE /api/v1/schedules/:id
  app.delete<{ Params: { id: string } }>('/api/v1/schedules/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    const db = getDb();

    unregisterSchedule(id);
    await db.delete(benchmarkSchedules).where(eq(benchmarkSchedules.id, id));
    return reply.status(204).send();
  });
}
