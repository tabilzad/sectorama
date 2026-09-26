import type { FastifyInstance } from 'fastify';
import { getVapidPublicKey, savePushSubscription, removePushSubscription } from '../../services/pushService.js';
import type { PushSubscriptionPayload } from '@sectorama/shared';

// Browser push services (FCM, Mozilla autopush, Apple) only hand out https endpoints.
const endpoint = { type: 'string', minLength: 1, maxLength: 2048, pattern: '^https://' } as const;
const key      = { type: 'string', minLength: 1, maxLength: 512 } as const;

const subscriptionBody = {
  type:       'object',
  required:   ['endpoint', 'keys'],
  properties: {
    endpoint,
    keys: {
      type:       'object',
      required:   ['p256dh', 'auth'],
      properties: { p256dh: key, auth: key },
    },
  },
} as const;

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get('/vapid-public-key', async (_req, reply) => {
    reply.send({ publicKey: getVapidPublicKey() });
  });

  app.post<{ Body: PushSubscriptionPayload }>(
    '/subscribe',
    { schema: { body: subscriptionBody } },
    async (req, reply) => {
      await savePushSubscription(req.body);
      reply.status(201).send({ ok: true });
    },
  );

  app.delete<{ Body: { endpoint: string } }>(
    '/unsubscribe',
    { schema: { body: { type: 'object', required: ['endpoint'], properties: { endpoint } } } },
    async (req, reply) => {
      await removePushSubscription(req.body.endpoint);
      reply.status(204).send();
    },
  );
}
