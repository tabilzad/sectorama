import { useEffect, useState, type ReactNode } from 'react';
import {
  SMART_POLL_INTERVAL_CHOICES,
  SMART_POLL_CONCURRENCY_MAX,
  type RuntimeSettingPath,
  type RuntimeSettingsUpdate,
} from '@sectorama/shared';
import {
  useCommunitySharingEnabled,
  useSetCommunitySharingEnabled,
  useRuntimeSettings,
  useUpdateRuntimeSettings,
} from '@/api/hooks/useSettings';
import { useToast } from '@/hooks/useToast.ts';
import { Toast } from '../../components/ui/Toast';
import ToggleSwitch from '../../components/ui/ToggleSwitch';
import { FullPageSpinner } from '../../components/ui/LoadingSpinner';
import ErrorMessage from '../../components/ui/ErrorMessage';
import {
  TemperatureZoneEditor,
  validateZones,
  zonesEqual,
  zonesFromDefaults,
  zonesToDefaults,
  type TemperatureZones,
} from '../../components/temperature/TemperatureZoneEditor';

// ─── Small building blocks ────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Card({ title, badge, description, children }: {
  title: string; badge?: string; description: string; children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-surface-300 bg-surface-100 p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {badge && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-200 text-gray-400">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** One setting: label and hint on the left, the control on the right. A pinned setting says which variable pins it. */
function SettingRow({ label, hint, lockedBy, children }: {
  label: string; hint: string; lockedBy?: string; children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-surface-300 pt-4 first:border-t-0 first:pt-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
        {lockedBy && (
          <p className="text-xs text-gray-500 mt-1">
            Pinned by <code className="text-gray-400">{lockedBy}</code> in the container environment.
            Unset it there to change this here.
          </p>
        )}
      </div>
      <div className="shrink-0 w-40 sm:w-48">{children}</div>
    </div>
  );
}

const inputClass =
  'w-full bg-surface-200 border border-surface-300 rounded-lg px-3 py-2 text-sm text-gray-200 ' +
  'focus:outline-none focus:border-accent disabled:opacity-60 disabled:cursor-not-allowed';

/** Number input that commits on blur or Enter when the value is valid and changed; Escape restores the saved value. */
function NumberSetting({ value, min, max, unit, disabled, label, onCommit }: {
  value: number; min: number; max: number; unit?: string; disabled?: boolean; label: string;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const parsed  = /^\d+$/.test(draft) ? parseInt(draft, 10) : NaN;
  const isValid = Number.isInteger(parsed) && parsed >= min && parsed <= max;

  function commit() {
    if (!isValid) { setDraft(String(value)); return; }
    if (parsed !== value) onCommit(parsed);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        aria-label={label}
        aria-invalid={!isValid}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(String(value));
        }}
        className={`${inputClass} tabular-nums ${isValid ? '' : 'border-danger/60'}`}
      />
      {unit && <span className="text-xs text-gray-500 shrink-0">{unit}</span>}
    </div>
  );
}

function describeInterval(minutes: number): string {
  if (minutes === 1)    return 'Every minute';
  if (minutes < 60)     return `Every ${minutes} minutes`;
  if (minutes === 60)   return 'Every hour';
  if (minutes === 1440) return 'Once a day';
  return `Every ${minutes / 60} hours`;
}

