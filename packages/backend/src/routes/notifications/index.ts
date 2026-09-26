import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import {
  drives,
  notificationChannels,
  notificationSubscriptions,
  driveAlertThresholds,
} from '../../db/schema.js';
import { rowToChannel, rowToSub } from '../../db/mappers.js';
import { createChannel } from '../../services/notifications/channelFactory.js';
import { evaluateAndNotifyNewChannel } from '../../services/notifications/notificationService.js';
import {
  idParams, driveIdParams, positiveInt, shortText, alertType, channelType, celsius, nullableCelsius,
} from '../schemas.js';
import type {
  DriveAlertThreshold,
  ChannelType,
  AlertType,
  Alert,
} from '@sectorama/shared';

interface IdParams      { id: number }
interface DriveIdParams { driveId: number }

const MAX_URL_LENGTH    = 2048;
const MAX_SECRET_LENGTH = 1024;

/** True for a well-formed http(s) URL of sane length. */
function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

/**
 * Validate the type-specific channel config. Kept as code rather than JSON
 * Schema because the PUT route validates against the channel's stored type,
 * which is not part of the request body.
 */
function validateChannelConfig(type: ChannelType, cfg: unknown): string | null {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return 'Config must be an object';
  const obj = cfg as Record<string, unknown>;
  if (type === 'webhook') {
    if (!isHttpUrl(obj['url'])) return 'Webhook config requires a valid http(s) url';
    const auth = obj['auth'];
    if (!auth || typeof auth !== 'object') return 'Webhook config requires an auth object';
    const authObj  = auth as Record<string, unknown>;
    const authType = authObj['type'];
    if (!['none', 'basic', 'bearer'].includes(String(authType))) {
      return 'auth.type must be none, basic, or bearer';
    }
    if (authType === 'basic') {
      if (!isNonEmptyString(authObj['username'], MAX_SECRET_LENGTH)) return 'Basic auth requires a username';
      if (!isNonEmptyString(authObj['password'], MAX_SECRET_LENGTH)) return 'Basic auth requires a password';
    }
    if (authType === 'bearer') {
      if (!isNonEmptyString(authObj['token'], MAX_SECRET_LENGTH)) return 'Bearer auth requires a token';
    }
  } else if (type === 'slack') {
    if (!isHttpUrl(obj['webhookUrl'])) return 'Slack config requires a valid http(s) webhookUrl';
  }
  return null;
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {

  // ── Channels ──────────────────────────────────────────────────────────────

  // GET /api/v1/notifications/channels
  app.get('/api/v1/notifications/channels', async (_req, reply) => {
    const db   = getDb();
    const rows = await db.select().from(notificationChannels);
    return reply.send(rows.map(rowToChannel));
  });

  // POST /api/v1/notifications/channels
  app.post<{ Body: { name: string; type: ChannelType; config: unknown } }>(
    '/api/v1/notifications/channels',
    {
      schema: {
        body: {
          type:       'object',
          required:   ['name', 'type', 'config'],
          properties: {
            name:   shortText,
            type:   channelType,
            config: { type: 'object' },
          },
        },
      },
    },
    async (req, reply) => {
      const { name, type, config: cfg } = req.body;

      const configError = validateChannelConfig(type, cfg);
      if (configError) {
        return reply.status(400).send({ error: configError });
      }

      const db  = getDb();
      const now = new Date().toISOString();

      const result = await db.insert(notificationChannels).values({
        name,
        type,
        config:    JSON.stringify(cfg),
        enabled:   true,
        createdAt: now,
      });

      const newId = Number(result.lastInsertRowid);

      // Auto-subscribe to all alert types so the channel is ready out of the box
      await db.insert(notificationSubscriptions).values([
        { channelId: newId, alertType: 'smart_error' as AlertType },
        { channelId: newId, alertType: 'temperature' as AlertType },
      ]);

      const row = await db.query.notificationChannels.findFirst({
        where: eq(notificationChannels.id, newId),
      });

      // Fire an immediate catch-up evaluation so drives already in a bad state
      // trigger an alert right away — no need to wait for the next SMART poll.
      evaluateAndNotifyNewChannel(newId).catch(err =>
        console.error('[notifications] Initial channel evaluation failed:', err),
      );

      return reply.status(201).send(rowToChannel(row!));
    },
  );

  // PUT /api/v1/notifications/channels/:id
  app.put<{
    Params: IdParams;
    Body:   { name?: string; config?: unknown; enabled?: boolean };
  }>(
    '/api/v1/notifications/channels/:id',
    {
      schema: {
        params: idParams,
        body:   {
          type:       'object',
          properties: {
            name:    shortText,
            config:  { type: 'object' },
            enabled: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const id = req.params.id;
      const db = getDb();

      const existing = await db.query.notificationChannels.findFirst({
        where: eq(notificationChannels.id, id),
      });
      if (!existing) return reply.status(404).send({ error: 'Channel not found' });

      if (req.body.config !== undefined) {
        const configError = validateChannelConfig(existing.type as ChannelType, req.body.config);
        if (configError) {
          return reply.status(400).send({ error: configError });
        }
      }

      const updates: Partial<typeof notificationChannels.$inferInsert> = {};
      if (req.body.name    !== undefined) updates.name    = req.body.name;
      if (req.body.config  !== undefined) updates.config  = JSON.stringify(req.body.config);
      if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;

      if (Object.keys(updates).length > 0) {
        await db.update(notificationChannels).set(updates).where(eq(notificationChannels.id, id));
      }
      const updated = await db.query.notificationChannels.findFirst({
        where: eq(notificationChannels.id, id),
      });
      return reply.send(rowToChannel(updated!));
    },
  );

  // DELETE /api/v1/notifications/channels/:id
  app.delete<{ Params: IdParams }>(
    '/api/v1/notifications/channels/:id',
    { schema: { params: idParams } },
    async (req, reply) => {
      const db = getDb();
      await db.delete(notificationChannels).where(eq(notificationChannels.id, req.params.id));
      return reply.status(204).send();
    },
  );

  // POST /api/v1/notifications/channels/:id/test
  app.post<{ Params: IdParams }>(
    '/api/v1/notifications/channels/:id/test',
    { schema: { params: idParams } },
    async (req, reply) => {
      const db  = getDb();
      const row = await db.query.notificationChannels.findFirst({
        where: eq(notificationChannels.id, req.params.id),
      });
      if (!row) return reply.status(404).send({ error: 'Channel not found' });

      const sampleAlert: Alert = {
        type:        'smart_error',
        driveId:     0,
        driveSerial: 'TEST-SERIAL-00000',
        driveModel:  'Test Drive (Sample Alert)',
        message:     'This is a test notification from Sectorama. If you see this, the channel is configured correctly.',
        timestamp:   new Date().toISOString(),
      };

      try {
        const channel = createChannel(row.type as ChannelType, JSON.parse(row.config));
        await channel.send(sampleAlert);
        return reply.send({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Delivery failed: ${message}` });
      }
    },
  );

  // ── Subscriptions ─────────────────────────────────────────────────────────

  // GET /api/v1/notifications/subscriptions[?channelId=]
  app.get<{ Querystring: { channelId?: number } }>(
    '/api/v1/notifications/subscriptions',
    { schema: { querystring: { type: 'object', properties: { channelId: positiveInt } } } },
    async (req, reply) => {
      const db = getDb();
      if (req.query.channelId !== undefined) {
        const rows = await db
          .select()
          .from(notificationSubscriptions)
          .where(eq(notificationSubscriptions.channelId, req.query.channelId));
        return reply.send(rows.map(rowToSub));
      }
      const rows = await db.select().from(notificationSubscriptions);
      return reply.send(rows.map(rowToSub));
    },
  );

  // POST /api/v1/notifications/subscriptions
  app.post<{ Body: { channelId: number; alertType: AlertType } }>(
    '/api/v1/notifications/subscriptions',
    {
      schema: {
        body: {
          type:       'object',
          required:   ['channelId', 'alertType'],
          properties: { channelId: positiveInt, alertType },
        },
      },
    },
    async (req, reply) => {
      const { channelId, alertType } = req.body;
      const db = getDb();

      const channel = await db.query.notificationChannels.findFirst({
        where:   eq(notificationChannels.id, channelId),
        columns: { id: true },
      });
      if (!channel) return reply.status(404).send({ error: 'Channel not found' });

      const duplicate = await db.query.notificationSubscriptions.findFirst({
        where: and(
          eq(notificationSubscriptions.channelId, channelId),
          eq(notificationSubscriptions.alertType, alertType),
        ),
      });
      if (duplicate) return reply.status(409).send({ error: 'Channel is already subscribed to this alert type' });

      const result = await db.insert(notificationSubscriptions).values({ channelId, alertType });
      const newId  = Number(result.lastInsertRowid);
      const row    = await db.query.notificationSubscriptions.findFirst({
        where: eq(notificationSubscriptions.id, newId),
      });

      // Immediately alert for drives already in this condition so the channel
      // doesn't have to wait until the next SMART poll to see its first alert.
      evaluateAndNotifyNewChannel(channelId, [alertType]).catch(err =>
        console.error('[notifications] Initial subscription evaluation failed:', err),
      );

      return reply.status(201).send(rowToSub(row!));
    },
  );

  // DELETE /api/v1/notifications/subscriptions/:id
  app.delete<{ Params: IdParams }>(
    '/api/v1/notifications/subscriptions/:id',
    { schema: { params: idParams } },
    async (req, reply) => {
      const db = getDb();
      await db.delete(notificationSubscriptions).where(eq(notificationSubscriptions.id, req.params.id));
      return reply.status(204).send();
    },
  );

  // ── Drive alert thresholds ────────────────────────────────────────────────

  // GET /api/v1/notifications/thresholds
  app.get('/api/v1/notifications/thresholds', async (_req, reply) => {
    const db   = getDb();
    const rows = await db.select().from(driveAlertThresholds);
    const result: DriveAlertThreshold[] = rows.map(r => ({
      driveId:                     r.driveId,
      temperatureThresholdCelsius: r.temperatureThresholdCelsius,
      tempNormalCelsius:           r.tempNormalCelsius  ?? null,
      tempWarmCelsius:             r.tempWarmCelsius    ?? null,
      tempTooHotCelsius:           r.tempTooHotCelsius  ?? null,
    }));
    return reply.send(result);
  });

  // PUT /api/v1/notifications/thresholds/:driveId
  app.put<{
    Params: DriveIdParams;
    Body: {
      temperatureThresholdCelsius: number;
      tempNormalCelsius?: number | null;
      tempWarmCelsius?:   number | null;
      tempTooHotCelsius?: number | null;
    };
  }>(
    '/api/v1/notifications/thresholds/:driveId',
    {
      schema: {
        params: driveIdParams,
        body:   {
          type:       'object',
          required:   ['temperatureThresholdCelsius'],
          properties: {
            temperatureThresholdCelsius: celsius,
            tempNormalCelsius:           nullableCelsius,
            tempWarmCelsius:             nullableCelsius,
            tempTooHotCelsius:           nullableCelsius,
          },
        },
      },
    },
    async (req, reply) => {
      const driveId = req.params.driveId;
      const {
        temperatureThresholdCelsius,
        tempNormalCelsius  = null,
        tempWarmCelsius    = null,
        tempTooHotCelsius  = null,
      } = req.body;
      const db = getDb();

      const drive = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId), columns: { driveId: true } });
      if (!drive) return reply.status(404).send({ error: 'Drive not found' });

      await db.insert(driveAlertThresholds)
        .values({ driveId, temperatureThresholdCelsius, tempNormalCelsius, tempWarmCelsius, tempTooHotCelsius })
        .onConflictDoUpdate({
          target: driveAlertThresholds.driveId,
          set:    { temperatureThresholdCelsius, tempNormalCelsius, tempWarmCelsius, tempTooHotCelsius },
        });

      const row = await db.query.driveAlertThresholds.findFirst({
        where: eq(driveAlertThresholds.driveId, driveId),
      });
      const result: DriveAlertThreshold = {
        driveId:                     row!.driveId,
        temperatureThresholdCelsius: row!.temperatureThresholdCelsius,
        tempNormalCelsius:           row!.tempNormalCelsius  ?? null,
        tempWarmCelsius:             row!.tempWarmCelsius    ?? null,
        tempTooHotCelsius:           row!.tempTooHotCelsius  ?? null,
      };
      return reply.send(result);
    },
  );

  // DELETE /api/v1/notifications/thresholds/:driveId
  app.delete<{ Params: DriveIdParams }>(
    '/api/v1/notifications/thresholds/:driveId',
    { schema: { params: driveIdParams } },
    async (req, reply) => {
      const db = getDb();
      await db.delete(driveAlertThresholds).where(eq(driveAlertThresholds.driveId, req.params.driveId));
      return reply.status(204).send();
    },
  );
}
