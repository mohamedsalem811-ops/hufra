import type { AdminReport, ReportQueueItem } from '@hufra/contracts'
import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '@/app'
import { fit, preparePhoto, type Canvas2D } from '@/lib/photo'
import { age } from '@/lib/format'
import { parseQueueSearch } from '@/router'

vi.mock('@/lib/photo', async (orig) => {
  const real = await orig<typeof import('@/lib/photo')>()
  return { ...real, preparePhoto: vi.fn(async () => ({ full: new Blob(['f']), thumb: new Blob(['t']) })), realPrepare: real.preparePhoto }
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const me = { user: { id: 3, email: 'staff@hufra.ly', code: 'HF-3', role: 'admin', locale: 'ar', display_name: 'سالم', totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z' } }

const row = (id: number, over: Partial<ReportQueueItem> = {}): ReportQueueItem => ({
  id,
  status: 'reported',
  severity: 'medium',
  street_ar: `شارع ${id}`,
  street_en: null,
  region_id: 1,
  region_name_ar: 'وسط المدينة',
  region_name_en: 'City centre',
  upvotes_count: 2,
  created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
  cover_thumb_key: null,
  duplicate_flag_count: 0,
  campaign: null,
  ...over,
})

function detail(over: Partial<AdminReport['pothole']> = {}): AdminReport {
  return {
    pothole: {
      id: 1042, region_id: 1, lat: 32.88721, lng: 13.19134, length_cm: 80, width_cm: 60, depth_cm: null, severity: 'severe', status: 'verified',
      description_ar: 'حفرة عميقة', description_en: null, street_ar: 'شارع الجمهورية', street_en: null, view_count: 0, upvotes_count: 4,
      created_at: '2026-11-01T08:40:00.000Z', updated_at: '2026-11-03T10:12:00.000Z', verified_at: '2026-11-03T10:12:00.000Z', under_repair_at: null,
      fixed_at: null, deleted_at: null, region_name_ar: 'وسط المدينة', region_name_en: 'City centre', region_slug: 'centre',
      reporter_id: 9, reporter_contact: '0910000000', client_report_uuid: null, ...over,
    },
    photos: [{ id: 1, thumb_key: 'thumbs/a.webp', r2_key: 'photos/a.webp', stage: 'report', created_at: '2026-11-01T08:40:00.000Z' }],
    history: [
      { from_status: 'reported', to_status: 'verified', note: 'زيارة ميدانية', at: '2026-11-03T10:12:00.000Z', actor_name: 'سالم' },
      { from_status: null, to_status: 'reported', note: 'Report submitted', at: '2026-11-01T08:40:00.000Z', actor_name: null },
    ],
    reporter: { id: 9, code: 'HF-9', display_name: 'مواطن', email: 'citizen@hufra.ly' },
    duplicates: [{ flag_id: 7, other_id: 1050, distance_m: 18.4, this_is_newer: false, other_status: 'reported', other_street_ar: 'شارع الجمهورية', other_street_en: null, other_created_at: '2026-11-02T08:00:00.000Z' }],
    campaign: null,
  }
}

let rows: ReportQueueItem[]
let total: number
let report: AdminReport
let patchStatus: (id: number, body: any) => Response
const calls = () => (fetchMock.mock.calls as unknown as [string, RequestInit?][]).map(([p, i]) => `${i?.method ?? 'GET'} ${p}`)

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input)
  const method = init?.method ?? 'GET'
  if (path === '/api/auth/me') return json(me)
  if (path === '/api/regions') return json({ results: [{ id: 1, slug: 'centre', name_ar: 'وسط المدينة', name_en: 'City centre', city: 'Tripoli', center_lat: 32.9, center_lng: 13.2, active: 1, created_at: '2026-01-01T00:00:00Z' }] })
  if (path.startsWith('/api/admin/queue')) return json({ results: rows, total, page: Number(new URL(path, 'http://x').searchParams.get('page') ?? 1), page_size: 25 })
  if (path === `/api/admin/reports/${report.pothole.id}`) return json(report)
  if (path.startsWith('/api/admin/reports/')) return json({ error: 'Not found' }, 404)
  const status = /^\/api\/potholes\/(\d+)\/status$/.exec(path)
  if (status && method === 'PATCH') return patchStatus(Number(status[1]), JSON.parse(String(init!.body)))
  if (path.startsWith('/api/admin/duplicates/') && method === 'PATCH') {
    report = { ...report, duplicates: [] }
    return json({ ok: true, decision: 'rejected', deleted_report_id: null })
  }
  if (path.startsWith('/api/potholes/') && method === 'DELETE') return json({ ok: true })
  if (path.startsWith('/api/photos/') && method === 'POST') return json({ id: 2, r2_key: 'photos/b.jpg', thumb_key: 'thumbs/b.jpg', stage: 'before' }, 201)
  return json({ error: 'Not found' }, 404)
})

function show(path: string) {
  return render(<App fetchImpl={fetchMock as unknown as typeof fetch} history={createMemoryHistory({ initialEntries: [path] })} locale="ar" />)
}

beforeEach(() => {
  fetchMock.mockClear()
  rows = [row(1042, { duplicate_flag_count: 1 }), row(1038, { status: 'verified', campaign: { id: 3, status: 'active', target_lyd: 1200, confirmed_lyd: 340 } })]
  total = 2
  report = detail()
  patchStatus = (_id, body) => json({ ok: true, status: body.status, previous_status: 'reported' })
})

describe('report queue', () => {
  it('lists reports with status, duplicates and campaign progress', async () => {
    show('/admin/reports')
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('link', { name: 'شارع 1042' })).toHaveAttribute('href', '/admin/reports/1042')
    expect(within(table).getByText('قد يكون مكرراً')).toBeInTheDocument()
    expect(within(table).getByText('340 / 1,200 د.ل')).toBeInTheDocument()
    expect(within(table).getAllByText('منذ 6 أيام')).toHaveLength(2)
    expect(screen.getByText('2 بلاغ مطابق للفلاتر')).toBeInTheDocument()
  })

  it('sends filters to the server and keeps them in the address', async () => {
    const user = userEvent.setup()
    show('/admin/reports?status=verified')
    await screen.findByRole('table')
    expect(calls().some((c) => c.includes('/api/admin/queue?status=verified'))).toBe(true)
    await user.selectOptions(screen.getByLabelText('الخطورة'), 'severe')
    await waitFor(() => expect(calls().some((c) => c.includes('status=verified&severity=severe'))).toBe(true))
    await user.type(screen.getByLabelText('بحث'), '1042')
    await waitFor(() => expect(calls().some((c) => c.includes('q=1042'))).toBe(true))
    await user.click(screen.getByRole('button', { name: 'مسح الفلاتر' }))
    await waitFor(() => expect(calls().at(-1)).toBe('GET /api/admin/queue?page_size=25'))
  })

  it('moves several reports at once and says what happened', async () => {
    const user = userEvent.setup()
    patchStatus = (id, body) => (id === 1038 ? json({ error: 'already' }, 409) : json({ ok: true, status: body.status, previous_status: 'reported' }))
    show('/admin/reports')
    await screen.findByRole('table')
    await user.click(screen.getByRole('checkbox', { name: 'تحديد كل البلاغات في هذه الصفحة' }))
    const bar = screen.getByRole('region', { name: 'إجراءات جماعية' })
    expect(within(bar).getByText('2 محدد')).toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: 'تغيير الحالة إلى «تم التحقق»' }))
    expect(await screen.findByText(/تم تحديث 1 من 2/)).toHaveTextContent('تعذّر تحديث: #1038')
    expect(calls().filter((c) => c.startsWith('PATCH'))).toEqual(['PATCH /api/potholes/1042/status', 'PATCH /api/potholes/1038/status'])
  })

  it('pages through long lists', async () => {
    total = 60
    const user = userEvent.setup()
    show('/admin/reports')
    const pages = await screen.findByRole('navigation', { name: 'الصفحات' })
    expect(within(pages).getByText('عرض 1–25 من 60')).toBeInTheDocument()
    expect(within(pages).getByRole('button', { name: 'السابق' })).toBeDisabled()
    await user.click(within(pages).getByRole('button', { name: 'التالي' }))
    await waitFor(() => expect(calls().some((c) => c.includes('page=2'))).toBe(true))
  })

  it('explains an empty result', async () => {
    rows = []
    total = 0
    show('/admin/reports')
    expect(await screen.findByText('لا بلاغات تطابق هذه الفلاتر.')).toBeInTheDocument()
  })
})

