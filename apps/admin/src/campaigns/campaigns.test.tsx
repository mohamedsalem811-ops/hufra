import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '@/app'

import { parseItems, sumLyd } from './cost-items'

vi.mock('@/lib/photo', async (orig) => ({ ...(await orig<typeof import('@/lib/photo')>()), prepareSingle: vi.fn(async () => new Blob(['r'])) }))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const me = { user: { id: 3, email: 'staff@hufra.ly', code: 'HF-3', role: 'admin', locale: 'ar', display_name: 'سالم', totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z' } }

const camp = (over: Record<string, unknown> = {}): Record<string, any> => ({
  id: 3, pothole_id: 1042, status: 'active', target_lyd: 1200, confirmed_lyd: 340, under_review_lyd: 90, donors_count: 12, note_ar: null, note_en: null,
  street_ar: 'شارع الجمهورية', street_en: null, region_name_ar: 'وسط المدينة', region_name_en: 'City centre', created_at: '2026-11-01T08:00:00.000Z',
  funded_at: null, closed_at: null, close_reason: null, raised_millimes: 340000,
  cost_items: [{ label: 'مواد', amount_lyd: 700 }, { label: 'عمال', amount_lyd: 500 }], contractor: null, final_cost_lyd: null, receipt_key: null, partner_id: null, ...over,
})
const report = {
  pothole: {
    id: 1042, region_id: 1, lat: 32.88, lng: 13.19, length_cm: null, width_cm: null, depth_cm: null, severity: 'severe', status: 'verified',
    description_ar: null, description_en: null, street_ar: 'شارع الجمهورية', street_en: null, view_count: 0, upvotes_count: 0,
    created_at: '2026-11-01T08:40:00.000Z', updated_at: '2026-11-01T08:40:00.000Z', verified_at: null, under_repair_at: null, fixed_at: null,
    deleted_at: null, region_name_ar: 'وسط المدينة', region_name_en: 'City centre', region_slug: 'centre', reporter_id: null, reporter_contact: null, client_report_uuid: null,
  },
  photos: [], history: [], reporter: null, duplicates: [], campaign: null,
}

let campaigns: Record<string, any>[]
let pool: number
const bodies: Record<string, unknown[]> = {}
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input)
  const method = init?.method ?? 'GET'
  const key = `${method} ${path}`
  if (init?.body && typeof init.body === 'string') (bodies[key] ??= []).push(JSON.parse(init.body))
  if (path === '/api/auth/me') return json(me)
  if (path === '/api/admin/campaigns' && method === 'GET') return json({ results: campaigns, pool_lyd: pool })
  if (path === '/api/admin/campaigns' && method === 'POST') {
    const b = JSON.parse(String(init!.body))
    const c = camp({ id: 9, target_lyd: b.target_lyd, confirmed_lyd: 0, cost_items: b.cost_items })
    campaigns = [...campaigns, c]
    return json({ campaign: c }, 201)
  }
  const patch = /^\/api\/admin\/campaigns\/(\d+)$/.exec(path)
  if (patch && method === 'PATCH') {
    const b = JSON.parse(String(init!.body))
    campaigns = campaigns.map((c) => (c.id === Number(patch[1]) ? { ...c, ...b, ...(b.cost_items ? { target_lyd: sumLyd(b.cost_items) } : {}) } : c))
    return json({ campaign: campaigns.find((c) => c.id === Number(patch[1])) })
  }
  if (path.endsWith('/allocate')) return json({ error: 'Not enough money in the pool', error_ar: 'الرصيد المتبقي غير كافٍ' }, 409)
  if (path.endsWith('/receipt')) {
    campaigns = campaigns.map((c) => ({ ...c, receipt_key: 'photos/receipts/3/r.jpg' }))
    return json({ campaign: campaigns[0] }, 201)
  }
  if (path === '/api/admin/reports/1042') return json(report)
  return json({ error: 'Not found' }, 404)
})
const show = (path: string) => render(<App fetchImpl={fetchMock as unknown as typeof fetch} history={createMemoryHistory({ initialEntries: [path] })} locale="ar" />)

beforeEach(() => {
  fetchMock.mockClear()
  for (const k of Object.keys(bodies)) delete bodies[k]
  campaigns = [camp(), camp({ id: 4, status: 'completed', pothole_id: 1021, street_ar: 'طريق الشط', final_cost_lyd: 900 })]
  pool = 150
})

describe('campaign list', () => {
  it('separates open and closed campaigns and shows the pool', async () => {
    const user = userEvent.setup()
    show('/admin/campaigns')
    expect(await screen.findByRole('link', { name: 'شارع الجمهورية' })).toHaveAttribute('href', '/admin/campaigns/3')
    expect(screen.getByText('340 من 1,200 د.ل')).toBeInTheDocument()
    expect(screen.getByText('12 متبرع · 90 د.ل بانتظار المراجعة')).toBeInTheDocument()
    expect(screen.getByText('رصيد متبقٍّ من حملات مغلقة: 150 د.ل')).toBeInTheDocument()
    expect(screen.queryByText('طريق الشط')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'مغلقة' }))
    expect(screen.getByRole('link', { name: 'طريق الشط' })).toBeInTheDocument()
  })
})

