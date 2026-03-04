import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { API } from '../endpoints';

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
