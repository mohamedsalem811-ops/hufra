import { loginResponseSchema, meResponseSchema, okResponseSchema } from '@hufra/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'

import { ApiError } from '@/api/client'
import { useApi } from '@/api/api-provider'

export type SessionUser = z.infer<typeof meResponseSchema>['user']

export const isStaff = (u: { role: string } | null | undefined) => u?.role === 'admin' || u?.role === 'super_admin'

export const SESSION_KEY = ['session'] as const

/** The signed-in person, or null when signed out. Cookies carry the session. */
export function useSession() {
  const api = useApi()
  return useQuery({
    queryKey: SESSION_KEY,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        return (await api.request('/api/auth/me', { schema: meResponseSchema, signal })).user
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'unauthorized') return null
        throw e
      }
    },
  })
}

export class NotStaffError extends Error {}

export function useSignIn() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const { user } = await api.request('/api/auth/login', { method: 'POST', body: creds, schema: loginResponseSchema })
      if (!isStaff(user)) {
        // A citizen account: do not keep a session in the admin panel.
        await api.request('/api/auth/logout', { method: 'POST', body: {}, schema: okResponseSchema }).catch(() => undefined)
        throw new NotStaffError()
      }
      return user
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSION_KEY }),
  })
}

export function useSignOut() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.request('/api/auth/logout', { method: 'POST', body: {}, schema: okResponseSchema }),
    onSettled: () => {
      // Signed out: show the sign-in form and forget every admin answer.
      qc.setQueryData(SESSION_KEY, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] })
    },
  })
}
