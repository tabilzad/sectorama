import type { BenchmarkProfile, ProfileResult } from '@sectorama/shared';
import type { FioJobParams } from './fioRunner.js';

export interface ProfileConfig {
  profile:     BenchmarkProfile;
  label:       string;
  description: string;
  /** fio job parameters — devicePath is supplied at runtime. */
  jobParams:   Omit<FioJobParams, 'devicePath'>;
}

/**
 * Ordered catalogue of fio benchmark profiles.
 * Add an entry here to extend the suite; the engine iterates this array automatically.
 */
export const BENCHMARK_PROFILES: ProfileConfig[] = [
  {
    profile:     'seq_read',
    label:       'Sequential Read',
    description: 'Sustained sequential throughput — 1 MiB blocks, 1 job, 30 s',
    jobParams: {
      rwMode:         'read',
      blockSizeBytes: 1024 * 1024,  // 1 MiB
      iodepth:        1,
      numjobs:        1,
      runtimeSecs:    30,
      rampTimeSecs:   5,
    },
  },
  {
    profile:     'rand_read_4k',
    label:       '4K Random Read',
    // psync uses pread() (synchronous) — parallelism comes from numjobs, not iodepth.
    description: 'Random IOPS — 4 KiB blocks, 8 parallel jobs, 30 s',
    jobParams: {
      rwMode:         'randread',
      blockSizeBytes: 4096,         // 4 KiB
      iodepth:        1,
      numjobs:        8,            // 8 concurrent pread() processes
      runtimeSecs:    30,
      rampTimeSecs:   5,
    },
  },
  {
    profile:     'latency',
    label:       'Idle Latency',
    description: 'True device latency — 4 KiB blocks, single job, QD 1, 30 s',
    jobParams: {
      rwMode:         'randread',
      blockSizeBytes: 4096,         // 4 KiB
      iodepth:        1,
      numjobs:        1,
      runtimeSecs:    30,
      rampTimeSecs:   5,
    },
  },
];

// ─── Mock data ────────────────────────────────────────────────────────────────

/** Generate realistic mock profile results for Windows dev / CI. */
export function mockProfileResults(driveType: string): ProfileResult[] {
  // ±15 % jitter so repeated mock runs look distinct on the chart.
  const j = () => 0.85 + Math.random() * 0.30;

  if (driveType === 'NVMe') {
    return [
      {
        profile:   'seq_read',
        bwBps:     3_500_000_000 * j(),
        iops:      3_500  * j(),
        latMeanNs: 280_000 * j(),
        latP50Ns:  270_000 * j(),
        latP95Ns:  350_000 * j(),
        latP99Ns:  500_000 * j(),
        latP999Ns: 1_000_000 * j(),
      },
      {
        profile:   'rand_read_4k',
        bwBps:     2_800_000_000 * j(),
        iops:      700_000 * j(),
        latMeanNs: 45_000 * j(),
        latP50Ns:  42_000 * j(),
        latP95Ns:  60_000 * j(),
        latP99Ns:  90_000 * j(),
        latP999Ns: 200_000 * j(),
      },
      {
        profile:   'latency',
        bwBps:     20_000_000 * j(),
        iops:      5_000 * j(),
        latMeanNs: 18_000 * j(),
        latP50Ns:  17_000 * j(),
        latP95Ns:  25_000 * j(),
        latP99Ns:  40_000 * j(),
        latP999Ns: 80_000 * j(),
      },
    ];
  }

  if (driveType === 'SSD') {
    return [
      {
        profile:   'seq_read',
        bwBps:     550_000_000 * j(),
        iops:      550 * j(),
        latMeanNs: 1_200_000 * j(),
        latP50Ns:  1_100_000 * j(),
        latP95Ns:  1_500_000 * j(),
        latP99Ns:  2_000_000 * j(),
        latP999Ns: 5_000_000 * j(),
      },
      {
        profile:   'rand_read_4k',
        bwBps:     370_000_000 * j(),
        iops:      90_000 * j(),
        latMeanNs: 350_000 * j(),
        latP50Ns:  330_000 * j(),
        latP95Ns:  450_000 * j(),
        latP99Ns:  700_000 * j(),
        latP999Ns: 2_000_000 * j(),
      },
      {
        profile:   'latency',
        bwBps:     20_000_000 * j(),
        iops:      5_000 * j(),
        latMeanNs: 180_000 * j(),
        latP50Ns:  170_000 * j(),
        latP95Ns:  250_000 * j(),
        latP99Ns:  400_000 * j(),
        latP999Ns: 1_000_000 * j(),
      },
    ];
  }

  // HDD — mechanical seek penalty visible in random read
  return [
    {
      profile:   'seq_read',
      bwBps:     160_000_000 * j(),
      iops:      160 * j(),
      latMeanNs: 8_000_000 * j(),
      latP50Ns:  7_500_000 * j(),
      latP95Ns:  12_000_000 * j(),
      latP99Ns:  20_000_000 * j(),
      latP999Ns: 50_000_000 * j(),
    },
    {
      profile:   'rand_read_4k',
      bwBps:     600_000 * j(),
      iops:      150 * j(),
      latMeanNs: 7_000_000 * j(),
      latP50Ns:  6_500_000 * j(),
      latP95Ns:  10_000_000 * j(),
      latP99Ns:  15_000_000 * j(),
      latP999Ns: 30_000_000 * j(),
    },
    {
      profile:   'latency',
      bwBps:     600_000 * j(),
      iops:      150 * j(),
      latMeanNs: 6_500_000 * j(),
      latP50Ns:  6_000_000 * j(),
      latP95Ns:  9_000_000 * j(),
      latP99Ns:  14_000_000 * j(),
      latP999Ns: 25_000_000 * j(),
    },
  ];
}
