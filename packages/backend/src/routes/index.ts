import type { FastifyInstance } from 'fastify';
import { statsRoutes }         from './public/stats.js';
import { driveRoutes }         from './drives';
import { scheduleRoutes }      from './schedules';
import { notificationRoutes }  from './notifications';
import { pushRoutes }          from './push';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // System stats
  await app.register(statsRoutes);

  // Disk management + SMART + benchmarks
  await app.register(driveRoutes);

  // Benchmark schedules
  await app.register(scheduleRoutes);

  // Notification channels, subscriptions, thresholds
  await app.register(notificationRoutes);

  // Web Push subscriptions + VAPID key
  await app.register(pushRoutes, { prefix: '/api/v1/push' });

  // Health check
  app.get('/api/v1/health', async (_req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });
}
