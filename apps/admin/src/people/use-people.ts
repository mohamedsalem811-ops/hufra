import {
  adminAccountListResponseSchema,
  adminAccountResponseSchema,
  adminRegionListResponseSchema,
  okResponseSchema,
  topDonorsResponseSchema,
  type RegionInput,
  type UpdateAdminInput,
} from '@hufra/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { useApi } from '@/api/api-provider'

const promoteResponseSchema = z.object({ ok: z.literal(true), admin: adminAccountResponseSchema.shape.admin })
const createdSchema = z.object({ id: z.number() })

export function useAdmins(enabled: boolean) {
  const api = useApi()
  return useQuery({
    queryKey: ['admins'],
    enabled,
    queryFn: ({ signal }) => api.request('/api/admin/admins', { schema: adminAccountListResponseSchema, signal }),
    select: (d) => d.results,
  })
}

function useRefreshPeople() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['admins'] })
    void qc.invalidateQueries({ queryKey: ['admin-regions'] })
  }
}

export function useUpdateAdmin() {
  const api = useApi()
  const refresh = useRefreshPeople()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateAdminInput }) =>
      api.request(`/api/admin/admins/${id}`, { method: 'PUT', body: input, schema: adminAccountResponseSchema }),
    onSettled: refresh,
  })
}

export function usePromote() {
  const api = useApi()
  const refresh = useRefreshPeople()
  return useMutation({
    mutationFn: (input: { email: string; role: 'admin' | 'super_admin'; region_ids: number[] }) =>
      api.request('/api/admin/admins/promote', { method: 'POST', body: input, schema: promoteResponseSchema }),
    onSettled: refresh,
  })
}

export function useDemote() {
  const api = useApi()
  const refresh = useRefreshPeople()
  return useMutation({
    mutationFn: (email: string) => api.request('/api/admin/admins/demote', { method: 'POST', body: { email }, schema: okResponseSchema }),
    onSettled: refresh,
  })
}

export function useTopDonors() {
  const api = useApi()
  return useQuery({
    queryKey: ['top-donors'],
    queryFn: ({ signal }) => api.request('/api/admin/top-donors', { schema: topDonorsResponseSchema, signal }),
    select: (d) => d.results,
  })
}

export function useRecordCash() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; amount_lyd: number; note?: string }) => api.request('/api/donors', { method: 'POST', body: input, schema: createdSchema }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['top-donors'] }),
  })
}

export function useAdminRegions() {
  const api = useApi()
  return useQuery({
    queryKey: ['admin-regions'],
    queryFn: ({ signal }) => api.request('/api/admin/regions', { schema: adminRegionListResponseSchema, signal }),
    select: (d) => d.results,
  })
}

function useRefreshRegions() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['admin-regions'] })
    void qc.invalidateQueries({ queryKey: ['regions'] })
    void qc.invalidateQueries({ queryKey: ['admins'] })
  }
}

export function useSaveRegion() {
  const api = useApi()
  const refresh = useRefreshRegions()
  return useMutation({
    mutationFn: async ({ id, input }: { id: number | null; input: RegionInput }): Promise<unknown> =>
      id
        ? api.request(`/api/regions/${id}`, { method: 'PATCH', body: input, schema: okResponseSchema })
        : api.request('/api/regions', { method: 'POST', body: input, schema: createdSchema }),
    onSettled: refresh,
  })
}

export function useDeleteRegion() {
  const api = useApi()
  const refresh = useRefreshRegions()
  return useMutation({
    mutationFn: (id: number) => api.request(`/api/regions/${id}`, { method: 'DELETE', schema: z.object({ ok: z.literal(true) }).loose() }),
    onSettled: refresh,
  })
}
