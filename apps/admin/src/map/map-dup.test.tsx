import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '@/app'

import type { Bounds, MapPoint } from './leaflet-map'

// jsdom cannot draw a map: a stand-in reports a view and lists the dots as buttons.
vi.mock('./leaflet-map', () => ({
  LeafletMap: ({ points, onBounds, onPick, label, focus }: { points: MapPoint[]; onBounds: (b: Bounds) => void; onPick: (id: number) => void; label: string; focus?: { lat: number } | null }) => {
    useEffect(() => onBounds({ south: 32.8, west: 13.1, north: 32.95, east: 13.3 }), [onBounds])
    return (
      <div role="region" aria-label={label} data-focus={focus ? String(focus.lat) : ''}>
        {points.map((p) => (
          <button key={p.id} type="button" data-status={p.status} onClick={() => onPick(p.id)}>
            {p.title} — {p.subtitle}
          </button>
        ))}
      </div>
    )
  },
}))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const me = { user: { id: 3, email: 'team@hufra.ly', code: 'HF-3', role: 'admin', locale: 'ar', display_name: 'سالم', totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z' } }
const report = (id: number, over: Record<string, unknown> = {}) => ({
  id, region_id: 1, lat: 32.88, lng: 13.19, length_cm: null, width_cm: null, depth_cm: null, severity: 'medium', status: 'reported', description_ar: null, description_en: null,
  street_ar: `شارع ${id}`, street_en: null, view_count: 0, upvotes_count: 0, created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-01T10:00:00.000Z',
  verified_at: null, under_repair_at: null, fixed_at: null, deleted_at: null, region_name_ar: 'سوق الجمعة', region_name_en: 'Souq Al-Jumaa', cover_thumb_key: null,
  reporter_id: null, reporter_contact: null, client_report_uuid: null, ...over,
})
const side = (id: number, over: Record<string, unknown> = {}) => ({
  id, status: 'reported', severity: 'medium', street_ar: `شارع ${id}`, street_en: null, region_name_ar: 'سوق الجمعة', region_name_en: 'Souq Al-Jumaa',
  lat: 32.88, lng: 13.19, upvotes_count: 2, created_at: '2026-11-01T10:00:00.000Z', cover_thumb_key: null, ...over,
})

let pairs: Record<string, any>[]
let counts: Record<string, number>
let mapCount: number
const calls: [string, string, unknown][] = []
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input)
  const method = init?.method ?? 'GET'
  if (method !== 'GET') calls.push([method, path, typeof init?.body === 'string' ? JSON.parse(init.body) : undefined])
  if (path === '/api/auth/me') return json(me)
  if (path === '/api/admin/counts') return json(counts)
  if (path === '/api/regions') return json({ results: [{ id: 1, slug: 'souq', name_ar: 'سوق الجمعة', name_en: 'Souq Al-Jumaa', city: 'Greater Tripoli', center_lat: 32.9, center_lng: 13.22, active: 1, created_at: '2026-01-01T00:00:00.000Z' }] })
  if (path.startsWith('/api/potholes?')) {
    return json({ results: Array.from({ length: mapCount }, (_, i) => report(i + 1, i === 0 ? { status: 'fixed', severity: 'severe' } : {})), limit: 500, offset: 0 })
  }
  if (path === '/api/admin/duplicates') return json({ results: pairs })
  const dup = /^\/api\/admin\/duplicates\/(\d+)$/.exec(path)
  if (dup) {
    pairs = pairs.filter((p) => p.id !== Number(dup[1]))
    counts = { ...counts, duplicates: pairs.length }
    return json({ ok: true, decision: 'confirmed' })
  }
  return json({ error: 'Not found' }, 404)
})
const show = (path: string) => render(<App fetchImpl={fetchMock as unknown as typeof fetch} history={createMemoryHistory({ initialEntries: [path] })} locale="ar" />)
const potholeCalls = () => fetchMock.mock.calls.map(([p]) => String(p)).filter((p) => p.startsWith('/api/potholes?'))

