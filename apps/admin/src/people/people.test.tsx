import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '@/app'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const meOf = (role: string) => ({ user: { id: 3, email: 'owner@hufra.ly', code: 'HF-3', role, locale: 'ar', display_name: 'سالم', totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z' } })
const region = (id: number, over: Record<string, unknown> = {}): Record<string, any> => ({
  id, slug: `r-${id}`, name_ar: `منطقة ${id}`, name_en: `Region ${id}`, city: 'Greater Tripoli', center_lat: 32.88, center_lng: 13.19, active: 1,
  created_at: '2026-01-01T00:00:00.000Z', open_reports: 4, total_reports: 9, admin_count: 1, ...over,
})
const account = (id: number, over: Record<string, unknown> = {}): Record<string, any> => ({
  id, email: `a${id}@hufra.ly`, display_name: `مشرف ${id}`, role: 'admin', code: `HF-${id}`, totp_enabled: false, created_at: '2026-01-01T00:00:00.000Z',
  last_login_at: new Date().toISOString(), suspended: false, regions: [], ...over,
})

let role: string
let admins: Record<string, any>[]
let regions: Record<string, any>[]
let failPromote: boolean
const calls: [string, string, unknown][] = []
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input)
  const method = init?.method ?? 'GET'
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
  if (method !== 'GET') calls.push([method, path, body])
  if (path === '/api/auth/me') return json(meOf(role))
  if (path === '/api/admin/admins') return role === 'super_admin' ? json({ results: admins }) : json({ error: 'Forbidden' }, 403)
  if (path === '/api/admin/regions') return json({ results: regions })
  if (path === '/api/admin/top-donors') {
    return json({ results: [{ name: null, cash: false, amount_millimes: 120000, donations: 1 }, { name: 'مكتب الحي', cash: true, amount_millimes: 100500, donations: 1 }, { name: 'سالم', cash: false, amount_millimes: 80000, donations: 2 }] })
  }
  if (path === '/api/donors') return json({ id: 5 }, 201)
  if (path === '/api/admin/admins/promote') {
    if (failPromote) return json({ error: 'User not found', error_ar: 'لا يوجد حساب بهذا البريد.' }, 404)
    const a = account(9, { email: body.email, role: body.role })
    admins = [...admins, a]
    return json({ ok: true, admin: a })
  }
  if (path === '/api/admin/admins/demote') {
    admins = admins.filter((a) => a.email !== body.email)
    return json({ ok: true })
  }
  const one = /^\/api\/admin\/admins\/(\d+)$/.exec(path)
  if (one) {
    const id = Number(one[1])
    admins = admins.map((a) =>
      a.id === id
        ? { ...a, ...(body.role ? { role: body.role } : {}), ...(body.suspended !== undefined ? { suspended: body.suspended } : {}), ...(body.region_ids ? { regions: regions.filter((r) => body.region_ids.includes(r.id)).map(({ id, name_ar, name_en }) => ({ id, name_ar, name_en })) } : {}) }
        : a
    )
    return json({ admin: admins.find((a) => a.id === id) })
  }
  if (path === '/api/regions' && method === 'POST') return json({ id: 7 }, 201)
  const r = /^\/api\/regions\/(\d+)$/.exec(path)
  if (r) return method === 'DELETE' ? json({ ok: true, deleted_id: Number(r[1]) }) : json({ ok: true })
  return json({ error: 'Not found' }, 404)
})
const show = (path = '/admin/people') => render(<App fetchImpl={fetchMock as unknown as typeof fetch} history={createMemoryHistory({ initialEntries: [path] })} locale="ar" />)

beforeEach(() => {
  fetchMock.mockClear()
  calls.length = 0
  role = 'super_admin'
  failPromote = false
  regions = [region(1), region(2, { admin_count: 0, open_reports: 2 }), region(3, { active: 0, total_reports: 0, admin_count: 0 })]
  admins = [
    account(3, { email: 'owner@hufra.ly', role: 'super_admin', display_name: 'سالم' }),
    account(4, { regions: [{ id: 1, name_ar: 'منطقة 1', name_en: 'Region 1' }, { id: 2, name_ar: 'منطقة 2', name_en: 'Region 2' }] }),
    account(5, { suspended: true, last_login_at: null }),
  ]
})

