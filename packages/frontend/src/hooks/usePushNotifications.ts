import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { API } from '../api/endpoints';

// iOS 18.4+ Declarative Web Push exposes pushManager directly on window
// (lowercase) rather than only on a service worker registration.
// Older standard Web Push uses 'PushManager' (uppercase) on the registration.
type WindowWithPushManager = Window & { pushManager?: PushManager };

function getWindowPushManager(): PushManager | null {
  return (window as WindowWithPushManager).pushManager ?? null;
}

function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function getPushManager(): Promise<PushManager | null> {
  // Prefer window.pushManager (Declarative Web Push, iOS 18.4+)
  const win = getWindowPushManager();
  if (win) return win;
  // Fall back to service-worker registration (standard Web Push)
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager;
  }
  return null;
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function usePushNotifications() {
  const isIos        = detectIos();
  const isStandalone = detectStandalone();

  // Supported if either Declarative Web Push (window.pushManager) or
  // standard Web Push (PushManager class + serviceWorker) is available.
  const isSupported = typeof window !== 'undefined' && 'Notification' in window && (
    'pushManager' in window ||
    ('PushManager' in window && 'serviceWorker' in navigator)
  );

  const [permission,   setPermission]   = useState<PushPermission>(
    !isSupported ? 'unsupported' : Notification.permission as PushPermission,
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading,    setIsLoading]    = useState(false);

  useEffect(() => {
    if (!isSupported) return;
    getPushManager().then(pm => pm?.getSubscription().then(sub => setIsSubscribed(!!sub)));
  }, [isSupported]);

  async function subscribe() {
    setIsLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== 'granted') return;

      const pm = await getPushManager();
      if (!pm) return;

      const { data } = await api.get<{ publicKey: string }>(API.push.vapidKey);
      const sub = await pm.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api.post(API.push.subscribe, json);
      setIsSubscribed(true);
    } finally {
      setIsLoading(false);
    }
  }

  async function unsubscribe() {
    setIsLoading(true);
    try {
      const pm = await getPushManager();
      const sub = await pm?.getSubscription();
      if (!sub) return;
      await api.delete(API.push.unsubscribe, { data: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }

  return { isSupported, isIos, isStandalone, permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
