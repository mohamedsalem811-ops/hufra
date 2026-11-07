import { notificationPreferencesSchema, type NotificationPreferences } from '@hufra/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '@/api/api-provider';

import { useAuth } from '../auth/auth-provider';

/** Which notifications also alert the phone (plan 7.1). The inbox always keeps them. */
export function useNotificationPreferences() {
  const { api } = useApi();
  const { state } = useAuth();
  const queryClient = useQueryClient();
  const userId = state.status === 'signedIn' ? state.user.id : null;
  const key = ['notification-prefs', userId];
  const query = useQuery({
    queryKey: key,
    enabled: userId !== null,
    queryFn: ({ signal }) => api.request('/api/notifications/preferences', { schema: notificationPreferencesSchema, signal }),
  });
  const update = useMutation({
    mutationFn: (change: Partial<NotificationPreferences>) =>
      api.request('/api/notifications/preferences', { method: 'PUT', body: change, schema: notificationPreferencesSchema }),
    // Flip at once; put it back if the server says no.
    onMutate: async (change) => {
      const before = queryClient.getQueryData<NotificationPreferences>(key);
      if (before) queryClient.setQueryData(key, { ...before, ...change });
      return { before };
    },
    onError: (_e, _c, ctx) => {
      if (ctx?.before) queryClient.setQueryData(key, ctx.before);
    },
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  });
  return { query, update };
}