describe('new campaign', () => {
  it('builds the target from the cost items and opens the new campaign', async () => {
    const user = userEvent.setup()
    show('/admin/campaigns/new?report=1042')
    expect(await screen.findByRole('heading', { name: 'بدء حملة إصلاح' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'مبلغ البند 1' }), '٧٠٠')
    await user.type(screen.getByRole('textbox', { name: 'مبلغ البند 2' }), '500.5')
    expect(screen.getByText('1,200.5 د.ل', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('د.ل مؤكدة من 1,200.5 د.ل')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/جهة التنفيذ/), 'فريق الصيانة')
    await user.click(screen.getByRole('button', { name: 'بدء الحملة' }))
    expect(await screen.findByRole('heading', { name: 'شارع الجمهورية', level: 1 })).toBeInTheDocument()
    expect(bodies['POST /api/admin/campaigns']![0]).toEqual({
      pothole_id: 1042,
      target_lyd: 1200.5,
      cost_items: [{ label: 'مواد (أسفلت، ردم)', amount_lyd: 700 }, { label: 'أجرة العمال والمعدات', amount_lyd: 500.5 }],
      contractor: 'فريق الصيانة',
    })
  })

  it('refuses an incomplete item', async () => {
    const user = userEvent.setup()
    show('/admin/campaigns/new?report=1042')
    await user.type(await screen.findByRole('textbox', { name: 'مبلغ البند 1' }), 'abc')
    await user.click(screen.getByRole('button', { name: 'بدء الحملة' }))
    expect(screen.getByRole('alert')).toHaveTextContent('أكمل كل بند: اسم ومبلغ صحيح.')
    expect(bodies['POST /api/admin/campaigns']).toBeUndefined()
  })

  it('adds and removes lines', async () => {
    const user = userEvent.setup()
    show('/admin/campaigns/new?report=1042')
    await user.click(await screen.findByRole('button', { name: '+ إضافة بند' }))
    expect(screen.getByRole('textbox', { name: 'البند 3' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'حذف البند 1' }))
    expect(screen.queryByRole('textbox', { name: 'البند 3' })).not.toBeInTheDocument()
  })

  it('needs a report', async () => {
    show('/admin/campaigns/new')
    expect(await screen.findByText(/اختر البلاغ أولاً/)).toBeInTheDocument()
  })
})

describe('campaign page', () => {
  it('saves a new breakdown', async () => {
    const user = userEvent.setup()
    show('/admin/campaigns/3')
    const amount = await screen.findByRole('textbox', { name: 'مبلغ البند 2' })
    await user.clear(amount)
    await user.type(amount, '800')
    await user.click(screen.getByRole('button', { name: 'حفظ التكلفة' }))
    expect(await screen.findByText('تم الحفظ.')).toBeInTheDocument()
    expect(bodies['PATCH /api/admin/campaigns/3']![0]).toEqual({ cost_items: [{ label: 'مواد', amount_lyd: 700 }, { label: 'عمال', amount_lyd: 800 }], contractor: '' })
    expect(await screen.findByText('340 من 1,500 د.ل')).toBeInTheDocument()
  })

  it('explains a pool transfer the server refuses', async () => {
    const user = userEvent.setup()
    show('/admin/campaigns/3')
    expect(await screen.findByText('المتاح الآن: 150 د.ل')).toBeInTheDocument()
    await user.type(screen.getByLabelText('المبلغ (د.ل)', { selector: 'input' }), '100')
    await user.click(screen.getByRole('button', { name: 'نقل المبلغ' }))
    expect(await screen.findByText('الرصيد المتبقي غير كافٍ')).toBeInTheDocument()
  })

  it('cancels only with a reason', async () => {
    const user = userEvent.setup()
    show('/admin/campaigns/3')
    const form = (await screen.findByRole('heading', { name: 'إلغاء الحملة' })).closest('form')!
    await user.click(within(form).getByRole('button', { name: 'إلغاء الحملة' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('اكتب سبب الإلغاء.')
    await user.type(within(form).getByLabelText(/سبب الإلغاء/), 'أصلحتها البلدية')
    await user.click(within(form).getByRole('button', { name: 'إلغاء الحملة' }))
    await waitFor(() => expect(bodies['PATCH /api/admin/campaigns/3']).toEqual([{ status: 'cancelled', reason: 'أصلحتها البلدية' }]))
  })

  it('completes with the final cost, then takes the receipt', async () => {
    const user = userEvent.setup()
    show('/admin/campaigns/3')
    const form = (await screen.findByRole('heading', { name: 'إكمال الحملة بعد الإصلاح' })).closest('form')!
    const cost = within(form).getByLabelText('التكلفة النهائية الفعلية (د.ل)')
    await user.clear(cost)
    await user.type(cost, '1100')
    await user.click(within(form).getByRole('button', { name: 'إكمال ونشر التكلفة' }))
    expect(await screen.findByText('التكلفة النهائية: 1,100 د.ل')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('رفع صورة الإيصال'), new File(['x'], 'r.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByRole('img', { name: 'إيصال إصلاح الحفرة' })).toHaveAttribute('src', '/media/photos/receipts/3/r.jpg')
    expect(screen.getByLabelText('استبدال صورة الإيصال')).toBeInTheDocument()
  })

  it('says when the campaign does not exist', async () => {
    show('/admin/campaigns/77')
    expect(await screen.findByText('لم نجد هذه الحملة.')).toBeInTheDocument()
  })
})

describe('cost items', () => {
  it('parse and add up in thousandths', () => {
    const items = [
      { key: 1, label: 'a', amount: '0.1' },
      { key: 2, label: 'b', amount: '0.2' },
      { key: 3, label: '', amount: '' },
    ]
    expect(sumLyd(parseItems(items)!)).toBe(0.3)
    expect(parseItems([{ key: 1, label: 'a', amount: '1.2345' }])).toBeNull()
    expect(parseItems([{ key: 1, label: '', amount: '5' }])).toBeNull()
  })
})
