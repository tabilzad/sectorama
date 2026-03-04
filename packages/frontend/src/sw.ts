/// <reference lib="WebWorker" />
import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string }>;
};

clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  const data = event.data?.json() as { title?: string; body?: string; url?: string; tag?: string } | undefined ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Sectorama', {
      body:  data.body,
      icon:  '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag:   data.tag ?? 'sectorama',
      data:  { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url ?? '/') as string;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => 'focus' in c) as WindowClient | undefined;
      if (win) return win.focus();
      return self.clients.openWindow(url);
    }),
  );
});
