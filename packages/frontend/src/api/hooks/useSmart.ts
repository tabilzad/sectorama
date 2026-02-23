import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { SmartReading } from '@sectorama/shared';

export function useSmartData(driveId: number | null) {
  return useQuery<SmartReading>({
    queryKey:  ['smart', driveId],
    queryFn:   () => api.get<SmartReading>(`/disks/${driveId}/smart`).then(r => r.data),
    enabled:   driveId !== null,
    // The WS live-feed pushes the full SmartReading on every scheduled poll via
    // queryClient.setQueryData — no polling needed here. staleTime: Infinity prevents
    // React Query from re-fetching on window focus or component remount.
    staleTime: Infinity,
  });
}

export function useSmartHistory(
  driveId: number | null,
  attr: string | null,
  from = '-7d',
  to = 'now()',
) {
  return useQuery({
    queryKey:  ['smart-history', driveId, attr, from, to],
    queryFn:   () =>
      api.get(`/disks/${driveId}/smart/history`, { params: { attr, from, to } }).then(r => r.data),
    enabled:   driveId !== null,
    staleTime: 60 * 1_000,
  });
}
