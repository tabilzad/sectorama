import { eq, and, inArray } from 'drizzle-orm';
import { Point } from '@influxdata/influxdb-client';
import { getDb } from '../db/index.js';
import { drives, benchmarkRuns } from '../db/schema.js';
import { getWriteApi } from '../db/influx.js';
import { broadcast } from '../ws/liveFeed.js';
import { config } from '../config.js';
import { runFioJob } from './fioRunner.js';
import { BENCHMARK_PROFILES, mockProfileResults } from './benchmarkProfiles.js';
import type {
  BenchmarkRunDetail,
  BenchmarkPoint,
  BenchmarkSeries,
  ProfileResult,
  BenchmarkProfile,
} from '@sectorama/shared';

// Each position-curve measurement reads this many bytes from one offset.
const CURVE_SAMPLE_BYTES = 128 * 1024 * 1024; // 128 MiB

/**
 * Resolve the block device path suitable for fio.
 * smartctl --scan returns NVMe controller devices (e.g. /dev/nvme0), which are
 * character devices. fio must target the namespace block device (/dev/nvme0n1).
 * SATA/SAS device paths are returned unchanged.
 */
function fioDevicePath(devicePath: string): string {
  // Match /dev/nvme<N> with no suffix — append n1 for namespace 1.
  return devicePath.replace(/^(\/dev\/nvme\d+)$/, '$1n1');
}

// ─── Position curve helpers ───────────────────────────────────────────────────

// O_DIRECT requires offsets and sizes to be multiples of the device's physical
// block size. 4096 bytes satisfies both 512-byte and 4 KiB sector devices.
const SECTOR_ALIGN = 4096;

/** Generate N evenly-spaced byte offsets across the disk, aligned to SECTOR_ALIGN. */
function computeOffsets(capacity: number, numPoints: number): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < numPoints; i++) {
    const fraction   = numPoints === 1 ? 0 : i / (numPoints - 1);
    const maxOffset  = Math.max(0, capacity - CURVE_SAMPLE_BYTES);
    const rawOffset  = fraction * maxOffset;
    // Floor to nearest sector boundary so O_DIRECT pread() never gets EINVAL.
    const aligned    = Math.floor(rawOffset / SECTOR_ALIGN) * SECTOR_ALIGN;
    offsets.push(aligned);
  }
  return offsets;
}

/**
 * Read 128 MiB sequentially from a specific byte offset using fio.
 * Returns bytes/second for that disk position.
 */
async function measurePosition(devicePath: string, offsetBytes: number): Promise<number> {
  const result = await runFioJob({
    devicePath,
    rwMode:         'read',
    blockSizeBytes: 1024 * 1024,  // 1 MiB blocks
    iodepth:        1,
    numjobs:        1,
    runtimeSecs:    0,            // run until sizeBytes are consumed
    rampTimeSecs:   0,
    offsetBytes,
    sizeBytes:      CURVE_SAMPLE_BYTES,
  });
  return result.bwBps;
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/** Generate a synthetic speed curve for Windows dev / CI. */
function mockSpeedCurve(capacity: number, numPoints: number, driveType: string): BenchmarkPoint[] {
  const offsets = computeOffsets(capacity, numPoints);
  return offsets.map((position, i) => {
    const fraction = i / Math.max(numPoints - 1, 1);
    let baseMBps: number;
    if (driveType === 'SSD' || driveType === 'NVMe') {
      baseMBps = 500 + Math.random() * 50;
    } else {
      baseMBps = 160 * (1 - fraction * 0.5) + Math.random() * 10;
    }
    return { position, speedBps: baseMBps * 1e6 };
  });
}

// ─── InfluxDB helpers ─────────────────────────────────────────────────────────

/** Write position-curve points to the benchmark_points measurement. */
async function writeCurvePoints(
  points:     BenchmarkPoint[],
  serial:     string,
  runId:      number,
  driveType:  string,
  startTs:    number,
): Promise<void> {
  const writeApi = getWriteApi();
  for (let i = 0; i < points.length; i++) {
    const p = new Point('benchmark_points')
      .tag('serial',     serial)
      .tag('run_id',     String(runId))
      .tag('drive_type', driveType)
      .intField('position',    points[i].position)
      .floatField('speed_bps', points[i].speedBps)
      .timestamp(startTs + i);
    writeApi.writePoint(p);
  }
  await writeApi.flush();
}

/** Write fio profile results to the benchmark_profiles measurement. */
async function writeProfileResults(
  results:   ProfileResult[],
  serial:    string,
  runId:     number,
  driveType: string,
  startTs:   number,
): Promise<void> {
  const writeApi = getWriteApi();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const p = new Point('benchmark_profiles')
      .tag('serial',     serial)
      .tag('run_id',     String(runId))
      .tag('drive_type', driveType)
      .tag('profile',    r.profile)
      .floatField('bw_bps',      r.bwBps)
      .floatField('iops',        r.iops)
      .floatField('lat_mean_ns', r.latMeanNs)
      .floatField('lat_p50_ns',  r.latP50Ns)
      .floatField('lat_p95_ns',  r.latP95Ns)
      .floatField('lat_p99_ns',  r.latP99Ns)
      .floatField('lat_p999_ns', r.latP999Ns)
      .timestamp(startTs + i);   // unique timestamp per profile
    writeApi.writePoint(p);
  }
  await writeApi.flush();
}

