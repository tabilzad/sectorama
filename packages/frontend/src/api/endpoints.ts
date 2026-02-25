export const API = {
  disks: {
    list:            '/disks',
    scan:            '/disks/scan',
    detail:          (id: number) => `/disks/${id}`,
    smart:           (id: number) => `/disks/${id}/smart`,
    smartHistory:    (id: number) => `/disks/${id}/smart/history`,
    benchmarks:      (id: number) => `/disks/${id}/benchmarks`,
    benchmarkSeries: (id: number) => `/disks/${id}/benchmarks/series`,
    benchmark:       (id: number) => `/disks/${id}/benchmark`,
    benchmarkRun:    (id: number, runId: number) => `/disks/${id}/benchmarks/${runId}`,
  },
  schedules: {
    list:   '/schedules',
    detail: (id: number) => `/schedules/${id}`,
  },
  notifications: {
    channels:      '/notifications/channels',
    channel:       (id: number) => `/notifications/channels/${id}`,
    channelTest:   (id: number) => `/notifications/channels/${id}/test`,
    subscriptions: '/notifications/subscriptions',
    subscription:  (id: number) => `/notifications/subscriptions/${id}`,
    thresholds:    '/notifications/thresholds',
    threshold:     (driveId: number) => `/notifications/thresholds/${driveId}`,
  },
  stats: '/stats',
} as const;
