import type { FastifyInstance } from 'fastify';
import { getCommunitySharingEnabled, setCommunitySharingEnabled } from '../../services/settingsService.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/community-sharing', async (_req, reply) => {
    return reply.send({ enabled: getCommunitySharingEnabled() });
  });

  app.put('/community-sharing', async (req, reply) => {
    const body = req.body as { enabled?: unknown };
    if (typeof body.enabled !== 'boolean') {
      return reply.status(400).send({ error: '`enabled` must be a boolean' });
    }
    setCommunitySharingEnabled(body.enabled);
    return reply.send({ enabled: body.enabled });
  });
}
