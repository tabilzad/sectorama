import type { FastifyInstance } from 'fastify';
import { getCommunitySharingEnabled, setCommunitySharingEnabled } from '../../services/settingsService.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/community-sharing', async (_req, reply) => {
    return reply.send({ enabled: getCommunitySharingEnabled() });
  });

  app.put<{ Body: { enabled: boolean } }>(
    '/community-sharing',
    { schema: { body: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } } } },
    async (req, reply) => {
      setCommunitySharingEnabled(req.body.enabled);
      return reply.send({ enabled: req.body.enabled });
    },
  );
}
