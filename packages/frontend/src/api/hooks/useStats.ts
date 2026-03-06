import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import { API } from '../endpoints';
import type { SystemStats } from '@sectorama/shared';

export function useStats() {
  return useQuery<SystemStats>({
    queryKey: ['stats'],
    queryFn:  () => api.get<SystemStats>(API.stats).then(r => r.data),
    // No refetchInterval — useLiveFeed invalidates this key on every event that
    // changes aggregate counts (smart_updated, disk_detected/removed, benchmark_completed).
    // A catch-up refetch fires automatically on WS reconnect (see useLiveFeed).
  });
}
