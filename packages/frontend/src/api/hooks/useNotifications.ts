import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import type {
  NotificationChannel,
  NotificationSubscription,
  DriveAlertThreshold,
  ChannelType,
  AlertType,
} from '@sectorama/shared';

// ── Channels ──────────────────────────────────────────────────────────────────

export function useChannels() {
  return useQuery<NotificationChannel[]>({
    queryKey: ['notification-channels'],
    queryFn:  () => api.get<NotificationChannel[]>('/notifications/channels').then(r => r.data),
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type: ChannelType; config: unknown }) =>
      api.post<NotificationChannel>('/notifications/channels', data).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    },
  });
}

export function useUpdateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; config?: unknown; enabled?: boolean }) =>
      api.put<NotificationChannel>(`/notifications/channels/${id}`, data).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/notifications/channels/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    },
  });
}

export function useTestChannel() {
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ ok: boolean }>(`/notifications/channels/${id}/test`).then(r => r.data),
  });
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export function useSubscriptions(channelId?: number) {
  return useQuery<NotificationSubscription[]>({
    queryKey: ['notification-subscriptions', channelId],
    queryFn:  () => {
      const url = channelId !== undefined
        ? `/notifications/subscriptions?channelId=${channelId}`
        : '/notifications/subscriptions';
      return api.get<NotificationSubscription[]>(url).then(r => r.data);
    },
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { channelId: number; alertType: AlertType }) =>
      api.post<NotificationSubscription>('/notifications/subscriptions', data).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-subscriptions'] });
    },
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/notifications/subscriptions/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-subscriptions'] });
    },
  });
}

// ── Alert thresholds ──────────────────────────────────────────────────────────

export function useAlertThresholds() {
  return useQuery<DriveAlertThreshold[]>({
    queryKey: ['alert-thresholds'],
    queryFn:  () => api.get<DriveAlertThreshold[]>('/notifications/thresholds').then(r => r.data),
  });
}

export function useUpdateAlertThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ driveId, temperatureThresholdCelsius }: { driveId: number; temperatureThresholdCelsius: number }) =>
      api.put<DriveAlertThreshold>(`/notifications/thresholds/${driveId}`, { temperatureThresholdCelsius }).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alert-thresholds'] });
      void queryClient.invalidateQueries({ queryKey: ['disks'] });
    },
  });
}

export function useDeleteAlertThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (driveId: number) => api.delete(`/notifications/thresholds/${driveId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alert-thresholds'] });
      void queryClient.invalidateQueries({ queryKey: ['disks'] });
    },
  });
}
