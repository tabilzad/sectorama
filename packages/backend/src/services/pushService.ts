import webPush from 'web-push';
import { eq } from 'drizzle-orm';
import { getSqlite, getDb } from '../db/index.js';
import { pushSubscriptions, settings } from '../db/schema.js';
import type { PushSubscriptionPayload } from '@sectorama/shared';

let _publicKey = '';

export function initVapid(): void {
  const sqlite  = getSqlite();
  const pubRow  = sqlite.prepare<[string], { value: string }>('SELECT value FROM settings WHERE key=?').get('vapid_public_key');
  const privRow = sqlite.prepare<[string], { value: string }>('SELECT value FROM settings WHERE key=?').get('vapid_private_key');

  let publicKey  = pubRow?.value  ?? '';
  let privateKey = privRow?.value ?? '';

  if (!publicKey || !privateKey) {
    const keys = webPush.generateVAPIDKeys();
    publicKey  = keys.publicKey;
    privateKey = keys.privateKey;
    sqlite.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('vapid_public_key',  publicKey);
    sqlite.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('vapid_private_key', privateKey);
    console.log('[push] Generated new VAPID keys. Public key:', publicKey);
  }

  // VAPID_SUBJECT must be a mailto: or https: URI without 'localhost'.
  // Apple's push service (web.push.apple.com) rejects subjects containing
  // localhost with 403 BadJwtToken. Use your actual domain in production.
  const subject = process.env['VAPID_SUBJECT'] ?? 'mailto:push@sectorama.local';
  if (subject.includes('localhost')) {
    console.warn('[push] VAPID_SUBJECT contains "localhost" — Apple push delivery will fail with 403 BadJwtToken. Set VAPID_SUBJECT=mailto:you@yourdomain.com in your environment.');
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  _publicKey = publicKey;
}

export function getVapidPublicKey(): string { return _publicKey; }

export async function savePushSubscription(payload: PushSubscriptionPayload): Promise<void> {
  const db = getDb();
  await db.insert(pushSubscriptions)
    .values({
      endpoint:  payload.endpoint,
      p256dh:    payload.keys.p256dh,
      auth:      payload.keys.auth,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set:    { p256dh: payload.keys.p256dh, auth: payload.keys.auth },
    });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function sendPushToAll(notification: { title: string; body: string; url: string; tag?: string }): Promise<void> {
  const db   = getDb();
  const subs = await db.select().from(pushSubscriptions);
  const payload = JSON.stringify(notification);

  await Promise.allSettled(subs.map(async (sub) => {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        // Subscription expired — prune it
        await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
      } else {
        console.error('[push] sendNotification failed:', err);
      }
    }
  }));
}
