import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { API } from '../api/endpoints';

// ── Platform detection ────────────────────────────────────────────────────────

type WindowWithPushManager = Window & { pushManager?: PushManager };

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

function isValidVapidKey(bytes: Uint8Array<ArrayBuffer>): boolean {
    // Uncompressed P-256 point: 65 bytes, first byte 0x04
    return bytes.length === 65 && bytes[0] === 0x04;
}

async function getPushManager(): Promise<PushManager | null> {
    // iOS 18.4+ Declarative Web Push: pushManager lives on window directly
    const win = (window as WindowWithPushManager).pushManager;
    if (win) return win;
    // Standard Web Push: use service worker registration
    if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        return reg.pushManager;
    }
    return null;
}

// ── Exported helper — show a native notification directly from page context.
// Works whenever Notification.permission === 'granted' and the tab is open.
// On iOS this requires the installed PWA context; catches are silenced.
export function showNativeNotification(title: string, options?: NotificationOptions): void {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
        const n = new Notification(title, { icon: '/pwa-192x192.png', badge: '/pwa-192x192.png', ...options });
        setTimeout(() => n.close(), 10_000);
    } catch {
        // Silently ignore — iOS in-browser doesn't support new Notification()
    }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type NotifPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function usePushNotifications() {
    const isIos        = detectIos();
    const isStandalone = detectStandalone();

    // Basic Notification API — works in most browsers when tab is open
    const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;

    // Web Push — needed for background (closed-tab) delivery
    const pushSupported = notificationsSupported && (
        'pushManager' in window ||
        ('PushManager' in window && 'serviceWorker' in navigator)
    );

    const [permission, setPermission] = useState<NotifPermission>(
        !notificationsSupported ? 'unsupported' : Notification.permission as NotifPermission,
    );
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading,    setIsLoading]    = useState(false);
    const [pushError,    setPushError]    = useState<string | null>(null);

    // Sync permission state if it changed externally (e.g. user reset in browser settings)
    useEffect(() => {
        if (!notificationsSupported) return;
        setPermission(Notification.permission as NotifPermission);
    }, [notificationsSupported]);

    // Check for an existing Web Push subscription on mount
    useEffect(() => {
        if (!pushSupported) return;
        getPushManager().then(pm => pm?.getSubscription().then(sub => setIsSubscribed(!!sub)));
    }, [pushSupported]);

    /** Step 1 — ask the browser for notification permission (no FCM, no service worker). */
    const requestPermission = useCallback(async (): Promise<NotifPermission> => {
        if (!notificationsSupported) return 'unsupported';
        const result = await Notification.requestPermission();
        setPermission(result as NotifPermission);
        return result as NotifPermission;
    }, [notificationsSupported]);

    /** Step 2 — register a Web Push subscription with the server (requires FCM/APNs). */
    async function subscribe() {
        setIsLoading(true);
        setPushError(null);
        try {
            // Ensure permission is granted before attempting FCM registration
            if (Notification.permission !== 'granted') {
                const perm = await Notification.requestPermission();
                setPermission(perm as NotifPermission);
                if (perm !== 'granted') return;
            }

            const pm = await getPushManager();
            if (!pm) {
                setPushError('Could not access the browser push manager. Try refreshing the page.');
                return;
            }

            const { data } = await api.get<{ publicKey: string }>(API.push.vapidKey);
            const keyBytes = urlBase64ToUint8Array(data.publicKey);
            if (!isValidVapidKey(keyBytes)) {
                setPushError(`Invalid VAPID public key (${keyBytes.length} bytes, expected 65). Restart the server to regenerate.`);
                return;
            }

            const sub = await pm.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
            const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
            await api.post(API.push.subscribe, json);
            setIsSubscribed(true);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.toLowerCase().includes('push service') || msg.toLowerCase().includes('registration failed')) {
                setPushError(
                    'The browser could not reach its push relay (FCM / APNs).\n\n' +
                    'Likely causes:\n' +
                    '① FCM blocked by firewall/VPN — check DevTools → Network for fcm.googleapis.com during retry.\n' +
                    '② Self-signed cert not trusted by OS — regenerate with mkcert or add to OS trust store.\n\n' +
                    'In-app alerts (while this tab is open) still work regardless.',
                );
            } else {
                setPushError(msg);
            }
        } finally {
            setIsLoading(false);
        }
    }

    async function unsubscribe() {
        setIsLoading(true);
        setPushError(null);
        try {
            const pm = await getPushManager();
            const sub = await pm?.getSubscription();
            if (!sub) return;
            await api.delete(API.push.unsubscribe, { data: { endpoint: sub.endpoint } });
            await sub.unsubscribe();
            setIsSubscribed(false);
        } catch (err) {
            setPushError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    }

    return {
        isIos, isStandalone,
        notificationsSupported, pushSupported,
        permission, isSubscribed, isLoading, pushError,
        requestPermission, subscribe, unsubscribe,
    };
}
