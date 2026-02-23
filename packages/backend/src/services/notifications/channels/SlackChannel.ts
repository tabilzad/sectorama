import type { Alert, SlackChannelConfig } from '@sectorama/shared';
import type { INotificationChannel } from '../types.js';

export class SlackChannel implements INotificationChannel {
  constructor(private readonly cfg: SlackChannelConfig) {}

  async send(alert: Alert): Promise<void> {
    const emoji = alert.type === 'temperature' ? '🌡️' : '⚠️';
    const label = alert.type === 'temperature' ? 'Temperature Alert' : 'SMART Health Error';

    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${emoji} ${label}`, emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Drive:*\n${alert.driveModel}` },
            { type: 'mrkdwn', text: `*Serial:*\n${alert.driveSerial}` },
            { type: 'mrkdwn', text: `*Message:*\n${alert.message}` },
            ...(alert.value !== undefined
              ? [{ type: 'mrkdwn', text: `*Value:*\n${alert.value}${alert.threshold !== undefined ? ` (threshold: ${alert.threshold})` : ''}` }]
              : []),
          ],
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Timestamp: ${alert.timestamp}` }],
        },
      ],
    };

    const res = await fetch(this.cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Slack webhook POST failed: ${res.status} ${res.statusText}`);
    }
  }
}
