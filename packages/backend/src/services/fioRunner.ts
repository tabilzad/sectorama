import { spawn } from 'child_process';

export type FioRwMode = 'read' | 'randread';

export interface FioJobParams {
  /** Block device or file path (e.g. /dev/sda). */
  devicePath:     string;
  /** I/O access pattern. */
  rwMode:         FioRwMode;
  /** Block size in bytes (e.g. 4096, 1_048_576). */
  blockSizeBytes: number;
  /** Number of concurrent I/Os in flight per job. */
  iodepth:        number;
  /** Number of parallel job processes (merged via --group_reporting). */
  numjobs:        number;
  /** Seconds to run. 0 means run until sizeBytes are read (one-shot). */
  runtimeSecs:    number;
  /** Warm-up seconds before recording results (0 = none). */
  rampTimeSecs:   number;
  /** Starting byte offset on the device. Omit to start at 0. */
  offsetBytes?:   number;
  /** Bytes to read. Required when runtimeSecs is 0. */
  sizeBytes?:     number;
}

export interface FioResult {
  bwBps:     number;   // bytes/second
  iops:      number;
  latMeanNs: number;   // nanoseconds — mean completion latency
  latP50Ns:  number;
  latP95Ns:  number;
  latP99Ns:  number;
  latP999Ns: number;   // 99.9th percentile
}

// ─── Internal: fio --output-format=json shape ─────────────────────────────────

interface FioJsonPercentiles {
  '50.000000': number;
  '95.000000': number;
  '99.000000': number;
  '99.900000': number;
}

interface FioJsonLatStats {
  mean:        number;
  percentile?: FioJsonPercentiles;
}

interface FioJsonReadStats {
  bw:      number;         // KiB/s
  iops:    number;
  // fio puts percentile distributions in clat_ns (completion latency),
  // not lat_ns (total latency). lat_ns only carries mean/min/max/stddev.
  clat_ns: FioJsonLatStats;
  lat_ns:  { mean: number };
}

interface FioJsonJob {
  read: FioJsonReadStats;
}

interface FioJsonOutput {
  jobs: FioJsonJob[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Build the fio CLI argument list from job parameters. */
export function buildFioArgs(params: FioJobParams): string[] {
  const args = [
    '--name=sectorama',
    `--filename=${params.devicePath}`,
    `--rw=${params.rwMode}`,
    `--bs=${params.blockSizeBytes}`,
    `--iodepth=${params.iodepth}`,
    `--numjobs=${params.numjobs}`,
    '--direct=1',
    // psync uses standard pread() — works on every kernel/device/container config.
    // libaio requires aligned async I/O support which fails on some kernels (EINVAL).
    '--ioengine=psync',
    '--readonly',
    '--output-format=json',
    '--group_reporting',   // merge numjobs into one result row
  ];

  if (params.runtimeSecs > 0) {
    args.push('--time_based', `--runtime=${params.runtimeSecs}`);
  }
  if (params.rampTimeSecs > 0) {
    args.push(`--ramp_time=${params.rampTimeSecs}`);
  }
  if (params.offsetBytes !== undefined) {
    args.push(`--offset=${params.offsetBytes}`);
  }
  if (params.sizeBytes !== undefined) {
    args.push(`--size=${params.sizeBytes}`);
  }

  return args;
}

/** Parse a fio JSON blob (--output-format=json) into a FioResult. */
export function parseFioOutput(raw: unknown): FioResult {
  const output = raw as FioJsonOutput;

  if (!Array.isArray(output.jobs) || output.jobs.length === 0) {
    throw new Error('fio JSON output contained no job entries');
  }

  // With --group_reporting the first (and only) entry holds aggregated stats.
  const r   = output.jobs[0].read;
  // Percentile distributions are under clat_ns (completion latency).
  // lat_ns carries mean/min/max but no percentile breakdown.
  const pct = r.clat_ns?.percentile;

  return {
    bwBps:     (r.bw    ?? 0) * 1024,   // KiB/s → bytes/s
    iops:       r.iops  ?? 0,
    latMeanNs:  r.clat_ns?.mean ?? r.lat_ns?.mean ?? 0,
    latP50Ns:   pct?.['50.000000'] ?? 0,
    latP95Ns:   pct?.['95.000000'] ?? 0,
    latP99Ns:   pct?.['99.000000'] ?? 0,
    latP999Ns:  pct?.['99.900000'] ?? 0,
  };
}

/** Spawn fio, collect JSON output, return a parsed FioResult. */
export async function runFioJob(params: FioJobParams): Promise<FioResult> {
  return new Promise((resolve, reject) => {
    const args = buildFioArgs(params);
    const proc = spawn('fio', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', code => {
      // fio sometimes writes warning/error lines to stdout before the JSON blob.
      // Find the first '{' to skip any non-JSON prefix.
      const jsonStart = stdout.indexOf('{');
      if (jsonStart === -1) {
        reject(new Error(
          `fio exited ${code} with no JSON in stdout. ` +
          `stdout: ${stdout.slice(0, 200)} | stderr: ${stderr.slice(0, 200)}`,
        ));
        return;
      }
      try {
        resolve(parseFioOutput(JSON.parse(stdout.slice(jsonStart))));
      } catch (err) {
        reject(new Error(
          `fio output parse failed: ${err}. stdout[0..200]: ${stdout.slice(0, 200)}`,
        ));
      }
    });

    proc.on('error', reject);
  });
}
