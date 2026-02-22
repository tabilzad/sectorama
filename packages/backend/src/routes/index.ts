import type { FastifyInstance } from 'fastify';
import { statsRoutes }  from './public/stats.js';
import { driveRoutes }  from './drives/index.js';
import { scheduleRoutes } from './schedules/index.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // System stats
  await app.register(statsRoutes);

  // Disk management + SMART + benchmarks
  await app.register(driveRoutes);

  // Benchmark schedules
  await app.register(scheduleRoutes);

  // Health check
  app.get('/api/v1/health', async (_req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });
}
