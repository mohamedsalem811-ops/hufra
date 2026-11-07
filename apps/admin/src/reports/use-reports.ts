import {
  adminReportResponseSchema,
  okResponseSchema,
  photoUploadResponseSchema,
  regionListResponseSchema,
  reportQueueResponseSchema,
  statusChangeResponseSchema,
  type PotholeStatus,
} from '@hufra/contracts'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { useApi } from '@/api/api-provider'
import { preparePhoto } from '@/lib/photo'

export interface QueueFilters {
  q?: string
  status?: PotholeStatus
  severity?: 'minor' | 'medium' | 'severe'
  region_id?: number
  duplicates?: '1'
  sort?: 'newest' | 'oldest' | 'most_confirmed'
  page?: number
}

export const PAGE_SIZE = 25

export function queueQueryString(f: QueueFilters): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) p.set(k, String(v))
  p.set('page_size', String(PAGE_SIZE))
  return p.toString()
}

export function useQueue(filters: QueueFilters) {
  const api = useApi()
  return useQuery({
    queryKey: ['queue', filters],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.request(`/api/admin/queue?${queueQueryString(filters)}`, { schema: reportQueueResponseSchema, signal }),
  })
}

export function useRegions() {
  const api = useApi()
  return useQuery({
    queryKey: ['regions'],
    staleTime: 60 * 60 * 1000,
    queryFn: ({ signal }) => api.request('/api/regions', { schema: regionListResponseSchema, signal }),
    select: (d) => d.results,
  })
}

export function useReport(id: number) {
  const api = useApi()
  return useQuery({
    queryKey: ['report', id],
    queryFn: ({ signal }) => api.request(`/api/admin/reports/${id}`, { schema: adminReportResponseSchema, signal }),
  })
}

/** After any change, the queue, the report and the dashboard numbers are stale. */
function useRefresh() {
  const qc = useQueryClient()
  return (id?: number) => {
    void qc.invalidateQueries({ queryKey: ['queue'] })
    void qc.invalidateQueries({ queryKey: ['counters'] })
    if (id) void qc.invalidateQueries({ queryKey: ['report', id] })
  }
}

export interface StatusChange {
  id: number
  status: PotholeStatus
  note?: string
  notify?: boolean
}

export function useChangeStatus() {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, ...body }: StatusChange) =>
      api.request(`/api/potholes/${id}/status`, { method: 'PATCH', body, schema: statusChangeResponseSchema }),
    onSettled: (_d, _e, v) => refresh(v.id),
  })
}

/** Moves several reports one after another; each keeps the server's rules. */
export function useBulkStatus() {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: PotholeStatus }) => {
      const failed: number[] = []
      for (const id of ids) {
        await api.request(`/api/potholes/${id}/status`, { method: 'PATCH', body: { status }, schema: statusChangeResponseSchema }).catch(() => failed.push(id))
      }
      return { ok: ids.length - failed.length, failed }
    },
    onSettled: () => refresh(),
  })
}

export function useReviewDuplicate(reportId: number) {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ flagId, decision }: { flagId: number; decision: 'confirmed' | 'rejected' }) =>
      api.request(`/api/admin/duplicates/${flagId}`, { method: 'PATCH', body: { decision }, schema: z.looseObject({ ok: z.literal(true) }) }),
    onSettled: () => refresh(reportId),
  })
}

export function useDeleteReport() {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (id: number) => api.request(`/api/potholes/${id}`, { method: 'DELETE', schema: okResponseSchema }),
    onSettled: () => refresh(),
  })
}

export function useUploadProof(reportId: number, prepare = preparePhoto) {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async ({ file, stage }: { file: File; stage: 'before' | 'during' | 'after' }) => {
      const photo = await prepare(file)
      const form = new FormData()
      form.append('stage', stage)
      form.append('full', photo.full, 'full.jpg')
      form.append('thumb', photo.thumb, 'thumb.jpg')
      return api.request(`/api/photos/${reportId}`, { method: 'POST', body: form, schema: photoUploadResponseSchema })
    },
    onSettled: () => refresh(reportId),
  })
}
