import type { Alert } from '@sectorama/shared';

export interface INotificationChannel {
  send(alert: Alert): Promise<void>;
}
