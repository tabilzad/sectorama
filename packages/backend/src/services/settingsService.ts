import { getSqlite } from '../db';

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

export function getCommunitySharingEnabled(): boolean {
  return getSetting('community_sharing_enabled') === 'true';
}

export function setCommunitySharingEnabled(enabled: boolean): void {
  setSetting('community_sharing_enabled', String(enabled));
}
