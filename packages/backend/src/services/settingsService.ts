import { getSqlite } from '../db';
import {
  RUNTIME_SETTINGS_DEFAULTS,
  SMART_POLL_INTERVAL_CHOICES,
  SMART_POLL_CONCURRENCY_MAX,
  type RuntimeSettings,
  type RuntimeSettingPath,
  type RuntimeSettingsResponse,
  type RuntimeSettingsUpdate,
  type SmartPollingSettings,
} from '@sectorama/shared';

export function getSetting(key: string): string | null {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
    .get(key);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const sqlite = getSqlite();
  sqlite.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ─── Community sharing ────────────────────────────────────────────────────────

export function getCommunitySharingEnabled(): boolean {
  return getSetting('community_sharing_enabled') === 'true';
}

export function setCommunitySharingEnabled(enabled: boolean): void {
  setSetting('community_sharing_enabled', String(enabled));
}

// ─── Runtime settings ─────────────────────────────────────────────────────────
//
// Each knob resolves in this order:
//   1. its environment variable, when set to a non-blank value (pins the knob;
//      the UI shows it read-only),
//   2. the value saved from the Settings page,
//   3. the built-in default.
// Values that fail to parse are skipped with a warning so one bad entry can
// never take the service down.

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

export const RUNTIME_DEFAULTS: RuntimeSettings = RUNTIME_SETTINGS_DEFAULTS;

type Section = keyof RuntimeSettings;
type Field<S extends Section> = keyof RuntimeSettings[S] & string;
type SettingValue = boolean | number;

interface Knob {
  /** Key in the `settings` table. */
  key:    string;
  /** Environment variable that pins the knob, if any. */
  env?:   string;
  parse:  (raw: string) => SettingValue | undefined;
}

const intIn = (min: number, max: number) => (raw: string): number | undefined => {
  if (!/^\s*\d+\s*$/.test(raw)) return undefined;
  const n = parseInt(raw, 10);
  return n >= min && n <= max ? n : undefined;
};
const bool = (raw: string): boolean | undefined =>
  raw === 'true' ? true : raw === 'false' ? false : undefined;

// The environment accepts any sane interval for backwards compatibility; the
// API restricts new values to SMART_POLL_INTERVAL_CHOICES.
const KNOBS: Record<RuntimeSettingPath, Knob> = {
  'smartPolling.skipStandby':     { key: 'smart_poll_skip_standby',      parse: bool },
  'smartPolling.intervalMinutes': { key: 'smart_poll_interval_minutes',  env: 'SMART_POLL_INTERVAL_MINUTES',          parse: intIn(1, 1440) },
  'smartPolling.concurrency':     { key: 'smart_poll_concurrency',       env: 'SMART_POLL_CONCURRENCY',               parse: intIn(1, SMART_POLL_CONCURRENCY_MAX) },
  'benchmark.defaultNumPoints':   { key: 'benchmark_default_num_points', env: 'BENCHMARK_NUM_POINTS',                 parse: intIn(1, 101) },
  'temperature.normalCelsius':    { key: 'temp_default_normal_celsius',                                                parse: intIn(0, 150) },
  'temperature.warmCelsius':      { key: 'temp_default_warm_celsius',                                                  parse: intIn(0, 150) },
  'temperature.alertCelsius':     { key: 'temp_default_alert_celsius',   env: 'TEMPERATURE_ALERT_THRESHOLD_CELSIUS',  parse: intIn(0, 150) },
  'temperature.tooHotCelsius':    { key: 'temp_default_too_hot_celsius',                                               parse: intIn(0, 150) },
};

const PATHS = Object.keys(KNOBS) as RuntimeSettingPath[];

function splitPath(path: RuntimeSettingPath): [Section, string] {
  const [section, field] = path.split('.') as [Section, string];
  return [section, field];
}

function defaultFor(path: RuntimeSettingPath): SettingValue {
  const [section, field] = splitPath(path);
  return (RUNTIME_DEFAULTS[section] as unknown as Record<string, SettingValue>)[field]!;
}

/** Non-blank environment value, or undefined. A blank value counts as unset so compose can pass `${VAR:-}`. */
function envValue(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const raw = process.env[name];
  return raw !== undefined && raw.trim() !== '' ? raw : undefined;
}

const warned = new Set<string>();
function warnOnce(id: string, message: string): void {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(message);
}

type Source = 'default' | 'env' | 'saved';

function resolve(path: RuntimeSettingPath): { value: SettingValue; source: Source; env?: string } {
  const knob = KNOBS[path];

  const fromEnv = envValue(knob.env);
  if (fromEnv !== undefined) {
    const parsed = knob.parse(fromEnv);
    if (parsed !== undefined) return { value: parsed, source: 'env', env: knob.env };
    warnOnce(`env:${knob.env}`, `[settings] Ignoring invalid ${knob.env}="${fromEnv}"`);
  }

  const saved = getSetting(knob.key);
  if (saved !== null) {
    const parsed = knob.parse(saved);
    if (parsed !== undefined) return { value: parsed, source: 'saved' };
    warnOnce(`saved:${knob.key}`, `[settings] Ignoring invalid saved value for ${knob.key}="${saved}"`);
  }

  return { value: defaultFor(path), source: 'default' };
}

function emptySettings(): RuntimeSettings {
  return {
    smartPolling: { ...RUNTIME_DEFAULTS.smartPolling },
    benchmark:    { ...RUNTIME_DEFAULTS.benchmark },
    temperature:  { ...RUNTIME_DEFAULTS.temperature },
  };
}

function assign(target: RuntimeSettings, path: RuntimeSettingPath, value: SettingValue): void {
  const [section, field] = splitPath(path);
  (target[section] as unknown as Record<string, SettingValue>)[field] = value;
}

/** Effective values for every knob. Cheap: a handful of indexed SQLite lookups. */
export function getRuntimeSettings(): RuntimeSettings {
  const out = emptySettings();
  for (const path of PATHS) assign(out, path, resolve(path).value);
  return out;
}

export function getRuntimeSettingsResponse(): RuntimeSettingsResponse {
  const settings     = emptySettings();
  const managedByEnv: RuntimeSettingsResponse['managedByEnv'] = {};
  for (const path of PATHS) {
    const r = resolve(path);
    assign(settings, path, r.value);
    if (r.source === 'env') managedByEnv[path] = r.env;
  }
  return { settings, defaults: RUNTIME_DEFAULTS, managedByEnv };
}

/** The SMART polling section, read once per sweep by the poller. */
export function getSmartPollingSettings(): SmartPollingSettings {
  return getRuntimeSettings().smartPolling;
}

// ── Change notification ──────────────────────────────────────────────────────

type ChangeListener = (next: RuntimeSettings, previous: RuntimeSettings) => void;
const listeners = new Set<ChangeListener>();

/** Called after a successful update with the full before/after settings. Returns an unsubscribe function. */
export function onRuntimeSettingsChanged(listener: ChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── Update ───────────────────────────────────────────────────────────────────

function validateTemperature(t: RuntimeSettings['temperature']): void {
  const ordered =
    t.normalCelsius < t.warmCelsius &&
    t.warmCelsius   < t.alertCelsius &&
    t.alertCelsius  < t.tooHotCelsius;
  if (!ordered) {
    throw new SettingsValidationError(
      'Temperature zones must increase: normal < warm < alert < too hot ' +
      `(got ${t.normalCelsius}, ${t.warmCelsius}, ${t.alertCelsius}, ${t.tooHotCelsius}).`,
    );
  }
}

function validateInterval(minutes: number): void {
  if (!(SMART_POLL_INTERVAL_CHOICES as readonly number[]).includes(minutes)) {
    throw new SettingsValidationError(
      `SMART poll interval must be one of ${SMART_POLL_INTERVAL_CHOICES.join(', ')} minutes.`,
    );
  }
}

/**
 * Apply a partial update. Fields pinned by an environment variable may only be
 * sent with their current value; anything else is rejected so the UI and the
 * environment can never disagree silently.
 */
export function updateRuntimeSettings(patch: RuntimeSettingsUpdate): RuntimeSettingsResponse {
  const previous = getRuntimeSettings();
  const next     = emptySettings();
  const writes: Array<{ key: string; value: string }> = [];

  for (const path of PATHS) {
    const [section, field] = splitPath(path);
    const current  = resolve(path);
    const incoming = (patch[section] as Record<string, SettingValue | undefined> | undefined)?.[field];

    if (incoming === undefined || incoming === current.value) {
      assign(next, path, current.value);
      continue;
    }
    if (current.source === 'env') {
      throw new SettingsValidationError(
        `${path} is set by the ${current.env} environment variable; change or unset it there.`,
      );
    }
    const parsed = KNOBS[path].parse(String(incoming));
    if (parsed === undefined || typeof parsed !== typeof current.value) {
      throw new SettingsValidationError(`${path}: ${String(incoming)} is out of range.`);
    }
    assign(next, path, parsed);
    writes.push({ key: KNOBS[path].key, value: String(parsed) });
  }

  if (next.smartPolling.intervalMinutes !== previous.smartPolling.intervalMinutes) {
    validateInterval(next.smartPolling.intervalMinutes);
  }
  validateTemperature(next.temperature);

  if (writes.length > 0) {
    const sqlite = getSqlite();
    const stmt   = sqlite.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    sqlite.transaction(() => { for (const w of writes) stmt.run(w.key, w.value); })();
    for (const listener of listeners) {
      try { listener(next, previous); }
      catch (err) { console.error('[settings] Change listener failed:', err); }
    }
  }

  return getRuntimeSettingsResponse();
}
