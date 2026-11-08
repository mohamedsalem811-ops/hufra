import {
  appVersionSettingsSchema,
  auditLogResponseSchema,
  contactResponseSchema,
  donationSettingsResponseSchema,
  generalRulesResponseSchema,
  legalResponseSchema,
} from '@hufra/contracts'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'

import { useApi } from '@/api/api-provider'

/** A setting read with GET and saved with PUT; a save refreshes what is shown. */
function useSetting<S extends z.ZodType>(key: string, getPath: string, putPath: string, schema: S) {
  const api = useApi()
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['settings', key], queryFn: ({ signal }) => api.request(getPath, { schema, signal }) })
  const save = useMutation({
    mutationFn: (body: unknown) => api.request(putPath, { method: 'PUT', body, schema }),
    onSuccess: (data) => {
      qc.setQueryData(['settings', key], data)
      void qc.invalidateQueries({ queryKey: ['audit'] })
    },
  })
  return { query, save }
}

export const usePayout = () => useSetting('payout', '/api/admin/settings/donations', '/api/admin/settings/donations', donationSettingsResponseSchema)
export const useRules = () => useSetting('rules', '/api/admin/settings/rules', '/api/admin/settings/rules', generalRulesResponseSchema)
export const useContact = () => useSetting('contact', '/api/site/contact', '/api/admin/settings/contact', contactResponseSchema)
export const useLegal = () => useSetting('legal', '/api/site/legal', '/api/admin/settings/legal', legalResponseSchema)
export const useAppVersions = () => useSetting('versions', '/api/app/version-settings', '/api/app/version-settings', appVersionSettingsSchema)

type AuditPage = z.infer<typeof auditLogResponseSchema>

export function useAuditLog(action: string) {
  const api = useApi()
  return useInfiniteQuery<AuditPage, Error, { pages: AuditPage[]; pageParams: (string | null)[] }, string[], string | null>({
    queryKey: ['audit', action],
    initialPageParam: null as string | null,
    getNextPageParam: (last: AuditPage) => last.next_cursor,
    queryFn: ({ pageParam, signal }) => {
      const p = new URLSearchParams({ limit: '50' })
      if (action) p.set('action', action)
      if (pageParam) p.set('cursor', pageParam)
      return api.request(`/api/admin/audit-logs?${p}`, { schema: auditLogResponseSchema, signal })
    },
  })
}
