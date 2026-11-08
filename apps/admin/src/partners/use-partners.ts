import { adminPartnerListResponseSchema, adminPartnerResponseSchema, okResponseSchema, type PartnerInput } from '@hufra/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useApi } from '@/api/api-provider'
import { prepareLogo } from '@/lib/photo'

export function usePartners() {
  const api = useApi()
  return useQuery({
    queryKey: ['partners'],
    queryFn: ({ signal }) => api.request('/api/admin/partners', { schema: adminPartnerListResponseSchema, signal }),
    select: (d) => d.results,
  })
}

function useRefresh() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['partners'] })
    void qc.invalidateQueries({ queryKey: ['campaigns'] })
  }
}

export function useSavePartner() {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: PartnerInput }) =>
      api.request(id ? `/api/admin/partners/${id}` : '/api/admin/partners', { method: id ? 'PUT' : 'POST', body: input, schema: adminPartnerResponseSchema }),
    onSettled: refresh,
  })
}

export function useDeletePartner() {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (id: number) => api.request(`/api/admin/partners/${id}`, { method: 'DELETE', schema: okResponseSchema }),
    onSettled: refresh,
  })
}

export function useReorderPartners() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) => api.request('/api/admin/partners/order', { method: 'PUT', body: { ids }, schema: adminPartnerListResponseSchema }),
    onSuccess: (data) => qc.setQueryData(['partners'], data),
  })
}

export function useUploadLogo(prepare = prepareLogo) {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const form = new FormData()
      const logo = await prepare(file)
      form.append('logo', logo, logo.type === 'image/webp' ? 'logo.webp' : 'logo.png')
      return api.request(`/api/admin/partners/${id}/logo`, { method: 'POST', body: form, schema: adminPartnerResponseSchema })
    },
    onSettled: refresh,
  })
}