describe('admins', () => {
  it('lists admins with role, regions, last sign-in and status; your own row has no edit', async () => {
    show()
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByText('مشرف عام')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('كل المناطق')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('حسابك')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('منطقة 1، منطقة 2')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('اليوم')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('موقوف')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('لم يدخل بعد')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('بلا مناطق')).toBeInTheDocument()
  })

  it('changes regions, suspends, and removes admin rights after confirming', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'تعديل مشرف 4' }))
    const panel = screen.getByRole('region', { name: 'تعديل صلاحيات مشرف 4' })
    await user.click(within(panel).getByRole('checkbox', { name: 'منطقة 2' }))
    await user.click(within(panel).getByRole('checkbox', { name: /منطقة 3/ }))
    await user.click(within(panel).getByRole('button', { name: 'حفظ' }))
    await waitFor(() => expect(calls).toContainEqual(['PUT', '/api/admin/admins/4', { role: 'admin', region_ids: [1, 3] }]))
    expect(await within(panel).findByText('تم الحفظ.')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'إيقاف الحساب' }))
    await waitFor(() => expect(calls).toContainEqual(['PUT', '/api/admin/admins/4', { suspended: true }]))
    expect(await within(panel).findByRole('button', { name: 'إعادة تفعيل الحساب' })).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'إزالة صلاحية الإشراف' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'تأكيد' }))
    await waitFor(() => expect(calls).toContainEqual(['POST', '/api/admin/admins/demote', { email: 'a4@hufra.ly' }]))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'تعديل صلاحيات مشرف 4' })).not.toBeInTheDocument())
  })

  it('making someone a super admin hides the regions', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'تعديل مشرف 4' }))
    const panel = screen.getByRole('region', { name: 'تعديل صلاحيات مشرف 4' })
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'الدور' }), 'super_admin')
    expect(within(panel).queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'حفظ' }))
    await waitFor(() => expect(calls).toContainEqual(['PUT', '/api/admin/admins/4', { role: 'super_admin', region_ids: [] }]))
  })

  it('adds an admin by email with regions, and shows why it failed', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: '+ إضافة مشرف' }))
    const form = screen.getByRole('form', { name: 'إضافة مشرف' })
    await user.click(within(form).getByRole('button', { name: 'إضافة' }))
    expect(within(form).getByText('اكتب بريداً إلكترونياً صحيحاً.')).toBeInTheDocument()

    failPromote = true
    await user.type(within(form).getByLabelText('البريد الإلكتروني'), ' New@Hufra.ly ')
    await user.click(await within(form).findByRole('checkbox', { name: 'منطقة 2' }))
    await user.click(within(form).getByRole('button', { name: 'إضافة' }))
    expect(await within(form).findByText('لا يوجد حساب بهذا البريد.')).toBeInTheDocument()

    failPromote = false
    await user.click(within(form).getByRole('button', { name: 'إضافة' }))
    await waitFor(() => expect(calls).toContainEqual(['POST', '/api/admin/admins/promote', { email: 'new@hufra.ly', role: 'admin', region_ids: [2] }]))
    await waitFor(() => expect(screen.queryByRole('form', { name: 'إضافة مشرف' })).not.toBeInTheDocument())
  })

  it('a plain admin sees donors and regions, not the admins list', async () => {
    role = 'admin'
    show()
    expect(await screen.findByRole('heading', { name: 'المتبرعون والمناطق' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ إضافة مشرف' })).not.toBeInTheDocument()
    expect(await screen.findByText(/مكتب الحي/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([p]) => String(p) === '/api/admin/admins')).toBe(false)
  })
})

describe('donors', () => {
  it('ranks donors, anonymous ones as "متبرع", cash marked', async () => {
    show()
    const list = (await screen.findByRole('heading', { name: 'أكبر المتبرعين' })).closest('section')!
    const items = await within(list).findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('1 · متبرع')
    expect(items[0]).toHaveTextContent('120 د.ل')
    expect(items[1]).toHaveTextContent('مكتب الحي (نقداً)')
    expect(items[1]).toHaveTextContent('100.5 د.ل')
    expect(items[2]).toHaveTextContent('2 تبرعات')
  })

  it('records a cash donation, Arabic digits accepted', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'تسجيل تبرع نقدي' }))
    const form = screen.getByRole('form', { name: 'تسجيل تبرع نقدي' })
    await user.click(within(form).getByRole('button', { name: 'حفظ' }))
    expect(within(form).getByText('اكتب اسم المتبرع ومبلغاً أكبر من صفر.')).toBeInTheDocument()
    await user.type(within(form).getByLabelText('اسم المتبرع'), 'محل الحاج')
    await user.type(within(form).getByLabelText('المبلغ (دينار)'), '٢٥٠')
    await user.click(within(form).getByRole('button', { name: 'حفظ' }))
    await waitFor(() => expect(calls).toContainEqual(['POST', '/api/donors', { name: 'محل الحاج', amount_lyd: 250 }]))
  })
})

