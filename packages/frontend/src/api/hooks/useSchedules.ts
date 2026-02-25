import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { API } from '../endpoints';
import type { BenchmarkSchedule } from '@sectorama/shared';

export function useSchedules() {
  return useQuery<BenchmarkSchedule[]>({
    queryKey: ['schedules'],
    queryFn:  () => api.get<BenchmarkSchedule[]>(API.schedules.list).then(r => r.data),
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { driveId?: number; cronExpression: string; numPoints?: number }) =>
      api.post<BenchmarkSchedule>(API.schedules.list, data).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; enabled?: boolean; cronExpression?: string; numPoints?: number }) =>
      api.put<BenchmarkSchedule>(API.schedules.detail(id), data).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(API.schedules.detail(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}