/** Read profile results for a single run from InfluxDB. */
async function fetchRunProfiles(
  runId:          number | string,
  rangeStartSecs: number,
): Promise<ProfileResult[]> {
  const { getQueryApi } = await import('../db/influx.js');
  const queryApi = getQueryApi();

  const flux = `
    from(bucket: "${config.influx.bucket}")
      |> range(start: ${rangeStartSecs})
      |> filter(fn: (r) => r._measurement == "benchmark_profiles")
      |> filter(fn: (r) => r.run_id == "${runId}")
  `;

  const byProfile = new Map<string, Partial<ProfileResult>>();

  await queryApi.collectRows(flux, (values, tableMeta) => {
    const obj     = tableMeta.toObject(values) as Record<string, unknown>;
    const profile = String(obj['profile'] ?? '');
    const field   = String(obj['_field']  ?? '');
    const val     = Number(obj['_value']  ?? 0);

    if (!byProfile.has(profile)) {
      byProfile.set(profile, { profile: profile as BenchmarkProfile });
    }
    const pr = byProfile.get(profile)!;

    switch (field) {
      case 'bw_bps':      pr.bwBps     = val; break;
      case 'iops':        pr.iops      = val; break;
      case 'lat_mean_ns': pr.latMeanNs = val; break;
      case 'lat_p50_ns':  pr.latP50Ns  = val; break;
      case 'lat_p95_ns':  pr.latP95Ns  = val; break;
      case 'lat_p99_ns':  pr.latP99Ns  = val; break;
      case 'lat_p999_ns': pr.latP999Ns = val; break;
    }
    return undefined;
  });

  // Return only fully-populated results, in catalogue order.
  const ORDER: BenchmarkProfile[] = BENCHMARK_PROFILES.map(p => p.profile);
  return Array.from(byProfile.values())
    .filter((pr): pr is ProfileResult =>
      pr.profile !== undefined &&
      pr.bwBps   !== undefined &&
      pr.iops    !== undefined,
    )
    .sort((a, b) => ORDER.indexOf(a.profile) - ORDER.indexOf(b.profile));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Create a new BenchmarkRun row and return its ID. */
export async function createRun(
  driveId:     number,
  numPoints:   number,
  triggerType: 'manual' | 'scheduled',
): Promise<number> {
  const db = getDb();
  const result = await db.insert(benchmarkRuns).values({
    driveId,
    startedAt:   new Date().toISOString(),
    status:      'pending',
    triggerType,
    numPoints,
  });
  return Number(result.lastInsertRowid);
}

/**
 * Execute a full benchmark run:
 *   Phase 1 — position curve: N evenly-spaced sequential reads across the disk.
 *   Phase 2 — fio profiles: seq_read, rand_read_4k, latency.
 *
 * Progress is streamed via WebSocket. Both phases write to InfluxDB on completion.
 */
export async function executeBenchmark(runId: number): Promise<void> {
  const db       = getDb();
  const runRow   = await db.query.benchmarkRuns.findFirst({ where: eq(benchmarkRuns.runId, runId) });
  if (!runRow) throw new Error(`BenchmarkRun ${runId} not found`);

  const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, runRow.driveId) });
  if (!driveRow) throw new Error(`Drive ${runRow.driveId} not found`);

  const numPoints = runRow.numPoints ?? config.benchmark.numPoints;

  await db.update(benchmarkRuns)
    .set({ status: 'running' })
    .where(eq(benchmarkRuns.runId, runId));

  broadcast({ type: 'benchmark_started', runId, driveId: runRow.driveId, numPoints });

  console.log(
    `[executeBenchmark] run=${runId} drive=${driveRow.serialNumber} ` +
    `capacity=${driveRow.capacity} mock=${config.disk.mock}`,
  );

  const startTs = new Date(runRow.startedAt).getTime();

  try {
    // ── Phase 1: position curve ──────────────────────────────────────────────
    const curvePoints: BenchmarkPoint[] = [];

    if (config.disk.mock) {
      const mockPts = mockSpeedCurve(driveRow.capacity, numPoints, driveRow.type);
      for (let i = 0; i < mockPts.length; i++) {
        await new Promise(r => setTimeout(r, 300));
        curvePoints.push(mockPts[i]);
        broadcast({
          type:        'benchmark_progress',
          runId,
          pointIndex:  i,
          totalPoints: numPoints,
          speedBps:    mockPts[i].speedBps,
          phase:       'curve',
        });
      }
    } else {
      const blockDevice = fioDevicePath(driveRow.devicePath);
      const offsets = computeOffsets(driveRow.capacity, numPoints);
      console.log(
        `[executeBenchmark] curve offsets: ` +
        `[${offsets.slice(0, 4).join(', ')}${offsets.length > 4 ? ', …' : ''}]`,
      );
      for (let i = 0; i < offsets.length; i++) {
        const speedBps = await measurePosition(blockDevice, offsets[i]);
        curvePoints.push({ position: offsets[i], speedBps });
        broadcast({
          type:        'benchmark_progress',
          runId,
          pointIndex:  i,
          totalPoints: offsets.length,
          speedBps,
          phase:       'curve',
        });
      }
    }

    await writeCurvePoints(curvePoints, driveRow.serialNumber, runId, driveRow.type, startTs);

    // ── Phase 2: fio profiles ────────────────────────────────────────────────
    const profileResults: ProfileResult[] = [];

    for (let i = 0; i < BENCHMARK_PROFILES.length; i++) {
      const cfg = BENCHMARK_PROFILES[i];

      broadcast({
        type:        'benchmark_progress',
        runId,
        pointIndex:  i,
        totalPoints: BENCHMARK_PROFILES.length,
        speedBps:    0,
        phase:       'profiles',
        phaseLabel:  cfg.label,
      });

      console.log(`[executeBenchmark] profile ${i + 1}/${BENCHMARK_PROFILES.length}: ${cfg.profile}`);

      let result: ProfileResult;

      if (config.disk.mock) {
        await new Promise(r => setTimeout(r, 800));
        result = mockProfileResults(driveRow.type)[i];
      } else {
        const fioResult = await runFioJob({
          devicePath: fioDevicePath(driveRow.devicePath),
          ...cfg.jobParams,
        });
        result = {
          profile:   cfg.profile,
          bwBps:     fioResult.bwBps,
          iops:      fioResult.iops,
          latMeanNs: fioResult.latMeanNs,
          latP50Ns:  fioResult.latP50Ns,
          latP95Ns:  fioResult.latP95Ns,
          latP99Ns:  fioResult.latP99Ns,
          latP999Ns: fioResult.latP999Ns,
        };
      }

      profileResults.push(result);
      console.log(
        `[executeBenchmark]   ${cfg.profile}: ` +
        `bw=${(result.bwBps / 1e6).toFixed(0)} MB/s ` +
        `iops=${result.iops.toFixed(0)} ` +
        `p99=${(result.latP99Ns / 1e6).toFixed(2)} ms`,
      );
    }

    // Use a separate timestamp base for profile points to avoid collision.
    const profileStartTs = startTs + curvePoints.length + 1000;
    await writeProfileResults(profileResults, driveRow.serialNumber, runId, driveRow.type, profileStartTs);

    // ── Mark completed ───────────────────────────────────────────────────────
    const completedAt = new Date().toISOString();
    await db.update(benchmarkRuns)
      .set({ status: 'completed', completedAt })
      .where(eq(benchmarkRuns.runId, runId));

    broadcast({ type: 'benchmark_completed', runId, driveId: runRow.driveId });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(benchmarkRuns)
      .set({ status: 'failed', errorMessage: msg, completedAt: new Date().toISOString() })
      .where(eq(benchmarkRuns.runId, runId));
    broadcast({ type: 'benchmark_failed', runId, error: msg });
    throw err;
  }
}

