import type { Alert, BenchmarkCompletePayload, SlackChannelConfig } from '@sectorama/shared';
import type { INotificationChannel } from '../types.js';

export class SlackChannel implements INotificationChannel {
  constructor(private readonly cfg: SlackChannelConfig) {}

  async send(alert: Alert): Promise<void> {
    const emoji =
      alert.type === 'temperature'          ? '🌡️' :
      alert.type === 'temperature_recovery' ? '✅' : '⚠️';
    const label =
      alert.type === 'temperature'          ? 'Temperature Alert'     :
      alert.type === 'temperature_recovery' ? 'Temperature Recovered' : 'SMART Health Error';

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

  async sendBenchmarkReport(payload: BenchmarkCompletePayload): Promise<void> {
    const succeeded = payload.run.status === 'completed';
    const emoji = succeeded ? '✅' : '❌';
    const title = succeeded ? 'Benchmark Complete' : 'Benchmark Failed';

    const durationStr = `${payload.run.durationSeconds}s`;

    const slackPayload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${emoji} ${title}`, emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Drive:*\n${payload.drive.vendor} ${payload.drive.model}` },
            { type: 'mrkdwn', text: `*Run #:*\n${payload.run.id}` },
            { type: 'mrkdwn', text: `*Duration:*\n${durationStr}` },
            { type: 'mrkdwn', text: `*Points:*\n${payload.run.numPoints}` },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: [
                payload.scheduleLabel ? `Schedule: ${payload.scheduleLabel}` : null,
                `Timestamp: ${payload.timestamp}`,
              ].filter(Boolean).join(' · '),
            },
          ],
        },
      ],
    };

    const res = await fetch(this.cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });

    if (!res.ok) {
      throw new Error(`Slack webhook POST failed: ${res.status} ${res.statusText}`);
    }
  }
}
