import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import {
  notificationChannels,
  notificationSubscriptions,
  driveAlertThresholds,
} from '../../db/schema.js';
import { rowToChannel, rowToSub } from '../../db/mappers.js';
import { createChannel } from '../../services/notifications/channelFactory.js';
import { evaluateAndNotifyNewChannel } from '../../services/notifications/notificationService.js';
import type {
  DriveAlertThreshold,
  ChannelType,
  AlertType,
  Alert,
} from '@sectorama/shared';

function validateChannelConfig(type: ChannelType, cfg: unknown): string | null {
  if (!cfg || typeof cfg !== 'object') return 'Config must be an object';
  const obj = cfg as Record<string, unknown>;
  if (type === 'webhook') {
    if (typeof obj['url'] !== 'string' || !obj['url']) return 'Webhook config requires a url field';
    const auth = obj['auth'];
    if (!auth || typeof auth !== 'object') return 'Webhook config requires an auth object';
    const authType = (auth as Record<string, unknown>)['type'];
    if (!['none', 'basic', 'bearer'].includes(String(authType))) {
      return 'auth.type must be none, basic, or bearer';
    }
    if (authType === 'basic') {
      const { username, password } = auth as Record<string, unknown>;
      if (typeof username !== 'string' || !username) return 'Basic auth requires a username';
      if (typeof password !== 'string' || !password) return 'Basic auth requires a password';
    }
    if (authType === 'bearer') {
      if (typeof (auth as Record<string, unknown>)['token'] !== 'string' || !(auth as Record<string, unknown>)['token']) {
        return 'Bearer auth requires a token';
      }
    }
  } else if (type === 'slack') {
    if (typeof obj['webhookUrl'] !== 'string' || !obj['webhookUrl']) {
      return 'Slack config requires a webhookUrl field';
    }
  }
  return null;
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {

  // ── Channels ──────────────────────────────────────────────────────────────

  // GET /api/v1/notifications/channels
  app.get('/api/v1/notifications/channels', async (_req, reply) => {
    const db = getDb();
    const rows = await db.select().from(notificationChannels);
    return reply.send(rows.map(rowToChannel));
  });

  // POST /api/v1/notifications/channels
  app.post<{ Body: { name: string; type: ChannelType; config: unknown } }>(
    '/api/v1/notifications/channels',
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
    Params: { id: string };
    Body: { name?: string; config?: unknown; enabled?: boolean };
  }>('/api/v1/notifications/channels/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
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

    await db.update(notificationChannels).set(updates).where(eq(notificationChannels.id, id));
    const updated = await db.query.notificationChannels.findFirst({
      where: eq(notificationChannels.id, id),
    });
    return reply.send(rowToChannel(updated!));
  });

  // DELETE /api/v1/notifications/channels/:id
  app.delete<{ Params: { id: string } }>('/api/v1/notifications/channels/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    const db = getDb();
    await db.delete(notificationChannels).where(eq(notificationChannels.id, id));
    return reply.status(204).send();
  });

  // POST /api/v1/notifications/channels/:id/test
  app.post<{ Params: { id: string } }>('/api/v1/notifications/channels/:id/test', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    const db = getDb();

    const row = await db.query.notificationChannels.findFirst({
      where: eq(notificationChannels.id, id),
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
  });

  // ── Subscriptions ─────────────────────────────────────────────────────────

  // GET /api/v1/notifications/subscriptions[?channelId=]
  app.get<{ Querystring: { channelId?: string } }>(
    '/api/v1/notifications/subscriptions',
    async (req, reply) => {
      const db = getDb();
      if (req.query.channelId) {
        const cid = parseInt(req.query.channelId, 10);
        const rows = await db
          .select()
          .from(notificationSubscriptions)
          .where(eq(notificationSubscriptions.channelId, cid));
        return reply.send(rows.map(rowToSub));
      }
      const rows = await db.select().from(notificationSubscriptions);
      return reply.send(rows.map(rowToSub));
    },
  );

  // POST /api/v1/notifications/subscriptions
  app.post<{ Body: { channelId: number; alertType: AlertType } }>(
    '/api/v1/notifications/subscriptions',
    async (req, reply) => {
      const { channelId, alertType } = req.body;
      const db = getDb();

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
  app.delete<{ Params: { id: string } }>(
    '/api/v1/notifications/subscriptions/:id',
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      const db = getDb();
      await db.delete(notificationSubscriptions).where(eq(notificationSubscriptions.id, id));
      return reply.status(204).send();
    },
  );

  // ── Drive alert thresholds ────────────────────────────────────────────────

  // GET /api/v1/notifications/thresholds
  app.get('/api/v1/notifications/thresholds', async (_req, reply) => {
    const db = getDb();
    const rows = await db.select().from(driveAlertThresholds);
    const result: DriveAlertThreshold[] = rows.map(r => ({
      driveId: r.driveId,
      temperatureThresholdCelsius: r.temperatureThresholdCelsius,
    }));
    return reply.send(result);
  });

  // PUT /api/v1/notifications/thresholds/:driveId
  app.put<{ Params: { driveId: string }; Body: { temperatureThresholdCelsius: number } }>(
    '/api/v1/notifications/thresholds/:driveId',
    async (req, reply) => {
      const driveId = parseInt(req.params.driveId, 10);
      const { temperatureThresholdCelsius } = req.body;
      const db = getDb();

      await db.insert(driveAlertThresholds)
        .values({ driveId, temperatureThresholdCelsius })
        .onConflictDoUpdate({
          target: driveAlertThresholds.driveId,
          set: { temperatureThresholdCelsius },
        });

      const row = await db.query.driveAlertThresholds.findFirst({
        where: eq(driveAlertThresholds.driveId, driveId),
      });
      const result: DriveAlertThreshold = {
        driveId: row!.driveId,
        temperatureThresholdCelsius: row!.temperatureThresholdCelsius,
      };
      return reply.send(result);
    },
  );

  // DELETE /api/v1/notifications/thresholds/:driveId
  app.delete<{ Params: { driveId: string } }>(
    '/api/v1/notifications/thresholds/:driveId',
    async (req, reply) => {
      const driveId = parseInt(req.params.driveId, 10);
      const db = getDb();
      await db.delete(driveAlertThresholds).where(eq(driveAlertThresholds.driveId, driveId));
      return reply.status(204).send();
    },
  );
}
