import { adminDonationListResponseSchema, adminDonationReviewResponseSchema } from '@hufra/contracts'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useApi } from '@/api/api-provider'

export const REVIEW_TABS = ['under_review', 'awaiting_transfer', 'confirmed', 'rejected'] as const
export type ReviewTab = (typeof REVIEW_TABS)[number]

export function useDonations(status: ReviewTab) {
  const api = useApi()
  return useQuery({
    queryKey: ['donations', status],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.request(`/api/admin/donations?status=${status}`, { schema: adminDonationListResponseSchema, signal }),
  })
}

export type Review = { decision: 'confirm'; amount_lyd?: number } | { decision: 'reject'; reason: string }

export function useReviewDonation() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, review }: { id: number; review: Review }) =>
      api.request(`/api/admin/donations/${id}/review`, { method: 'POST', body: review, schema: adminDonationReviewResponseSchema }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['donations'] })
      void qc.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}