const SHARED_CATEGORIES = [
  { label: 'OS & environment', detail: 'OS type/arch, RAM, fio version, app version' },
  { label: 'Drive identity',   detail: 'Vendor, model, firmware, capacity, interface type' },
  { label: 'SMART scalars',    detail: 'Power-on hours, temperature, reallocated sectors, health status' },
  { label: 'SMART attributes', detail: 'All polled ATA / NVMe attributes with raw values' },
  { label: 'Benchmark results', detail: 'Full position curve + 4 fio profile metrics per run' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const sharing    = useCommunitySharingEnabled();
  const setSharing = useSetCommunitySharingEnabled();
  const runtime    = useRuntimeSettings();
  const update     = useUpdateRuntimeSettings();
  const { toast, showToast, dismissToast } = useToast();

  const [detailsOpen, setDetailsOpen] = useState(false);
  // Local edits to the temperature zones; null = showing the saved values.
  const [zonesDraft, setZonesDraft]   = useState<TemperatureZones | null>(null);

  if (sharing.isLoading || runtime.isLoading) return <FullPageSpinner />;
  if (sharing.isError || runtime.isError || !runtime.data) {
    return <ErrorMessage message="Could not load settings." retry={() => { void sharing.refetch(); void runtime.refetch(); }} />;
  }

  const { settings, defaults, managedByEnv } = runtime.data;
  const lockedBy = (path: RuntimeSettingPath) => managedByEnv[path];
  const saving   = update.isPending;

  async function save(patch: RuntimeSettingsUpdate, body: string) {
    try {
      await update.mutateAsync(patch);
      showToast({ title: 'Settings saved', body, level: 'ok' }, 3000);
      return true;
    } catch (err) {
      showToast({ title: 'Could not save settings', body: err instanceof Error ? err.message : 'Unknown error', level: 'error' });
      return false;
    }
  }

  // ── Temperature zones ──────────────────────────────────────────────────────
  const savedZones    = zonesFromDefaults(settings.temperature);
  const defaultZones  = zonesFromDefaults(defaults.temperature);
  const zones         = zonesDraft ?? savedZones;
  const zonesDirty    = zonesDraft !== null && !zonesEqual(zonesDraft, savedZones);
  const zonesValid    = validateZones(zones).length === 0;
  const zonesAtDefault = zonesEqual(savedZones, defaultZones);

  async function saveZones() {
    if (!zonesDirty || !zonesValid) return;
    if (await save({ temperature: zonesToDefaults(zones) }, 'Temperature defaults updated for drives without their own settings.')) {
      setZonesDraft(null);
    }
  }

  async function resetZones() {
    if (await save({ temperature: defaults.temperature }, 'Temperature defaults restored.')) setZonesDraft(null);
  }

  // ── Community sharing ──────────────────────────────────────────────────────
  const sharingEnabled = sharing.data?.enabled ?? false;

  async function handleToggleSharing() {
    const next = !sharingEnabled;
    try {
      await setSharing.mutateAsync(next);
      showToast({ title: 'Settings saved', body: `Community data sharing ${next ? 'enabled' : 'disabled'}.`, level: 'ok' }, 3000);
    } catch (err) {
      showToast({ title: 'Could not save settings', body: err instanceof Error ? err.message : 'Unknown error', level: 'error' });
    }
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
      <p className="text-sm text-gray-500 mb-6">
        Changes apply immediately and survive restarts. A value set in the container environment is shown read-only.
      </p>

      <div className="space-y-6">
        {/* ── SMART polling ───────────────────────────────────────────────── */}
        <Card
          title="SMART polling"
          description="How often and how gently drive health is read."
        >
          <SettingRow
            label="Skip drives in standby"
            hint="Sleeping disks are left alone and keep their last reading, so monitoring never spins a drive up. Turn off for drives that never spin down."
          >
            <div className="flex justify-end">
              <ToggleSwitch
                checked={settings.smartPolling.skipStandby}
                disabled={saving}
                label="Skip drives in standby during SMART polls"
                onChange={() => void save(
                  { smartPolling: { skipStandby: !settings.smartPolling.skipStandby } },
                  settings.smartPolling.skipStandby ? 'SMART polls now wake drives in standby.' : 'Drives in standby are skipped during SMART polls.',
                )}
              />
            </div>
          </SettingRow>

          <SettingRow
            label="Poll interval"
            hint={`How often every connected drive is read. Each poll stores one history point per drive. Default: ${describeInterval(defaults.smartPolling.intervalMinutes).toLowerCase()}.`}
            lockedBy={lockedBy('smartPolling.intervalMinutes')}
          >
            <select
              className={inputClass}
              value={settings.smartPolling.intervalMinutes}
              disabled={saving || !!lockedBy('smartPolling.intervalMinutes')}
              aria-label="SMART poll interval"
              onChange={e => void save(
                { smartPolling: { intervalMinutes: parseInt(e.target.value, 10) } },
                `SMART polling now runs ${describeInterval(parseInt(e.target.value, 10)).toLowerCase()}.`,
              )}
            >
              {SMART_POLL_INTERVAL_CHOICES.map(m => (
                <option key={m} value={m}>{describeInterval(m)}</option>
              ))}
              {!(SMART_POLL_INTERVAL_CHOICES as readonly number[]).includes(settings.smartPolling.intervalMinutes) && (
                <option value={settings.smartPolling.intervalMinutes}>
                  Every {settings.smartPolling.intervalMinutes} minutes
                </option>
              )}
            </select>
          </SettingRow>

          <SettingRow
            label="Drives polled at once"
            hint={`Upper bound on simultaneous smartctl processes during a poll. Lower it on small hosts or slow controllers. Default: ${defaults.smartPolling.concurrency}.`}
            lockedBy={lockedBy('smartPolling.concurrency')}
          >
            <NumberSetting
              label="Drives polled at once"
              value={settings.smartPolling.concurrency}
              min={1}
              max={SMART_POLL_CONCURRENCY_MAX}
              unit="drives"
              disabled={saving || !!lockedBy('smartPolling.concurrency')}
              onCommit={n => void save({ smartPolling: { concurrency: n } }, `Up to ${n} drive${n === 1 ? '' : 's'} polled at once.`)}
            />
          </SettingRow>
        </Card>

        {/* ── Benchmarks ──────────────────────────────────────────────────── */}
        <Card
          title="Benchmarks"
          description="Defaults for new runs. A schedule or a manual run can still choose its own value."
        >
          <SettingRow
            label="Default sample points"
            hint={`Evenly spaced positions measured across the disk in a position-curve run. More points take longer and show more detail. Default: ${defaults.benchmark.defaultNumPoints}.`}
            lockedBy={lockedBy('benchmark.defaultNumPoints')}
          >
            <NumberSetting
              label="Default sample points"
              value={settings.benchmark.defaultNumPoints}
              min={1}
              max={101}
              unit="points"
              disabled={saving || !!lockedBy('benchmark.defaultNumPoints')}
              onCommit={n => void save({ benchmark: { defaultNumPoints: n } }, `New benchmark runs sample ${n} points by default.`)}
            />
          </SettingRow>
        </Card>

        {/* ── Temperature defaults ────────────────────────────────────────── */}
        <Card
          title="Temperature defaults"
          badge={zonesAtDefault ? 'Built-in defaults' : 'Customised'}
          description="Zones for every drive that has no settings of its own. The Warm → Hot boundary is the temperature alert threshold. Per-drive settings on a drive's page take precedence."
        >
          <TemperatureZoneEditor
            value={zones}
            onChange={setZonesDraft}
            disabled={saving}
            lockedBy={{ alert: lockedBy('temperature.alertCelsius') }}
          />
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-surface-300">
            {!zonesAtDefault && (
              <button
                onClick={() => void resetZones()}
                disabled={saving}
                className="text-xs text-gray-500 hover:text-gray-300 border border-surface-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Reset to built-in defaults
              </button>
            )}
            {zonesDirty && (
              <button
                onClick={() => setZonesDraft(null)}
                disabled={saving}
                className="text-xs text-gray-500 hover:text-gray-300 border border-surface-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Discard changes
              </button>
            )}
            <button
              onClick={() => void saveZones()}
              disabled={!zonesDirty || !zonesValid || saving}
              className="btn-primary text-xs disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save defaults'}
            </button>
          </div>
        </Card>

        {/* ── Community Data Sharing ──────────────────────────────────────── */}
        <Card
          title="Community Data Sharing"
          badge="Off by default"
          description="Anonymously contribute benchmark and SMART data to a public database for cross-vendor and cross-model comparisons."
        >
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs text-gray-500">
              Serial numbers are one-way hashed (SHA-256, 16 hex chars). No personally identifiable
              data is transmitted.
            </p>
            <ToggleSwitch
              checked={sharingEnabled}
              onChange={handleToggleSharing}
              disabled={setSharing.isPending}
              label="Community data sharing"
            />
          </div>

          <div className="border-t border-surface-300 pt-3">
            <button
              onClick={() => setDetailsOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <ChevronIcon open={detailsOpen} />
              What's shared
            </button>

            {detailsOpen && (
              <ul className="mt-3 space-y-2">
                {SHARED_CATEGORIES.map(c => (
                  <li key={c.label} className="flex gap-2 text-xs">
                    <span className="shrink-0 font-medium text-gray-300 w-36">{c.label}</span>
                    <span className="text-gray-500">{c.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {toast && <Toast msg={toast} onDismiss={dismissToast} />}
    </div>
  );
}