beforeEach(() => {
  fetchMock.mockClear()
  calls.length = 0
  mapCount = 2
  counts = { new_reports: 24, duplicates: 2, donations_to_review: 0 }
  pairs = [
    { id: 11, pothole_id: 8, duplicate_of_id: 5, distance_m: 12.4, created_at: '2026-11-02T00:00:00.000Z', newer: side(8), older: side(5, { cover_thumb_key: 'thumbs/5.webp', status: 'verified' }) },
    { id: 12, pothole_id: 9, duplicate_of_id: 6, distance_m: 30, created_at: '2026-11-03T00:00:00.000Z', newer: side(9), older: side(6) },
  ]
})

describe('map', () => {
  it('loads the reports in view, filters them, and opens one', async () => {
    const user = userEvent.setup()
    show('/admin/map')
    const map = await screen.findByRole('region', { name: 'خريطة البلاغات' })
    expect(await within(map).findByRole('button', { name: /#1 · شارع 1 — تم الإصلاح · خطيرة/ })).toHaveAttribute('data-status', 'fixed')
    expect(potholeCalls()[0]).toBe('/api/potholes?bbox=32.8%2C13.1%2C32.95%2C13.3&limit=500')
    expect(screen.getByText('2 بلاغ في هذا الجزء من الخريطة.')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'الحالة' }), 'verified')
    await user.selectOptions(screen.getByRole('combobox', { name: 'المنطقة' }), '1')
    await waitFor(() => expect(potholeCalls().at(-1)).toBe('/api/potholes?bbox=32.8%2C13.1%2C32.95%2C13.3&limit=500&status=verified&region_id=1'))
    expect(map).toHaveAttribute('data-focus', '32.9') // the map goes to the chosen region

    await user.click(within(map).getByRole('button', { name: /#2 · شارع 2/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([p]) => String(p) === '/api/admin/reports/2')).toBe(true))
  })

  it('says when there are too many to show, and lists what is shown', async () => {
    const user = userEvent.setup()
    mapCount = 500
    show('/admin/map')
    expect(await screen.findByText('يظهر أول 500 بلاغ فقط. كبّر الخريطة أو استخدم التصفية لرؤية الباقي.')).toBeInTheDocument()
    await user.click(screen.getByText('قائمة البلاغات الظاهرة (500)'))
    expect(screen.getAllByRole('link', { name: /شارع/ })).toHaveLength(500)
  })
})

describe('duplicates', () => {
  it('shows each pair side by side and records the decision', async () => {
    const user = userEvent.setup()
    show('/admin/duplicates')
    const first = await screen.findByRole('region', { name: /البلاغ \u2066#8\u2069 والبلاغ \u2066#5\u2069/ })
    expect(within(first).getByText(/على بعد 12 م/)).toBeInTheDocument()
    expect(within(within(first).getByRole('region', { name: 'الأقدم #5' })).getByRole('img', { name: 'صورة البلاغ #5' })).toHaveAttribute('src', '/media/thumbs/5.webp')
    expect(within(within(first).getByRole('region', { name: 'الأحدث #8' })).getByText('بلا صورة')).toBeInTheDocument()
    expect(screen.getByText('2 زوج ينتظر قراراً')).toBeInTheDocument()

    await user.click(within(first).getByRole('button', { name: 'دمج: البلاغ الأحدث مكرر' }))
    await waitFor(() => expect(calls).toContainEqual(['PATCH', '/api/admin/duplicates/11', { decision: 'confirmed' }]))
    await waitFor(() => expect(screen.queryByRole('region', { name: /البلاغ \u2066#8\u2069 والبلاغ \u2066#5\u2069/ })).not.toBeInTheDocument())

    await user.click(within(screen.getByRole('region', { name: /البلاغ \u2066#9\u2069 والبلاغ \u2066#6\u2069/ })).getByRole('button', { name: 'ليس مكرراً' }))
    await waitFor(() => expect(calls).toContainEqual(['PATCH', '/api/admin/duplicates/12', { decision: 'rejected' }]))
    expect(await screen.findByText('لا توجد بلاغات مكررة تنتظر المراجعة.')).toBeInTheDocument()
  })
})

describe('menu counts', () => {
  it('shows waiting work beside the menu items, none when nothing waits', async () => {
    show('/admin/duplicates')
    const nav = await screen.findByRole('navigation', { name: 'قائمة الإدارة' })
    expect(await within(nav).findByRole('link', { name: 'البلاغات 24 بانتظار المراجعة' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'البلاغات المكررة 2 بانتظار المراجعة' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'مراجعة التبرعات' })).toBeInTheDocument()
  })
})
