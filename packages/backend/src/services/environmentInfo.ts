import * as os from 'os';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { EnvironmentInfo } from '@sectorama/shared';

const execFileAsync = promisify(execFile);

function readSwap(): { total: number; active: boolean } {
  try {
    const lines = fs.readFileSync('/proc/swaps', 'utf8').split('\n').slice(1).filter(Boolean);
    let totalKiB = 0;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) totalKiB += parseInt(parts[2], 10) || 0;
    }
    return { total: totalKiB * 1024, active: totalKiB > 0 };
  } catch {
    return { total: 0, active: false };
  }
}

async function getFioVersion(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('fio', ['--version']);
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

export async function gatherEnvironmentInfo(): Promise<EnvironmentInfo> {
  const swap = readSwap();
  const fioVersion = await getFioVersion();
  return {
    osType:         os.type(),
    osRelease:      os.release(),
    osArch:         os.arch(),
    fioVersion,
    appVersion:     process.env['APP_VERSION'] ?? 'dev',
    ramTotalBytes:  os.totalmem(),
    swapTotalBytes: swap.total,
    swapActive:     swap.active,
  };
}
