import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { SystemStats } from '@sectorama/shared';

export function useStats() {
  return useQuery<SystemStats>({
    queryKey: ['stats'],
    queryFn:  () => api.get<SystemStats>('/stats').then(r => r.data),
    refetchInterval: 30_000,
  });
}
