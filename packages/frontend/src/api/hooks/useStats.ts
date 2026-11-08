import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import { API } from '../endpoints';
import type { SystemStats, StorageOverview } from '@sectorama/shared';

export function useStats() {
  return useQuery<SystemStats>({
    queryKey:  ['stats'],
    queryFn:   () => api.get<SystemStats>(API.stats).then(r => r.data),
    // staleTime: Infinity — same reasoning as useDisks. All invalidations are
    // event-driven via useLiveFeed; no automatic background refetching needed.
    staleTime: Infinity,
  });
}

export function useStorageOverview() {
  return useQuery<StorageOverview>({
    queryKey: ['storage'],
    queryFn:  () => api.get<StorageOverview>(API.storage).then(r => r.data),
    // Filesystem usage drifts without any drive event, so unlike the other
    // dashboard queries this one polls on a slow interval.
    staleTime:       60_000,
    refetchInterval: 5 * 60_000,
  });
}
