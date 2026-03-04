export const API = {
  disks: {
    list:              '/disks',
    scan:              '/disks/scan',
    detail:            (id: number) => `/disks/${id}`,
    smart:             (id: number) => `/disks/${id}/smart`,
    smartHistory:      (id: number) => `/disks/${id}/smart/history`,
    benchmarks:        (id: number) => `/disks/${id}/benchmarks`,
    benchmarkSeries:   (id: number) => `/disks/${id}/benchmarks/series`,
    benchmark:         (id: number) => `/disks/${id}/benchmark`,
    benchmarkRun:      (id: number, runId: number) => `/disks/${id}/benchmarks/${runId}`,
    displayPrefs:        (id: number) => `/disks/${id}/display-prefs`,
    displayPrefsOrder:   '/disks/display-prefs/order',
    displayPrefsLayout:  '/disks/display-prefs/layout',
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
  push: {
    vapidKey:    '/push/vapid-public-key',
    subscribe:   '/push/subscribe',
    unsubscribe: '/push/unsubscribe',
  },
  settings: {
    communitySharing: '/settings/community-sharing',
  },
  stats: '/stats',
} as const;
