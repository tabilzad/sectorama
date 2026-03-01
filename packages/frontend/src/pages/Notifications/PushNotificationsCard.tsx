import {usePushNotifications} from "@/hooks/usePushNotifications.ts";

export function PushNotificationsCard() {
    const {
        isSupported,
        isIos,
        isStandalone,
        permission,
        isSubscribed,
        isLoading,
        subscribe,
        unsubscribe
    } = usePushNotifications();

    // iOS in-browser Safari: PushManager may exist but subscriptions only
    // work from a Home Screen installed PWA — guide the user first.
    if (isIos && !isStandalone) {
        return (
            <div className="card mb-6">
                <h2 className="text-sm font-semibold text-white mb-1">Browser Push Notifications</h2>
                <p className="text-xs text-gray-500 mb-3">
                    Push notifications on iOS require the app to be installed on your Home Screen.
                </p>
                <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                    <li>Tap the <strong className="text-white">Share</strong> button in Safari</li>
                    <li>Choose <strong className="text-white">Add to Home Screen</strong></li>
                    <li>Open the app from your Home Screen and return here</li>
                </ol>
            </div>
        );
    }

    if (!isSupported) {
        return (
            <div className="card mb-6 text-sm text-gray-500">
                {isIos
                    ? 'Push notifications require iOS 16.4 or later.'
                    : 'Push notifications are not supported in this browser.'}
            </div>
        );
    }

    return (
        <div className="card mb-6">
            <h2 className="text-sm font-semibold text-white mb-1">Browser Push Notifications</h2>
            <p className="text-xs text-gray-500 mb-4">
                Receive instant alerts on this device for drive health issues and temperature thresholds — even when the
                app is in the background.
            </p>
            {permission === 'denied' ? (
                <p className="text-xs text-danger">Push notifications are blocked. Enable them in your browser settings
                    and reload.</p>
            ) : (
                <div className="flex items-center gap-4">
                    <button
                        onClick={isSubscribed ? unsubscribe : subscribe}
                        disabled={isLoading}
                        className="btn-primary text-xs disabled:opacity-50"
                    >
                        {isLoading ? 'Working…' : isSubscribed ? 'Disable Push Notifications' : 'Enable Push Notifications'}
                    </button>
                    {isSubscribed && <span className="text-xs text-green-400">✓ Enabled on this device</span>}
                </div>
            )}
        </div>
    );
}