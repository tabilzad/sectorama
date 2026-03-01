import type { FastifyInstance } from 'fastify';
import { getVapidPublicKey, savePushSubscription, removePushSubscription } from '../../services/pushService.js';
import type { PushSubscriptionPayload } from '@sectorama/shared';

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get('/vapid-public-key', async (_req, reply) => {
    reply.send({ publicKey: getVapidPublicKey() });
  });

  app.post<{ Body: PushSubscriptionPayload }>('/subscribe', async (req, reply) => {
    await savePushSubscription(req.body);
    reply.status(201).send({ ok: true });
  });

  app.delete<{ Body: { endpoint: string } }>('/unsubscribe', async (req, reply) => {
    await removePushSubscription(req.body.endpoint);
    reply.status(204).send();
  });
}
