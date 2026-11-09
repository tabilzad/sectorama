import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { API } from '../endpoints';
import type { RuntimeSettingsResponse, RuntimeSettingsUpdate } from '@sectorama/shared';

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

/**
 * Polling, benchmark and temperature defaults, with the built-in defaults and
 * the fields pinned by the container environment. Also read by the drive and
 * history pages for their temperature-zone fallbacks.
 */
export function useRuntimeSettings() {
  return useQuery<RuntimeSettingsResponse>({
    queryKey:  ['settings', 'runtime'],
    queryFn:   () => api.get<RuntimeSettingsResponse>(API.settings.runtime).then(r => r.data),
    staleTime: 60_000,
  });
}

export function useUpdateRuntimeSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: RuntimeSettingsUpdate) =>
      api.put<RuntimeSettingsResponse>(API.settings.runtime, patch).then(r => r.data),
    onSuccess: data => {
      queryClient.setQueryData(['settings', 'runtime'], data);
    },
  });
}
