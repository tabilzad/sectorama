import type { BenchmarkProfile, ProfileResult } from '@sectorama/shared';
import type { FioJobParams } from './fioRunner.js';

// ─── Profile catalogue types ──────────────────────────────────────────────────

export interface ProfileConfig {
  profile:     BenchmarkProfile;
  label:       string;
  description: string;
  /**
   * fio job parameters supplied by the catalogue.
   * `devicePath`, `offsetBytes`, and `sizeBytes` are intentionally excluded:
   * they are runtime values injected by the benchmark engine from the detected
   * device path and the computed disk region (see diskRegion.ts).
   */
  jobParams:   Omit<FioJobParams, 'devicePath' | 'offsetBytes' | 'sizeBytes'>;
}

// ─── Unified benchmark profile catalogue ─────────────────────────────────────
//
// All four profiles run with identical fio parameters on every drive type
// (HDD, SATA SSD, NVMe).  Uniformity is a deliberate design choice: a public
// database gains comparability when the test conditions are identical, and the
// device's own hardware determines the result.
//
// Open/Closed principle: adding a new profile requires only appending one entry
// here — nothing in benchmarkEngine, fetchRunProfiles, or the frontend charts
// needs to change; they all iterate or look up by profile ID.

export const BENCHMARK_PROFILES: ProfileConfig[] = [
  {
    profile:     'seq_1m_qd1',
    label:       'Seq 1M QD1',
    description: 'Sequential read, single stream — 1 MiB blocks, QD 1, 30 s',
    jobParams: {
      rwMode:         'read',
      blockSizeBytes: 1_048_576,  // 1 MiB
      iodepth:        1,          // Single-stream: meaningful for HDD and representative for SSD
      numjobs:        1,
      runtimeSecs:    30,
      rampTimeSecs:   5,
      randRepeat:     true,       // Fixed seed → reproducible across machines
    },
  },
  {
    profile:     'seq_1m_qd32',
    label:       'Seq 1M QD32',
    description: 'Sequential read, deep queue — 1 MiB blocks, QD 32, 30 s',
    jobParams: {
      rwMode:         'read',
      blockSizeBytes: 1_048_576,
      iodepth:        32,         // Required for NVMe: PCIe latency caps QD=1 throughput 40–60 %
      numjobs:        1,
      runtimeSecs:    30,
      rampTimeSecs:   5,
      randRepeat:     true,
    },
  },
  {
    profile:     'rnd_4k_qd1',
    label:       '4K Rnd QD1',
    description: '4 KiB random read, QD 1 — latency-sensitive baseline, 30 s',
    jobParams: {
      rwMode:         'randread',
      blockSizeBytes: 4_096,      // 4 KiB — standard random I/O unit
      iodepth:        1,          // QD 1 isolates device latency; no queueing delay
      numjobs:        1,
      runtimeSecs:    30,
      rampTimeSecs:   5,
      randRepeat:     true,       // Fixed seed keeps the block sequence stable run-to-run
    },
  },
  {
    profile:     'rnd_4k_qd32',
    label:       '4K Rnd QD32',
    description: '4 KiB random read, QD 32 — peak IOPS, 30 s',
    jobParams: {
      rwMode:         'randread',
      blockSizeBytes: 4_096,
      iodepth:        32,         // Matches CrystalDiskMark Q32T1; exercises NCQ on HDD
      numjobs:        1,
      runtimeSecs:    30,
      rampTimeSecs:   5,
      randRepeat:     true,
    },
  },
];

/**
 * Stable execution order derived from the catalogue. Used by InfluxDB query
 * helpers to sort results without re-deriving order from the profile IDs.
 */
export const PROFILE_ORDER: BenchmarkProfile[] = BENCHMARK_PROFILES.map(p => p.profile);

// ─── Position-curve parameters ────────────────────────────────────────────────

export interface CurveParams {
  /** Number of async I/Os in flight per curve sample. */
  iodepth:     number;
  /** Bytes read per curve sample point (one-shot, no runtime). */
  sampleBytes: number;
}

/**
 * Return position-curve fio parameters appropriate for the drive type.
 *
 * The position curve sweeps the entire disk and is intentionally kept separate
 * from the headline profiles. Its purpose is to visualise speed-vs-position
 * (most meaningful for HDDs where outer tracks are faster than inner tracks).
 *
 * NVMe requires `iodepth=32` because PCIe round-trip latency means QD=1
 * sequential reads under-report throughput by 40–60 % vs rated speed.
 * 256 MiB per sample gives a stable ~37 ms measurement window at 7 GB/s.
 *
 * HDD/SATA SSD: single-stream (iodepth=1) is the meaningful metric.
 * SATA is the interface bottleneck; 1 MiB blocks at QD=1 saturate it.
 * 128 MiB per sample gives ~0.8 s (HDD) / ~0.23 s (SSD) — stable enough.
 */
export function getCurveParams(driveType: string): CurveParams {
  if (driveType === 'NVMe') {
    return { iodepth: 32, sampleBytes: 256 * 1_048_576 };  // 256 MiB
  }
  return { iodepth: 1, sampleBytes: 128 * 1_048_576 };     // 128 MiB
}

// ─── Mock data ────────────────────────────────────────────────────────────────

/**
 * Generate realistic mock profile results for Windows dev / CI.
 * Returns one entry per profile in PROFILE_ORDER.
 * ±15 % jitter makes repeated mock runs look distinct on the history chart.
 */
