export interface MountInfoEntry {
  /** Decoded mount point path. */
  mountPoint: string;
  /** "major:minor" of the mounted filesystem (st_dev of files on it). */
  majorMinor: string;
  fsType: string;
  /** Mount source as listed (e.g. /dev/sdb1, shfs, overlay). */
  source: string;
}

/** Decode the \ooo octal escapes mountinfo uses for spaces, tabs, newlines, and backslashes. */
function decodeField(raw: string): string {
  return raw.replace(/\\([0-7]{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

/**
 * Parse /proc/self/mountinfo (see proc(5)). One line per mount:
 *
 *   36 35 98:0 /mnt1 /mnt2 rw,noatime master:1 - ext3 /dev/root rw,errors=continue
 *   id parent maj:min root mountpoint options [optional fields…] - fstype source superopts
 *
 * The optional-field list is variable length, so the line is split on the
 * " - " separator rather than by fixed column.
 */
export function parseMountInfo(text: string): MountInfoEntry[] {
  const entries: MountInfoEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const sep = line.indexOf(' - ');
    if (sep === -1) continue;
    const pre  = line.slice(0, sep).trim().split(/\s+/);
    const post = line.slice(sep + 3).trim().split(/\s+/);
    if (pre.length < 5 || post.length < 2) continue;
    entries.push({
      majorMinor: pre[2],
      mountPoint: decodeField(pre[4]),
      fsType:     post[0],
      source:     decodeField(post[1]),
    });
  }
  return entries;
}
