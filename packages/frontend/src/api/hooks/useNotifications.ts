import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { API } from '../endpoints';
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
    queryFn:  () => api.get<NotificationChannel[]>(API.notifications.channels).then(r => r.data),
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type: ChannelType; config: unknown }) =>
      api.post<NotificationChannel>(API.notifications.channels, data).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    },
  });
}

export function useUpdateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; config?: unknown; enabled?: boolean }) =>
      api.put<NotificationChannel>(API.notifications.channel(id), data).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(API.notifications.channel(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    },
  });
}

export function useTestChannel() {
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ ok: boolean }>(API.notifications.channelTest(id)).then(r => r.data),
  });
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export function useSubscriptions(channelId?: number) {
  return useQuery<NotificationSubscription[]>({
    queryKey: ['notification-subscriptions', channelId],
    queryFn:  () => {
      const url = channelId !== undefined
        ? `${API.notifications.subscriptions}?channelId=${channelId}`
        : API.notifications.subscriptions;
      return api.get<NotificationSubscription[]>(url).then(r => r.data);
    },
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { channelId: number; alertType: AlertType }) =>
      api.post<NotificationSubscription>(API.notifications.subscriptions, data).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-subscriptions'] });
    },
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(API.notifications.subscription(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-subscriptions'] });
    },
  });
}

// ── Alert thresholds ──────────────────────────────────────────────────────────

export function useAlertThresholds() {
  return useQuery<DriveAlertThreshold[]>({
    queryKey: ['alert-thresholds'],
    queryFn:  () => api.get<DriveAlertThreshold[]>(API.notifications.thresholds).then(r => r.data),
  });
}

export function useUpdateAlertThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ driveId, temperatureThresholdCelsius }: { driveId: number; temperatureThresholdCelsius: number }) =>
      api.put<DriveAlertThreshold>(API.notifications.threshold(driveId), { temperatureThresholdCelsius }).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alert-thresholds'] });
      void queryClient.invalidateQueries({ queryKey: ['disks'] });
    },
  });
}

export function useDeleteAlertThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (driveId: number) => api.delete(API.notifications.threshold(driveId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alert-thresholds'] });
      void queryClient.invalidateQueries({ queryKey: ['disks'] });
    },
  });
}
