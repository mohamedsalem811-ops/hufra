import { adminCountsResponseSchema, duplicateListResponseSchema } from '@hufra/contracts'
import { useQuery } from '@tanstack/react-query'

import { useApi } from '@/api/api-provider'

export function useDuplicates() {
  const api = useApi()
  return useQuery({
    queryKey: ['duplicates'],
    queryFn: ({ signal }) => api.request('/api/admin/duplicates', { schema: duplicateListResponseSchema, signal }),
    select: (d) => d.results,
  })
}

/** Work waiting in each queue, for the menu. Refreshed every minute while the panel is open. */
export function useAdminCounts() {
  const api = useApi()
  return useQuery({
    queryKey: ['admin-counts'],
    refetchInterval: 60_000,
    queryFn: ({ signal }) => api.request('/api/admin/counts', { schema: adminCountsResponseSchema, signal }),
  })
}
