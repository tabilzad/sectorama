import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { API } from '../endpoints';
import type { Drive, DriveSummary, DashboardPreset } from '@sectorama/shared';

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

export function useUpdateDriveLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ driveId, customLabel }: { driveId: number; customLabel: string | null }) =>
      api.patch(API.disks.displayPrefs(driveId), { customLabel }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['disks'] });
    },
  });
}

export function useDashboardLayout() {
  return useQuery<{ preset: DashboardPreset }>({
    queryKey: ['dashboard-layout'],
    queryFn:  () => api.get<{ preset: DashboardPreset }>(API.disks.displayPrefsLayout).then(r => r.data),
  });
}

export function useSaveDashboardLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { preset: DashboardPreset; driveIds?: number[] }) =>
      api.put(API.disks.displayPrefsLayout, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['disks'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-layout'] });
    },
  });
}
