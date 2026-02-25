import { useState } from 'react';
import { FormInput } from '../ui/FormInput';
import { FormSelect } from '../ui/FormSelect';
import type { NotificationChannel, ChannelType, WebhookChannelConfig, SlackChannelConfig } from '@sectorama/shared';

interface Props {
  initial?: NotificationChannel;
  onSave:   (data: { name: string; type: ChannelType; config: unknown }) => Promise<void>;
  onCancel: () => void;
}

type AuthType = 'none' | 'basic' | 'bearer';

/** Inline (non-modal) form for creating or editing a notification channel. */
export default function ChannelForm({ initial, onSave, onCancel }: Props) {
  const [name, setName]     = useState(initial?.name ?? '');
  const [type, setType]     = useState<ChannelType>(initial?.type ?? 'webhook');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Webhook fields
  const initWebhook = initial?.type === 'webhook' ? (initial.config as WebhookChannelConfig) : null;
  const [webhookUrl, setWebhookUrl]   = useState(initWebhook?.url ?? '');
  const [authType, setAuthType]       = useState<AuthType>(initWebhook?.auth.type ?? 'none');
  const [username, setUsername]       = useState(
    initWebhook?.auth.type === 'basic' ? initWebhook.auth.username : '',
  );
  const [password, setPassword]       = useState(
    initWebhook?.auth.type === 'basic' ? initWebhook.auth.password : '',
  );
  const [bearerToken, setBearerToken] = useState(
    initWebhook?.auth.type === 'bearer' ? initWebhook.auth.token : '',
  );

  // Slack fields
  const initSlack = initial?.type === 'slack' ? (initial.config as SlackChannelConfig) : null;
  const [slackUrl, setSlackUrl] = useState(initSlack?.webhookUrl ?? '');

  function buildConfig(): unknown {
    if (type === 'webhook') {
      let auth: WebhookChannelConfig['auth'];
      if (authType === 'basic')       auth = { type: 'basic', username, password };
      else if (authType === 'bearer') auth = { type: 'bearer', token: bearerToken };
      else                            auth = { type: 'none' };
      return { url: webhookUrl, auth } satisfies WebhookChannelConfig;
    }
    return { webhookUrl: slackUrl } satisfies SlackChannelConfig;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({ name, type, config: buildConfig() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card border-accent/30 bg-surface-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-white">
          {initial ? 'Edit Channel' : 'New Channel'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Cancel"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">

          {/* Name */}
          <FormInput
            label="Name"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. My Slack"
          />

          {/* Type selector */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <div className="flex gap-2">
              {(['webhook', 'slack'] as ChannelType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    type === t
                      ? 'border-accent bg-accent/10 text-white'
                      : 'border-surface-300 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {t === 'webhook' ? 'Webhook' : 'Slack'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Webhook fields ── */}
          {type === 'webhook' && (
            <>
              <div className="sm:col-span-2">
                <FormInput
                  label="URL"
                  required
                  type="url"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  extraClassName="font-mono"
                />
              </div>

              <FormSelect
                label="Authentication"
                value={authType}
                onChange={e => setAuthType(e.target.value as AuthType)}
              >
                <option value="none">None</option>
                <option value="basic">Basic (username / password)</option>
                <option value="bearer">Bearer token</option>
              </FormSelect>

              {authType === 'basic' && (
                <>
                  <FormInput
                    label="Username"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                  />
                  <FormInput
                    label="Password"
                    required
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </>
              )}

              {authType === 'bearer' && (
                <FormInput
                  label="Token"
                  required
                  value={bearerToken}
                  onChange={e => setBearerToken(e.target.value)}
                  placeholder="Bearer token"
                  extraClassName="font-mono"
                />
              )}
            </>
          )}

          {/* ── Slack fields ── */}
          {type === 'slack' && (
            <div className="sm:col-span-2">
              <FormInput
                label="Slack Webhook URL"
                required
                type="url"
                value={slackUrl}
                onChange={e => setSlackUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                extraClassName="font-mono"
              />
            </div>
          )}
        </div>

        {error && <p className="text-xs text-danger mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
