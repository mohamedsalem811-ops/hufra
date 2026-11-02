import { publicPotholeDetailResponseSchema, upvoteResponseSchema, type PotholeDetailResponse } from '@hufra/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '@/api/api-provider';

import { useAuth } from '../auth/auth-provider';

export const detailKey = (id: number, userId: number | null) => ['pothole', id, userId ?? 'anon'] as const;

/**
 * One report. Sent with the session when signed in, so the answer also says
 * whether it is the person's own report and whether they already confirmed it.
 */
export function useReportDetail(id: number) {
  const { api } = useApi();
  const { state } = useAuth();
  const userId = state.status === 'signedIn' ? state.user.id : null;
  return useQuery({
    queryKey: detailKey(id, userId),
    enabled: Number.isInteger(id) && id > 0 && state.status !== 'loading',
    queryFn: ({ signal }) =>
      api.request(`/api/potholes/${id}`, { schema: publicPotholeDetailResponseSchema, auth: userId !== null, signal }),
  });
}

/** "I saw it too". Updates the page at once from the server's new count. */
export function useConfirmReport(id: number) {
  const { api } = useApi();
  const { state } = useAuth();
  const queryClient = useQueryClient();
  const userId = state.status === 'signedIn' ? state.user.id : null;
  return useMutation({
    mutationFn: () => api.request(`/api/potholes/${id}/upvote`, { method: 'POST', schema: upvoteResponseSchema }),
    onSuccess: (res) => {
      queryClient.setQueryData<PotholeDetailResponse>(detailKey(id, userId), (old) =>
        old
          ? {
              ...old,
              pothole: { ...old.pothole, upvotes_count: res.upvotes_count },
              viewer: { mine: old.viewer?.mine ?? false, upvoted: true },
            }
          : old,
      );
      // Map previews show the same count.
      void queryClient.invalidateQueries({ queryKey: ['map-reports'] });
    },
  });
}
