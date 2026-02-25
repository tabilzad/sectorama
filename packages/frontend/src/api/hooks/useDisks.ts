import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { API } from '../endpoints';
import type { Drive, DriveSummary } from '@sectorama/shared';

export function useDisks() {
  return useQuery<DriveSummary[]>({
    queryKey:        ['disks'],
    queryFn:         () => api.get<DriveSummary[]>(API.disks.list).then(r => r.data),
    refetchInterval: 60_000,
  });
}

export function useDrive(driveId: number | null) {
  return useQuery<Drive>({
    queryKey: ['drive', driveId],
    queryFn:  () => api.get<Drive>(API.disks.detail(driveId!)).then(r => r.data),
    enabled:  driveId !== null,
  });
}

export function useScanDisks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ scanned: number; drives: DriveSummary[] }>(API.disks.scan).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disks'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
