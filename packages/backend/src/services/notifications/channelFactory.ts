import type { ChannelType, WebhookChannelConfig, SlackChannelConfig } from '@sectorama/shared';
import type { INotificationChannel } from './types.js';
import { WebhookChannel } from './channels/WebhookChannel.js';
import { SlackChannel } from './channels/SlackChannel.js';

export function createChannel(type: ChannelType, config: unknown): INotificationChannel {
  switch (type) {
    case 'webhook': return new WebhookChannel(config as WebhookChannelConfig);
    case 'slack':   return new SlackChannel(config as SlackChannelConfig);
    default:        throw new Error(`Unknown channel type: ${type as string}`);
  }
}
