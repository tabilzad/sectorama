import type { FastifyInstance } from 'fastify';
import {
  getCommunitySharingEnabled,
  setCommunitySharingEnabled,
  getSmartPollingSettings,
  setSmartPollingSettings,
} from '../../services/settingsService.js';
import type { SmartPollingSettings } from '@sectorama/shared';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // ── Community sharing ─────────────────────────────────────────────────────

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

  // ── SMART polling ─────────────────────────────────────────────────────────

  app.get<{ Reply: SmartPollingSettings }>('/smart-polling', async (_req, reply) => {
    return reply.send(getSmartPollingSettings());
  });

  app.put<{ Body: SmartPollingSettings; Reply: SmartPollingSettings }>(
    '/smart-polling',
    {
      schema: {
        body: { type: 'object', required: ['skipStandby'], properties: { skipStandby: { type: 'boolean' } } },
      },
    },
    async (req, reply) => {
      setSmartPollingSettings({ skipStandby: req.body.skipStandby });
      return reply.send(getSmartPollingSettings());
    },
  );
}
