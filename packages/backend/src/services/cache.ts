import { LRUCache } from 'lru-cache';

// ── Tiered cache: short-lived for stats/vendors, long-lived for benchmarks ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCache = LRUCache<string, any>;

/** 5-minute cache for frequently-updated aggregates */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const shortCache: AnyCache = new LRUCache<string, any>({
  max: 500,
  ttl: 5 * 60 * 1_000,           // 5 minutes
  allowStale: false,
});

/** 24-hour cache for expensive queries that rarely change */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const longCache: AnyCache = new LRUCache<string, any>({
  max: 1_000,
  ttl: 24 * 60 * 60 * 1_000,     // 24 hours
  allowStale: true,
});

/** Image listing cache — refreshed once per day */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const imageCache: AnyCache = new LRUCache<string, any>({
  max: 200,
  ttl: 24 * 60 * 60 * 1_000,
  allowStale: true,
});

/** Typed helper — get or compute and cache */
export async function cached<T>(
  cache: AnyCache,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key) as T | undefined;
  if (hit !== undefined) return hit;
  const value = await fn();
  cache.set(key, value);
  return value;
}

/** Invalidate all caches (called when new benchmarks arrive) */
export function invalidateAll(): void {
  shortCache.clear();
  // Don't clear longCache for benchmark data — it's expensive to rebuild
  // Instead, use targeted deletion
}

/** Invalidate entries matching a prefix */
export function invalidatePrefix(cache: AnyCache, prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
