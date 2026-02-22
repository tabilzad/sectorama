import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { SmartReading } from '@sectorama/shared';

export function useSmartData(driveId: number | null) {
  return useQuery<SmartReading>({
    queryKey:        ['smart', driveId],
    queryFn:         () => api.get<SmartReading>(`/disks/${driveId}/smart`).then(r => r.data),
    enabled:         driveId !== null,
    staleTime:       5 * 60 * 1_000,
    refetchInterval: 5 * 60 * 1_000,
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