describe('report page', () => {
  it('shows the details staff need, including the private reporter', async () => {
    show('/admin/reports/1042')
    expect(await screen.findByRole('heading', { name: 'شارع الجمهورية', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('citizen@hufra.ly')).toBeInTheDocument()
    expect(screen.getByText('0910000000')).toBeInTheDocument()
    expect(screen.getByText('الطول 80 · العرض 60 · العمق — سم')).toBeInTheDocument()
    expect(screen.getByText(/بواسطة سالم · «زيارة ميدانية»/)).toBeInTheDocument()
    expect(screen.getByText('من المُبلِّغ')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'صورة 1 من البلاغ' })).toHaveAttribute('src', '/media/thumbs/a.webp')
    expect(screen.getByRole('link', { name: 'فتح في الخرائط' })).toHaveAttribute('href', expect.stringContaining('mlat=32.88721'))
  })

  it('moves the report forward and tells the reporter by default', async () => {
    const user = userEvent.setup()
    show('/admin/reports/1042')
    const form = (await screen.findByRole('heading', { name: 'تغيير الحالة' })).closest('form')!
    expect(within(form).getByLabelText('الحالة الجديدة')).toHaveValue('under_repair')
    await user.type(within(form).getByLabelText(/ملاحظة للمُبلِّغ/), 'بدأ العمل')
    await user.click(within(form).getByRole('button', { name: 'حفظ الحالة' }))
    expect(await within(form).findByText('تم تغيير الحالة.')).toBeInTheDocument()
    const call = fetchMock.mock.calls.find(([p]) => String(p).endsWith('/status'))!
    expect(JSON.parse(String(call[1]!.body))).toEqual({ status: 'under_repair', note: 'بدأ العمل', notify: true })
  })

  it('asks for a reason before moving back', async () => {
    const user = userEvent.setup()
    show('/admin/reports/1042')
    const form = (await screen.findByRole('heading', { name: 'تغيير الحالة' })).closest('form')!
    await user.selectOptions(within(form).getByLabelText('الحالة الجديدة'), 'reported')
    expect(within(form).getByText('الرجوع إلى حالة سابقة يتطلب سبباً.')).toBeInTheDocument()
    await user.click(within(form).getByRole('checkbox', { name: 'إرسال إشعار للمُبلِّغ' }))
    await user.click(within(form).getByRole('button', { name: 'حفظ الحالة' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('اكتب سبب الرجوع (5 أحرف على الأقل).')
    expect(calls().some((c) => c.startsWith('PATCH'))).toBe(false)
    await user.type(within(form).getByLabelText(/ملاحظة للمُبلِّغ/), 'ليست حفرة')
    await user.click(within(form).getByRole('button', { name: 'حفظ الحالة' }))
    await waitFor(() => expect(calls().some((c) => c.startsWith('PATCH'))).toBe(true))
    const call = fetchMock.mock.calls.find(([p]) => String(p).endsWith('/status'))!
    expect(JSON.parse(String(call[1]!.body))).toMatchObject({ status: 'reported', notify: false })
  })

  it('explains a change made by another admin meanwhile', async () => {
    patchStatus = () => json({ error: 'The report was changed by someone else meanwhile', error_ar: 'x' }, 409)
    const user = userEvent.setup()
    show('/admin/reports/1042')
    const form = (await screen.findByRole('heading', { name: 'تغيير الحالة' })).closest('form')!
    await user.click(within(form).getByRole('button', { name: 'حفظ الحالة' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('غيّر مشرف آخر هذا البلاغ للتو')
  })

  it('decides a possible duplicate', async () => {
    const user = userEvent.setup()
    show('/admin/reports/1042')
    expect(await screen.findByText('الدمج يحذف البلاغ الأحدث (#1050) ويُبقي الأقدم (#1042).')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ليس مكرراً' }))
    expect(await screen.findByText('تم حفظ القرار.')).toBeInTheDocument()
    expect(calls()).toContain('PATCH /api/admin/duplicates/7')
    expect(await screen.findByText('لا بلاغات مشابهة تنتظر المراجعة.')).toBeInTheDocument()
  })

  it('adds a repair-proof photo to a stage', async () => {
    const user = userEvent.setup()
    show('/admin/reports/1042')
    await user.click(await screen.findByRole('tab', { name: 'قبل (0)' }))
    expect(screen.getByText('لا صور في هذه المرحلة.')).toBeInTheDocument()
    const input = screen.getByLabelText('إضافة صورة «قبل»')
    await user.upload(input, new File(['x'], 'p.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText('تمت إضافة الصورة.')).toBeInTheDocument()
    const call = fetchMock.mock.calls.find(([p, i]) => String(p) === '/api/photos/1042' && i?.method === 'POST')!
    const form = call[1]!.body as FormData
    expect(form.get('stage')).toBe('before')
    expect(form.get('full')).toBeInstanceOf(Blob)
  })

  it('moves between photo stages with the arrow keys', async () => {
    const user = userEvent.setup()
    show('/admin/reports/1042')
    const first = await screen.findByRole('tab', { name: 'البلاغ (1)' })
    first.focus()
    await user.keyboard('{ArrowLeft}') // right to left: left is "next"
    expect(screen.getByRole('tab', { name: 'قبل (0)' })).toHaveAttribute('aria-selected', 'true')
  })

  it('deletes only after a confirmation', async () => {
    const user = userEvent.setup()
    show('/admin/reports/1042')
    await user.click(await screen.findByRole('button', { name: 'حذف البلاغ' }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }))
    expect(calls().some((c) => c.startsWith('DELETE'))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'حذف البلاغ' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'تأكيد' }))
    expect(await screen.findByRole('heading', { name: 'البلاغات', level: 1 })).toBeInTheDocument()
    expect(calls()).toContain('DELETE /api/potholes/1042')
  })

  it('shows the campaign progress', async () => {
    report = { ...detail(), campaign: { id: 3, pothole_id: 1042, status: 'active', target_lyd: 1200, confirmed_lyd: 300, under_review_lyd: 0, donors_count: 4, note_ar: null, note_en: null, street_ar: null, street_en: null, region_name_ar: 'x', region_name_en: 'x', created_at: '2026-11-01T00:00:00Z', funded_at: null, closed_at: null, cost_items: [], final_cost_lyd: null, receipt_key: null, partner: null } }
    show('/admin/reports/1042')
    expect(await screen.findByText('300 من 1,200 د.ل · 4 متبرع')).toBeInTheDocument()
  })

  it('says when a report no longer exists', async () => {
    show('/admin/reports/9999')
    expect(await screen.findByText('لم نجد هذا البلاغ. ربما حُذف.')).toBeInTheDocument()
  })
})

describe('helpers', () => {
  it('reads filters from the address safely', () => {
    expect(parseQueueSearch({ status: 'fixed', sort: 'oldest', page: '3', region_id: '2', duplicates: '1', q: ' 12 ' })).toEqual({
      q: '12', status: 'fixed', severity: undefined, region_id: 2, duplicates: '1', sort: 'oldest', page: 3,
    })
    expect(parseQueueSearch({ status: 'bad', sort: 'newest', page: '1', region_id: '-4' })).toEqual({
      q: undefined, status: undefined, severity: undefined, region_id: undefined, duplicates: undefined, sort: undefined, page: undefined,
    })
  })

  it('counts days', () => {
    const t = (k: string, v?: Record<string, unknown>) => `${k}${v ? JSON.stringify(v) : ''}`
    const now = Date.parse('2026-11-07T12:00:00Z')
    expect(age('2026-11-07T01:00:00Z', t as never, now)).toBe('ago.today')
    expect(age('2026-11-06T01:00:00Z', t as never, now)).toBe('ago.day')
    expect(age('2026-11-01T01:00:00Z', t as never, now)).toBe('ago.days{"n":6}')
  })

  it('compresses a proof photo to the server limits', async () => {
    const { realPrepare } = (await import('@/lib/photo')) as unknown as { realPrepare: typeof preparePhoto }
    const sizes: [number, number, number][] = []
    const canvas: Canvas2D = {
      load: async () => ({
        width: 4000,
        height: 3000,
        draw: async (w, h, q) => {
          sizes.push([w, h, q])
          // Too big at high quality for the full size, fine for the thumbnail.
          return new Blob([new Uint8Array(w > 400 && q > 0.7 ? 500 * 1024 : 1000)])
        },
      }),
    }
    const out = await realPrepare(new Blob(['x']), canvas)
    expect(out.full.size).toBeLessThanOrEqual(400 * 1024)
    expect(sizes[0]).toEqual([1280, 960, 0.85])
    expect(sizes.at(-1)).toEqual([320, 240, 0.85])
    expect(fit(100, 50, 1280)).toEqual({ w: 100, h: 50 })
    const never: Canvas2D = { load: async () => ({ width: 10, height: 10, draw: async () => new Blob([new Uint8Array(900 * 1024)]) }) }
    await expect(realPrepare(new Blob(['x']), never)).rejects.toThrow('too-large')
  })
})
