import type { Alert, WebhookChannelConfig } from '@sectorama/shared';
import type { INotificationChannel } from '../types.js';

export class WebhookChannel implements INotificationChannel {
  constructor(private readonly cfg: WebhookChannelConfig) {}

  async send(alert: Alert): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (this.cfg.auth.type === 'basic') {
      const encoded = Buffer.from(`${this.cfg.auth.username}:${this.cfg.auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    } else if (this.cfg.auth.type === 'bearer') {
      headers['Authorization'] = `Bearer ${this.cfg.auth.token}`;
    }

    const res = await fetch(this.cfg.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(alert),
    });

    if (!res.ok) {
      throw new Error(`Webhook POST failed: ${res.status} ${res.statusText}`);
    }
  }
}