export function mockProfileResults(driveType: string): ProfileResult[] {
  const j = () => 0.85 + Math.random() * 0.30;

  if (driveType === 'NVMe') {
    return [
      // seq_1m_qd1: NVMe sequential at QD=1 — fast but PCIe latency caps it
      { profile: 'seq_1m_qd1',  bwBps: 3_500_000_000 * j(), iops:     3_500 * j(), latMeanNs:   280_000 * j(), latP50Ns:   270_000 * j(), latP95Ns:   350_000 * j(), latP99Ns:   500_000 * j(), latP999Ns: 1_000_000 * j() },
      // seq_1m_qd32: saturates PCIe Gen4 bandwidth
      { profile: 'seq_1m_qd32', bwBps: 7_000_000_000 * j(), iops:     7_000 * j(), latMeanNs:   150_000 * j(), latP50Ns:   140_000 * j(), latP95Ns:   200_000 * j(), latP99Ns:   300_000 * j(), latP999Ns:   600_000 * j() },
      // rnd_4k_qd1: true idle latency ~18–25 µs for a fast NVMe
      { profile: 'rnd_4k_qd1',  bwBps:    20_000_000 * j(), iops:     5_000 * j(), latMeanNs:    18_000 * j(), latP50Ns:    17_000 * j(), latP95Ns:    25_000 * j(), latP99Ns:    40_000 * j(), latP999Ns:    80_000 * j() },
      // rnd_4k_qd32: peak IOPS; competitive NVMe reaches 700K–1M IOPS at QD32
      { profile: 'rnd_4k_qd32', bwBps: 2_800_000_000 * j(), iops:   700_000 * j(), latMeanNs:    45_000 * j(), latP50Ns:    42_000 * j(), latP95Ns:    60_000 * j(), latP99Ns:    90_000 * j(), latP999Ns:   200_000 * j() },
    ];
  }

  if (driveType === 'SSD') {
    return [
      // seq_1m_qd1: SATA III cap ~550 MB/s; QD=1 1MiB already saturates the link
      { profile: 'seq_1m_qd1',  bwBps:   550_000_000 * j(), iops:       550 * j(), latMeanNs: 1_800_000 * j(), latP50Ns: 1_700_000 * j(), latP95Ns: 2_200_000 * j(), latP99Ns: 3_000_000 * j(), latP999Ns:  7_000_000 * j() },
      // seq_1m_qd32: effectively identical to QD=1 on SATA; interface is the bottleneck
      { profile: 'seq_1m_qd32', bwBps:   550_000_000 * j(), iops:       550 * j(), latMeanNs: 1_700_000 * j(), latP50Ns: 1_600_000 * j(), latP95Ns: 2_100_000 * j(), latP99Ns: 2_800_000 * j(), latP999Ns:  6_000_000 * j() },
      // rnd_4k_qd1: ~180 µs idle latency on a typical SATA SSD
      { profile: 'rnd_4k_qd1',  bwBps:    20_000_000 * j(), iops:     5_000 * j(), latMeanNs:   180_000 * j(), latP50Ns:   170_000 * j(), latP95Ns:   250_000 * j(), latP99Ns:   400_000 * j(), latP999Ns:  1_000_000 * j() },
      // rnd_4k_qd32: typical SATA SSD ~90K IOPS at QD32
      { profile: 'rnd_4k_qd32', bwBps:   370_000_000 * j(), iops:    90_000 * j(), latMeanNs:   350_000 * j(), latP50Ns:   330_000 * j(), latP95Ns:   450_000 * j(), latP99Ns:   700_000 * j(), latP999Ns:  2_000_000 * j() },
    ];
  }

  // HDD (mechanical spinning disk)
  return [
    // seq_1m_qd1: outer-track streaming ~160 MB/s
    { profile: 'seq_1m_qd1',  bwBps:   160_000_000 * j(), iops:       160 * j(), latMeanNs:  6_000_000 * j(), latP50Ns:  5_800_000 * j(), latP95Ns:  9_000_000 * j(), latP99Ns: 15_000_000 * j(), latP999Ns: 40_000_000 * j() },
    // seq_1m_qd32: NCQ adds no benefit for purely sequential access
    { profile: 'seq_1m_qd32', bwBps:   160_000_000 * j(), iops:       160 * j(), latMeanNs:  6_000_000 * j(), latP50Ns:  5_800_000 * j(), latP95Ns:  9_000_000 * j(), latP99Ns: 15_000_000 * j(), latP999Ns: 40_000_000 * j() },
    // rnd_4k_qd1: one seek+rotation per I/O → ~100–150 IOPS, ~6.5 ms mean latency
    { profile: 'rnd_4k_qd1',  bwBps:       600_000 * j(), iops:       150 * j(), latMeanNs:  6_500_000 * j(), latP50Ns:  6_000_000 * j(), latP95Ns:  9_000_000 * j(), latP99Ns: 14_000_000 * j(), latP999Ns: 25_000_000 * j() },
    // rnd_4k_qd32: NCQ elevator improves IOPS but also increases queueing latency
    { profile: 'rnd_4k_qd32', bwBps:     1_200_000 * j(), iops:       300 * j(), latMeanNs:  7_500_000 * j(), latP50Ns:  7_000_000 * j(), latP95Ns: 11_000_000 * j(), latP99Ns: 18_000_000 * j(), latP999Ns: 35_000_000 * j() },
  ];
}
