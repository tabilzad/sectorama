import type { Alert, BenchmarkCompletePayload, WebhookChannelConfig } from '@sectorama/shared';
import type { INotificationChannel } from '../types.js';

export class WebhookChannel implements INotificationChannel {
  constructor(private readonly cfg: WebhookChannelConfig) {}

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.cfg.auth.type === 'basic') {
      const encoded = Buffer.from(`${this.cfg.auth.username}:${this.cfg.auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    } else if (this.cfg.auth.type === 'bearer') {
      headers['Authorization'] = `Bearer ${this.cfg.auth.token}`;
    }
    return headers;
  }

  async send(alert: Alert): Promise<void> {
    const res = await fetch(this.cfg.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(alert),
    });

    if (!res.ok) {
      throw new Error(`Webhook POST failed: ${res.status} ${res.statusText}`);
    }
  }

  async sendBenchmarkReport(payload: BenchmarkCompletePayload): Promise<void> {
    const res = await fetch(this.cfg.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Webhook POST failed: ${res.status} ${res.statusText}`);
    }
  }
}
