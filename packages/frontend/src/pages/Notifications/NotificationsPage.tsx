import { useState, useRef, useCallback } from 'react';
import {
  useChannels,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
  useTestChannel,
  useSubscriptions,
  useCreateSubscription,
  useDeleteSubscription,
} from '../../api/hooks/useNotifications';
import ChannelForm from '../../components/notifications/ChannelFormModal';
import type { NotificationChannel, AlertType, ChannelType } from '@sectorama/shared';

// ── Page-level toast ──────────────────────────────────────────────────────────

interface ToastMsg { level: 'ok' | 'error'; title: string; body?: string; }

function Toast({ msg, onDismiss }: { msg: ToastMsg; onDismiss: () => void }) {
  return (
    <div className={`fixed top-16 right-4 z-50 max-w-xs bg-surface-100 rounded-lg px-4 py-3
                     text-sm shadow-lg border flex items-start gap-3 animate-fade-in
                     ${msg.level === 'error' ? 'border-danger/50' : 'border-brand/40'}`}>
      <div className="flex-1">
        <p className={`font-medium ${msg.level === 'error' ? 'text-danger' : 'text-brand'}`}>
          {msg.title}
        </p>
        {msg.body && <p className="text-gray-400 mt-0.5 text-xs">{msg.body}</p>}
      </div>
      <button
        onClick={onDismiss}
        className="text-gray-600 hover:text-gray-300 transition-colors shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

// ── Alert type constants ──────────────────────────────────────────────────────

const ALERT_TYPES: { type: AlertType; label: string }[] = [
  { type: 'smart_error', label: 'SMART Errors' },
  { type: 'temperature', label: 'Temperature'  },
];

// ── Per-channel row ───────────────────────────────────────────────────────────

interface ChannelRowProps {
  channel:   NotificationChannel;
  onToast:   (msg: ToastMsg) => void;
}

function ChannelRow({ channel, onToast }: ChannelRowProps) {
  const [editing, setEditing] = useState(false);
  const updateChannel         = useUpdateChannel();
  const deleteChannel         = useDeleteChannel();
  const testChannel           = useTestChannel();
  const { data: subs }        = useSubscriptions(channel.id);
  const createSub             = useCreateSubscription();
  const deleteSub             = useDeleteSubscription();

  async function handleTest() {
    try {
      await testChannel.mutateAsync(channel.id);
      onToast({ level: 'ok', title: `"${channel.name}" — test sent`, body: 'Check your destination for the sample alert.' });
    } catch (err) {
      onToast({ level: 'error', title: `"${channel.name}" — delivery failed`, body: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  async function handleToggleEnabled() {
    await updateChannel.mutateAsync({ id: channel.id, enabled: !channel.enabled });
  }

  async function handleDelete() {
    if (!window.confirm(`Delete channel "${channel.name}"?`)) return;
    await deleteChannel.mutateAsync(channel.id);
  }

  function isSubscribed(alertType: AlertType) {
    return subs?.some(s => s.alertType === alertType) ?? false;
  }

  async function handleToggleSub(alertType: AlertType) {
    const existing = subs?.find(s => s.alertType === alertType);
    if (existing) {
      await deleteSub.mutateAsync(existing.id);
    } else {
      await createSub.mutateAsync({ channelId: channel.id, alertType });
    }
  }

  return (
    <div className="space-y-0">
      {/* Channel summary row */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          {/* Left: name + meta */}
          <div className="flex items-center gap-3 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${channel.enabled ? 'bg-brand' : 'bg-gray-600'}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{channel.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                <span className="uppercase tracking-wide font-mono">{channel.type}</span>
                {' · '}
                <span className={channel.enabled ? 'text-brand' : 'text-gray-600'}>
                  {channel.enabled ? 'enabled' : 'disabled'}
                </span>
              </p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleTest}
              disabled={testChannel.isPending}
              className="text-xs px-2.5 py-1 rounded border border-surface-300 text-gray-400
                         hover:text-white hover:border-accent/50 transition-colors disabled:opacity-50"
            >
              {testChannel.isPending ? 'Sending…' : 'Test'}
            </button>

            <button
              onClick={handleToggleEnabled}
              className="text-xs px-2.5 py-1 rounded border border-surface-300 text-gray-400
                         hover:text-white hover:border-accent/50 transition-colors"
            >
              {channel.enabled ? 'Disable' : 'Enable'}
            </button>

            <button
              onClick={() => setEditing(e => !e)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                editing
                  ? 'border-accent/60 bg-accent/10 text-white'
                  : 'border-surface-300 text-gray-400 hover:text-white hover:border-accent/50'
              }`}
            >
              {editing ? 'Close' : 'Edit'}
            </button>

            <button
              onClick={handleDelete}
              title="Delete"
              className="text-gray-600 hover:text-danger transition-colors p-1"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* Subscription toggles */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-gray-600 self-center mr-1">Subscribes to:</span>
          {ALERT_TYPES.map(({ type, label }) => {
            const on = isSubscribed(type);
            return (
              <button
                key={type}
                onClick={() => handleToggleSub(type)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  on
                    ? 'border-accent/60 bg-accent/10 text-white'
                    : 'border-surface-300 text-gray-600 hover:text-gray-400'
                }`}
              >
                {on ? '✓ ' : ''}{label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inline edit form — expands below the row */}
      {editing && (
        <div className="ml-4 border-l-2 border-accent/30 pl-4 mt-2">
          <ChannelForm
            initial={channel}
            onSave={async (data) => {
              await updateChannel.mutateAsync({ id: channel.id, ...data });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { data: channels, isLoading } = useChannels();
  const createChannel                  = useCreateChannel();
  const [adding, setAdding]            = useState(false);

  // Page-level toast
  const [toast, setToast]   = useState<ToastMsg | null>(null);
  const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: ToastMsg) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(msg);
    timerRef.current = setTimeout(() => setToast(null), 6000);
  }, []);

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {toast && <Toast msg={toast} onDismiss={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Notification Channels</h1>
          <p className="text-sm text-gray-500 mt-1">
            Alerts fire once on transition — when a condition first occurs, then silent until it clears and re-triggers.
          </p>
        </div>
        <button
          onClick={() => setAdding(a => !a)}
          className={`btn-primary ${adding ? 'opacity-60' : ''}`}
        >
          {adding ? '✕ Cancel' : '+ Add Channel'}
        </button>
      </div>

      <div className="space-y-3">
        {/* Inline add form — appears at the top of the list */}
        {adding && (
          <ChannelForm
            onSave={async (data) => {
              await createChannel.mutateAsync(data as { name: string; type: ChannelType; config: unknown });
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {isLoading ? (
          <p className="text-gray-500 text-center py-16">Loading…</p>
        ) : !channels || channels.length === 0 ? (
          !adding && (
            <div className="card text-center py-16">
              <p className="text-gray-400 mb-2">No notification channels configured.</p>
              <p className="text-sm text-gray-600">
                Add a Webhook or Slack channel to receive alerts when drives report health failures or exceed temperature thresholds.
              </p>
            </div>
          )
        ) : (
          channels.map(ch => (
            <ChannelRow key={ch.id} channel={ch} onToast={showToast} />
          ))
        )}
      </div>
    </div>
  );
}