/**
 * Fetch all benchmark series for a drive from InfluxDB.
 * Returns one BenchmarkSeries per completed run, sorted newest-first.
 * Each series includes position-curve points and fio profile results.
 */
export async function getDriveSeries(driveId: number): Promise<BenchmarkSeries[]> {
  const db = getDb();

  const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId) });
  if (!driveRow) return [];

  const completedRuns = await db.select()
    .from(benchmarkRuns)
    .where(and(eq(benchmarkRuns.driveId, driveId), eq(benchmarkRuns.status, 'completed')));

  if (completedRuns.length === 0) return [];

  const runMeta = new Map(completedRuns.map(r => [String(r.runId), { startedAt: r.startedAt }]));

  const earliestMs  = Math.min(...completedRuns.map(r => new Date(r.startedAt).getTime()));
  const rangeStart  = Math.floor(earliestMs / 1000) - 60;

  const { getQueryApi } = await import('../db/influx.js');
  const queryApi = getQueryApi();

  // Single query — no field filter — returns position (int) and speed_bps (float) rows.
  // Join by (run_id, _time) to correctly pair each position with its speed.
  const curveFLux = `
    from(bucket: "${config.influx.bucket}")
      |> range(start: ${rangeStart})
      |> filter(fn: (r) => r._measurement == "benchmark_points")
      |> filter(fn: (r) => r.serial == "${driveRow.serialNumber}")
  `;

  // byRun: run_id → (timestamp → { position?, speed? })
  const byRun = new Map<string, Map<string, { position?: number; speed?: number }>>();

  await queryApi.collectRows(curveFLux, (values, tableMeta) => {
    const obj   = tableMeta.toObject(values) as Record<string, unknown>;
    const runId = String(obj['run_id'] ?? '');
    if (!runId || !runMeta.has(runId)) return undefined;

    const ts    = String(obj['_time']  ?? '');
    const field = String(obj['_field'] ?? '');
    const val   = Number(obj['_value'] ?? 0);

    if (!byRun.has(runId)) byRun.set(runId, new Map());
    const timeMap = byRun.get(runId)!;
    if (!timeMap.has(ts)) timeMap.set(ts, {});
    if (field === 'position')  timeMap.get(ts)!.position = val;
    if (field === 'speed_bps') timeMap.get(ts)!.speed    = val;
    return undefined;
  });

  // Build series, then attach profile results for each run.
  const series: BenchmarkSeries[] = [];
  for (const [runIdStr, timeMap] of byRun) {
    const meta   = runMeta.get(runIdStr)!;
    const sorted = Array.from(timeMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const profileResults = await fetchRunProfiles(runIdStr, rangeStart);

    series.push({
      runId:     parseInt(runIdStr, 10),
      startedAt: meta.startedAt,
      points:    sorted
        .filter(([, v]) => v.speed !== undefined)
        .map(([, v])    => ({ spot: v.position ?? 0, speed: v.speed! })),
      profileResults,
    });
  }

  series.sort((a, b) => b.runId - a.runId);
  return series;
}

