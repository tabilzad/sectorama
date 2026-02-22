/** Port of the ColdFusion KBytes() custom function used throughout the legacy app */

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, i);
  return `${parseFloat(val.toFixed(decimals))} ${sizes[i]}`;
}

/** Format bytes/second as MB/s */
export function formatSpeed(bytesPerSec: number, decimals = 2): string {
  return `${(bytesPerSec / 1_000_000).toFixed(decimals)} MB/s`;
}

/** Compact number formatting (e.g. 1234 → "1,234") */
export function formatCount(n: number): string {
  return new Intl.NumberFormat().format(n);
}
