import { usePushNotifications } from '@/hooks/usePushNotifications.ts';

export function PushNotificationsCard() {
    const {
        isIos, isStandalone,
        notificationsSupported, pushSupported,
        permission, isSubscribed, isLoading, pushError,
        requestPermission, subscribe, unsubscribe,
    } = usePushNotifications();

    // ── Basic Notification API not available at all ───────────────────────────
    if (!notificationsSupported) {
        return (
            <div className="card mb-6 text-sm text-gray-500">
                Notifications are not supported in this browser.
            </div>
        );
    }

    // ── iOS in-browser Safari: must be installed first ────────────────────────
    if (isIos && !isStandalone) {
        return (
            <div className="card mb-6">
                <h2 className="text-sm font-semibold text-white mb-1">Notifications</h2>
                <p className="text-xs text-gray-500 mb-3">
                    Notifications on iOS require the app to be installed on your Home Screen.
                </p>
                <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                    <li>Tap the <strong className="text-white">Share</strong> button in Safari</li>
                    <li>Choose <strong className="text-white">Add to Home Screen</strong></li>
                    <li>Open the app from your Home Screen and return here</li>
                </ol>
            </div>
        );
    }

    return (
        <div className="card mb-6 space-y-5">
            <div>
                <h2 className="text-sm font-semibold text-white mb-0.5">Notifications</h2>
                <p className="text-xs text-gray-500">
                    Receive drive health and benchmark alerts from Sectorama.
                </p>
            </div>

            {/* ── Step 1: In-app notifications (simple Notification API) ─────── */}
            <div className="space-y-2">
                <p className="text-xs font-medium text-gray-300">In-app alerts</p>
                <p className="text-xs text-gray-500">
                    Show a notification whenever a drive alert or benchmark event fires — works while this tab is open or in the background.
                </p>

                {permission === 'denied' ? (
                    <p className="text-xs text-danger">
                        Notifications are blocked. Enable them in your browser or OS settings, then reload.
                    </p>
                ) : permission === 'granted' ? (
                    <p className="text-xs text-green-400">✓ Enabled</p>
                ) : (
                    <button
                        onClick={requestPermission}
                        className="btn-primary text-xs"
                    >
                        Enable Notifications
                    </button>
                )}
            </div>

            {/* ── Step 2: Background push (Web Push / FCM) — only when granted ─ */}
            {permission === 'granted' && (
                <div className="space-y-2 pt-3 border-t border-surface-300">
                    <p className="text-xs font-medium text-gray-300">Background alerts</p>
                    <p className="text-xs text-gray-500">
                        {pushSupported
                            ? 'Also notify this device when the app is completely closed. Requires the browser to reach its push relay service (Google FCM or Apple APNs).'
                            : 'Background alerts are not supported in this browser — alerts only fire while the tab is open.'}
                    </p>

                    {pushSupported && (isIos && !isStandalone ? null : (
                        <div className="space-y-2">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={isSubscribed ? unsubscribe : subscribe}
                                    disabled={isLoading}
                                    className="btn-primary text-xs disabled:opacity-50"
                                >
                                    {isLoading
                                        ? 'Working…'
                                        : isSubscribed
                                            ? 'Disable Background Alerts'
                                            : 'Enable Background Alerts'}
                                </button>
                                {isSubscribed && (
                                    <span className="text-xs text-green-400">✓ Enabled on this device</span>
                                )}
                            </div>
                            {pushError && (
                                <p className="text-xs text-danger leading-relaxed whitespace-pre-line">{pushError}</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
