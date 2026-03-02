import type { Alert, BenchmarkCompletePayload } from '@sectorama/shared';

export interface INotificationChannel {
  send(alert: Alert): Promise<void>;
  sendBenchmarkReport(payload: BenchmarkCompletePayload): Promise<void>;
}