describe('regions', () => {
  it('shows workload, warns where nobody looks after a region, and edits one', async () => {
    const user = userEvent.setup()
    show('/admin/regions')
    expect(await screen.findByRole('heading', { level: 1, name: 'المناطق' })).toBeInTheDocument()
    expect(await screen.findByText('2 بلاغ مفتوح · لا مشرف')).toHaveClass('text-danger')
    expect(screen.getByText('4 بلاغ مفتوح · 1 مشرف')).not.toHaveClass('text-danger')

    await user.click(screen.getByRole('button', { name: /^منطقة 1/ }))
    const form = screen.getByRole('form', { name: 'تعديل المنطقة' })
    expect(within(form).queryByRole('button', { name: 'حذف المنطقة' })).not.toBeInTheDocument()
    expect(within(form).getByText(/لا يمكن حذفها/)).toBeInTheDocument()
    await user.click(within(form).getByRole('checkbox', { name: 'تظهر للمواطنين عند الإبلاغ' }))
    await user.click(within(form).getByRole('button', { name: 'حفظ' }))
    await waitFor(() => expect(calls).toContainEqual(['PATCH', '/api/regions/1', { slug: 'r-1', name_ar: 'منطقة 1', name_en: 'Region 1', center_lat: 32.88, center_lng: 13.19, active: false }]))
  })

  it('adds a region with a slug from its English name, and deletes an unused one', async () => {
    const user = userEvent.setup()
    show('/admin/regions')
    await user.click(await screen.findByRole('button', { name: '+ منطقة' }))
    const form = screen.getByRole('form', { name: 'منطقة جديدة' })
    await user.click(within(form).getByRole('button', { name: 'حفظ' }))
    expect(within(form).getByText('اكتب الاسمين، وإحداثيات صحيحة للمركز.')).toBeInTheDocument()
    await user.type(within(form).getByLabelText('الاسم بالعربية'), 'عين زارة')
    await user.type(within(form).getByLabelText('الاسم بالإنجليزية'), 'Ain Zara')
    await user.click(within(form).getByRole('button', { name: 'حفظ' }))
    await waitFor(() => expect(calls).toContainEqual(['POST', '/api/regions', { slug: 'ain-zara', name_ar: 'عين زارة', name_en: 'Ain Zara', center_lat: 32.8872, center_lng: 13.1913, active: true }]))

    await user.click(screen.getByRole('button', { name: /^منطقة 3/ }))
    await user.click(within(screen.getByRole('form', { name: 'تعديل المنطقة' })).getByRole('button', { name: 'حذف المنطقة' }))
    await waitFor(() => expect(calls).toContainEqual(['DELETE', '/api/regions/3', undefined]))
  })
})
