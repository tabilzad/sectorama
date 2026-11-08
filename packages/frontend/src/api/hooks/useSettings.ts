import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { API } from '../endpoints';
import type { SmartPollingSettings } from '@sectorama/shared';

export function useCommunitySharingEnabled() {
  return useQuery<{ enabled: boolean }>({
    queryKey: ['settings', 'community-sharing'],
    queryFn:  () => api.get<{ enabled: boolean }>(API.settings.communitySharing).then(r => r.data),
  });
}

export function useSetCommunitySharingEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<{ enabled: boolean }>(API.settings.communitySharing, { enabled }).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'community-sharing'] });
    },
  });
}

export function useSmartPollingSettings() {
  return useQuery<SmartPollingSettings>({
    queryKey: ['settings', 'smart-polling'],
    queryFn:  () => api.get<SmartPollingSettings>(API.settings.smartPolling).then(r => r.data),
  });
}

export function useSetSmartPollingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: SmartPollingSettings) =>
      api.put<SmartPollingSettings>(API.settings.smartPolling, settings).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'smart-polling'] });
    },
  });
}
