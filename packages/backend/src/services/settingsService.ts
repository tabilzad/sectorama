import { getSqlite } from '../db';
import type { SmartPollingSettings } from '@sectorama/shared';

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

// ─── SMART polling ────────────────────────────────────────────────────────────

const SMART_POLL_SKIP_STANDBY_KEY = 'smart_poll_skip_standby';

export function getSmartPollingSettings(): SmartPollingSettings {
  // Default on: a scheduled poll must never be the reason a sleeping disk spins up.
  return { skipStandby: getSetting(SMART_POLL_SKIP_STANDBY_KEY) !== 'false' };
}

export function setSmartPollingSettings(settings: SmartPollingSettings): void {
  setSetting(SMART_POLL_SKIP_STANDBY_KEY, String(settings.skipStandby));
}
