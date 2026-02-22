import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import type { BenchmarkRun, BenchmarkRunDetail, BenchmarkSeries } from '@sectorama/shared';
import type { BenchmarkProgressState } from './useLiveFeed';

/** All completed benchmark series for a drive — feeds the speed-curve overlay chart. */
export function useDriveBenchmarkSeries(driveId: number | null) {
  return useQuery<BenchmarkSeries[]>({
    queryKey:  ['drive-benchmark-series', driveId],
    queryFn:   () => api.get<BenchmarkSeries[]>(`/disks/${driveId}/benchmarks/series`).then(r => r.data),
    enabled:   driveId !== null,
    staleTime: 30_000,
  });
}

export function useDriveBenchmarks(driveId: number | null) {
  return useQuery<BenchmarkRun[]>({
    queryKey:  ['drive-benchmarks', driveId],
    queryFn:   () => api.get<BenchmarkRun[]>(`/disks/${driveId}/benchmarks`).then(r => r.data),
    enabled:   driveId !== null,
    staleTime: 30_000,
  });
}

export function useBenchmarkRun(driveId: number | null, runId: number | null) {
  return useQuery<BenchmarkRunDetail>({
    queryKey: ['benchmark-run', runId],
    queryFn:  () =>
      api.get<BenchmarkRunDetail>(`/disks/${driveId}/benchmarks/${runId}`).then(r => r.data),
    enabled:  driveId !== null && runId !== null,
    // No refetchInterval — live progress comes via WS setQueryData, and
    // benchmark_completed WS event invalidates this key for the final fetch.
  });
}

/** Subscribes to live benchmark progress state fed by WebSocket events via useLiveFeed. */
export function useBenchmarkProgress(runId: number | null): BenchmarkProgressState | undefined {
  const queryClient = useQueryClient();
  // useQuery with enabled:false subscribes to this cache key without ever fetching from server.
  // When useLiveFeed calls setQueryData on this key, this component re-renders automatically.
  const { data } = useQuery<BenchmarkProgressState | null>({
    queryKey:  ['benchmark-progress', runId ?? -1],
    queryFn:   () => null,
    enabled:   false,
    staleTime: Infinity,
  });
  // Also check the cache directly for the initial render before any WS event arrives
  const cached = queryClient.getQueryData<BenchmarkProgressState>(['benchmark-progress', runId ?? -1]);
  return data ?? cached ?? undefined;
}

export function useRunBenchmark(driveId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (numPoints?: number) =>
      api.post<{ runId: number; status: string }>(`/disks/${driveId}/benchmark`, { numPoints })
        .then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drive-benchmarks', driveId] });
    },
  });
}

export function useDeleteBenchmarkRun(driveId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: number) => api.delete(`/disks/${driveId}/benchmarks/${runId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drive-benchmarks', driveId] });
      void queryClient.invalidateQueries({ queryKey: ['drive-benchmark-series', driveId] });
    },
  });
}

export function usePurgeBenchmarks(driveId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/disks/${driveId}/benchmarks`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drive-benchmarks', driveId] });
      void queryClient.invalidateQueries({ queryKey: ['drive-benchmark-series', driveId] });
    },
  });
}