/** Fetch benchmark run detail including position-curve points and fio profile results. */
export async function getRunDetail(runId: number): Promise<BenchmarkRunDetail | null> {
  const db = getDb();
  const runRow = await db.query.benchmarkRuns.findFirst({
    where: eq(benchmarkRuns.runId, runId),
    with:  { drive: true },
  });
  if (!runRow) return null;

  const drive = (runRow as typeof runRow & { drive: { serialNumber: string; capacity: number } }).drive;
  const points: BenchmarkPoint[] = [];
  let profileResults: ProfileResult[] = [];

  if (drive?.serialNumber) {
    const { getQueryApi } = await import('../db/influx.js');
    const queryApi = getQueryApi();
    const startSecs = Math.floor(new Date(runRow.startedAt).getTime() / 1000) - 60;

    // Position curve
    const curveFLux = `
      from(bucket: "${config.influx.bucket}")
        |> range(start: ${startSecs})
        |> filter(fn: (r) => r._measurement == "benchmark_points")
        |> filter(fn: (r) => r.run_id == "${runId}")
    `;

    const byTime = new Map<string, { position?: number; speed?: number }>();
    await queryApi.collectRows(curveFLux, (values, tableMeta) => {
      const obj   = tableMeta.toObject(values) as Record<string, unknown>;
      const ts    = String(obj['_time']  ?? '');
      const field = String(obj['_field'] ?? '');
      const val   = Number(obj['_value'] ?? 0);
      if (!byTime.has(ts)) byTime.set(ts, {});
      if (field === 'position')  byTime.get(ts)!.position = val;
      if (field === 'speed_bps') byTime.get(ts)!.speed    = val;
      return undefined;
    });

    const sorted = Array.from(byTime.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    console.log(`[getRunDetail] run=${runId} found ${sorted.length} curve time-slots in InfluxDB`);

    for (const [, vals] of sorted) {
      if (vals.speed !== undefined) {
        points.push({ position: vals.position ?? 0, speedBps: vals.speed });
      }
    }

    // Profile results
    profileResults = await fetchRunProfiles(runId, startSecs);
    console.log(`[getRunDetail] run=${runId} found ${profileResults.length} profile result(s)`);
  }

  return {
    runId:          runRow.runId,
    driveId:        runRow.driveId,
    startedAt:      runRow.startedAt,
    completedAt:    runRow.completedAt ?? null,
    status:         runRow.status as import('@sectorama/shared').BenchmarkStatus,
    triggerType:    runRow.triggerType as import('@sectorama/shared').TriggerType,
    numPoints:      runRow.numPoints,
    errorMessage:   runRow.errorMessage ?? null,
    points,
    profileResults,
  };
}

/** Delete a single benchmark run from both InfluxDB and SQLite. */
export async function deleteRun(runId: number): Promise<void> {
  const db = getDb();
  const run = await db.query.benchmarkRuns.findFirst({ where: eq(benchmarkRuns.runId, runId) });
  if (!run) return;
  if (run.status === 'running' || run.status === 'pending') {
    throw new Error('Cannot delete a benchmark that is currently running');
  }

  const { deleteInfluxData } = await import('../db/influx.js');
  // Remove both measurements for this run
  await Promise.all([
    deleteInfluxData(`_measurement="benchmark_points"   AND run_id="${runId}"`),
    deleteInfluxData(`_measurement="benchmark_profiles" AND run_id="${runId}"`),
  ]);
  await db.delete(benchmarkRuns).where(eq(benchmarkRuns.runId, runId));
}

/** Delete all benchmark runs for a drive from both InfluxDB and SQLite. */
export async function purgeAllRuns(driveId: number): Promise<void> {
  const db = getDb();
  const driveRow = await db.query.drives.findFirst({ where: eq(drives.driveId, driveId) });
  if (!driveRow) return;

  const active = await db.query.benchmarkRuns.findFirst({
    where: and(
      eq(benchmarkRuns.driveId, driveId),
      inArray(benchmarkRuns.status, ['running', 'pending']),
    ),
  });
  if (active) throw new Error('Cannot purge while a benchmark is running');

  const { deleteInfluxData } = await import('../db/influx.js');
  await Promise.all([
    deleteInfluxData(`_measurement="benchmark_points"   AND serial="${driveRow.serialNumber}"`),
    deleteInfluxData(`_measurement="benchmark_profiles" AND serial="${driveRow.serialNumber}"`),
  ]);
  await db.delete(benchmarkRuns).where(eq(benchmarkRuns.driveId, driveId));
}
