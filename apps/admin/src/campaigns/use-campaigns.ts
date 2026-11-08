import {
  adminCampaignListResponseSchema,
  adminCampaignResponseSchema,
  DONATION_LIMITS,
  type CampaignStatus,
} from '@hufra/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useApi } from '@/api/api-provider'
import { prepareSingle } from '@/lib/photo'

export function useCampaigns() {
  const api = useApi()
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: ({ signal }) => api.request('/api/admin/campaigns', { schema: adminCampaignListResponseSchema, signal }),
  })
}

/** One campaign, read from the list (it is short, and already holds everything). */
export function useCampaign(id: number) {
  const list = useCampaigns()
  return { ...list, campaign: list.data?.results.find((c) => c.id === id) ?? null }
}

function useRefresh() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['campaigns'] })
    void qc.invalidateQueries({ queryKey: ['queue'] })
    void qc.invalidateQueries({ queryKey: ['report'] })
  }
}

export interface CostItem {
  label: string
  amount_lyd: number
}

export function useCreateCampaign() {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (body: { pothole_id: number; target_lyd: number; cost_items?: CostItem[]; contractor?: string; partner_id?: number; note_ar?: string }) =>
      api.request('/api/admin/campaigns', { method: 'POST', body, schema: adminCampaignResponseSchema }),
    onSettled: refresh,
  })
}

export interface CampaignChange {
  target_lyd?: number
  cost_items?: CostItem[]
  contractor?: string
  partner_id?: number | null
  status?: Extract<CampaignStatus, 'completed' | 'cancelled'>
  reason?: string
  final_cost_lyd?: number
  note_ar?: string
}

export function useUpdateCampaign(id: number) {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (body: CampaignChange) => api.request(`/api/admin/campaigns/${id}`, { method: 'PATCH', body, schema: adminCampaignResponseSchema }),
    onSettled: refresh,
  })
}

export function useAllocate(id: number) {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (amount_lyd: number) =>
      api.request(`/api/admin/campaigns/${id}/allocate`, { method: 'POST', body: { amount_lyd }, schema: adminCampaignResponseSchema }),
    onSettled: refresh,
  })
}

export function useUploadReceipt(id: number, prepare = prepareSingle) {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('receipt', await prepare(file, DONATION_LIMITS.receipt.maxLongEdgePx, DONATION_LIMITS.receipt.maxBytes), 'receipt.jpg')
      return api.request(`/api/admin/campaigns/${id}/receipt`, { method: 'POST', body: form, schema: adminCampaignResponseSchema })
    },
    onSettled: refresh,
  })
}
