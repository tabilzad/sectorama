import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import { API } from '../endpoints';
import type { SystemStats } from '@sectorama/shared';

export function useStats() {
  return useQuery<SystemStats>({
    queryKey:  ['stats'],
    queryFn:   () => api.get<SystemStats>(API.stats).then(r => r.data),
    // staleTime: Infinity — same reasoning as useDisks. All invalidations are
    // event-driven via useLiveFeed; no automatic background refetching needed.
    staleTime: Infinity,
  });
}
