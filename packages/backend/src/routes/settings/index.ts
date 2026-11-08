import type { FastifyInstance } from 'fastify';
import {
  getCommunitySharingEnabled,
  setCommunitySharingEnabled,
  getRuntimeSettingsResponse,
  updateRuntimeSettings,
  SettingsValidationError,
} from '../../services/settingsService.js';
import { celsius, numPoints } from '../schemas.js';
import {
  SMART_POLL_INTERVAL_CHOICES,
  SMART_POLL_CONCURRENCY_MAX,
  type RuntimeSettingsResponse,
  type RuntimeSettingsUpdate,
} from '@sectorama/shared';

const runtimeSettingsUpdateSchema = {
  type:          'object',
  minProperties: 1,
  properties: {
    smartPolling: {
      type: 'object',
      properties: {
        skipStandby:     { type: 'boolean' },
        intervalMinutes: { type: 'integer', enum: [...SMART_POLL_INTERVAL_CHOICES] },
        concurrency:     { type: 'integer', minimum: 1, maximum: SMART_POLL_CONCURRENCY_MAX },
      },
    },
    benchmark: {
      type: 'object',
      properties: { defaultNumPoints: numPoints },
    },
    temperature: {
      type: 'object',
      properties: {
        normalCelsius: celsius,
        warmCelsius:   celsius,
        alertCelsius:  celsius,
        tooHotCelsius: celsius,
      },
    },
  },
} as const;

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

  // ── Runtime settings ──────────────────────────────────────────────────────
  // Polling, benchmark and temperature defaults. Values pinned by an
  // environment variable are reported in `managedByEnv` and cannot be changed
  // here.

  app.get<{ Reply: RuntimeSettingsResponse }>('/runtime', async (_req, reply) => {
    return reply.send(getRuntimeSettingsResponse());
  });

  app.put<{ Body: RuntimeSettingsUpdate; Reply: RuntimeSettingsResponse | { error: string } }>(
    '/runtime',
    { schema: { body: runtimeSettingsUpdateSchema } },
    async (req, reply) => {
      try {
        return reply.send(updateRuntimeSettings(req.body));
      } catch (err) {
        if (err instanceof SettingsValidationError) return reply.status(400).send({ error: err.message });
        throw err;
      }
    },
  );
}
