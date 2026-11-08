import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '@/app'

import { auditDetails, toCsv } from './settings-page'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
let role = 'super_admin'
const me = () => ({ user: { id: 3, email: 'owner@hufra.ly', code: 'HF-3', role, locale: 'ar', display_name: 'المالك', totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z', legal_version_accepted: null } })

let payout: Record<string, unknown>
let legalVersion = 0
const puts: Record<string, any[]> = {}
const audit = (id: number, over: Record<string, unknown> = {}) => ({
  id, created_at: '2026-11-07T10:00:00.000Z', action: 'settings.donations', entity: 'app_settings', entity_id: null, actor_id: 3, actor_name: 'المالك', actor_email: 'owner@hufra.ly', actor_code: 'HF-3',
  before: { iban: 'LY83002048000020100120361' }, after: { iban: 'LY38021001000000123456789' }, ...over,
})

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input)
  const method = init?.method ?? 'GET'
  if (method === 'PUT') (puts[path] ??= []).push(JSON.parse(String(init!.body)))
  if (path === '/api/auth/me') return json(me())
  if (path === '/api/admin/settings/donations') {
    if (method === 'PUT') {
      const b = puts[path]!.at(-1)
      if (b.iban !== payout.iban && b.current_password !== 'right') return json({ error: 'Enter your password', error_ar: 'أدخل كلمة مرورك لتغيير بيانات الحساب' }, 403)
      const { current_password: _p, ...rest } = b
      payout = { ...rest, iban: String(rest.iban).replace(/\s/g, '') }
    }
    return json({ settings: payout })
  }
  if (path === '/api/admin/settings/rules') return json({ rules: method === 'PUT' ? puts[path]!.at(-1) : { duplicate_radius_m: 50, pending_hours: 48, large_lyd: 500 } })
  if (path === '/api/site/contact' || path === '/api/admin/settings/contact') return json({ contact: method === 'PUT' ? puts[path]!.at(-1) : { public_email: '', privacy_email: '', phone: '', social_links: [] } })
  if (path === '/api/site/legal' || path === '/api/admin/settings/legal') {
    const body = method === 'PUT' ? puts[path]!.at(-1) : null
    if (body) legalVersion++
    const { material: _m, ...info } = body ?? {
      legal_name_ar: '', legal_name_en: '', registration_no: '', address: '', courts: 'طرابلس', retention_financial_years: null, retention_screenshots_days: 90, wrong_transfer_days: 14, privacy_reply_days: 30,
    }
    return json({ version: legalVersion, published_at: legalVersion ? '2026-11-07T10:00:00.000Z' : null, acceptance_required_from: body?.material ? legalVersion : 0, complete: !!(info.legal_name_ar && info.address && info.retention_financial_years !== null), info })
  }
  if (path === '/api/app/version-settings') {
    return json(method === 'PUT' ? puts[path]!.at(-1) : { ios: { latest: '1.0.0', minimum: '1.0.0', store_url: '' }, android: { latest: '1.0.0', minimum: '1.0.0', store_url: '' } })
  }
  if (path.startsWith('/api/admin/audit-logs')) {
    const p = new URL(path, 'http://x').searchParams
    if (p.get('cursor')) return json({ results: [audit(1, { action: 'campaign.create', before: null, after: { pothole_id: 4 }, entity: 'campaigns', entity_id: 9 })], next_cursor: null })
    if (p.get('action') === 'legal') return json({ results: [], next_cursor: null })
    return json({ results: [audit(2)], next_cursor: '2' })
  }
  return json({ error: 'Not found' }, 404)
})
const show = () => render(<App fetchImpl={fetchMock as unknown as typeof fetch} history={createMemoryHistory({ initialEntries: ['/admin/settings'] })} locale="ar" />)
const section = async (name: string) => (await screen.findByRole('heading', { name, level: 2 })).closest('form')!

beforeEach(() => {
  fetchMock.mockClear()
  for (const k of Object.keys(puts)) delete puts[k]
  role = 'super_admin'
  legalVersion = 0
  payout = { enabled: false, account_holder: '', bank_name: '', iban: '', account_number: '', open_mode_ios: 'in_app', open_mode_android: 'in_app' }
})

describe('bank account', () => {
  it('asks for the password only when the bank details change', async () => {
    const user = userEvent.setup()
    show()
    const form = await section('حساب استلام التبرعات')
    expect(within(form).getByRole('status')).toHaveTextContent('لم تُضف بيانات الحساب بعد')
    expect(within(form).queryByLabelText('كلمة مرورك للتأكيد')).not.toBeInTheDocument()
    await user.type(within(form).getByLabelText('رقم الحساب الدولي IBAN'), 'LY83 0020 4800 0020 1001 2036 1')
    await user.click(within(form).getByRole('button', { name: 'حفظ بيانات الحساب' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('أدخل كلمة مرورك لتغيير بيانات الحساب.')
    await user.type(within(form).getByLabelText('كلمة مرورك للتأكيد'), 'wrong')
    await user.click(within(form).getByRole('button', { name: 'حفظ بيانات الحساب' }))
    expect(await within(form).findByText('أدخل كلمة مرورك لتغيير بيانات الحساب')).toBeInTheDocument()
    await user.clear(within(form).getByLabelText('كلمة مرورك للتأكيد'))
    await user.type(within(form).getByLabelText('كلمة مرورك للتأكيد'), 'right')
    await user.click(within(form).getByRole('button', { name: 'حفظ بيانات الحساب' }))
    await waitFor(() => expect(payout.iban).toBe('LY83002048000020100120361'))
  })

  it('checks the IBAN before sending, and switches need no password', async () => {
    const user = userEvent.setup()
    show()
    const form = await section('حساب استلام التبرعات')
    await user.type(within(form).getByLabelText('رقم الحساب الدولي IBAN'), 'LY00 1234')
    await user.click(within(form).getByRole('button', { name: 'حفظ بيانات الحساب' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('يبدأ بـ LY')
    await user.clear(within(form).getByLabelText('رقم الحساب الدولي IBAN'))
    await user.selectOptions(within(form).getByLabelText('فتح صفحة التبرع على iPhone'), 'safari')
    await user.click(within(form).getByRole('button', { name: 'حفظ بيانات الحساب' }))
    await waitFor(() => expect(puts['/api/admin/settings/donations']).toEqual([expect.objectContaining({ open_mode_ios: 'safari' })]))
    expect(puts['/api/admin/settings/donations']![0]).not.toHaveProperty('current_password')
  })
})

describe('other settings', () => {
  it('saves the rules after checking the limits', async () => {
    const user = userEvent.setup()
    show()
    const form = await section('قواعد عامة')
    const radius = within(form).getByLabelText('مسافة البحث عن البلاغات المكررة')
    await user.clear(radius)
    await user.type(radius, '5')
    await user.click(within(form).getByRole('button', { name: 'حفظ القواعد' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('المسافة 10–500 م')
    await user.clear(radius)
    await user.type(radius, '80')
    await user.click(within(form).getByRole('button', { name: 'حفظ القواعد' }))
    expect(await within(form).findByText('تم الحفظ.')).toBeInTheDocument()
    expect(puts['/api/admin/settings/rules']).toEqual([{ duplicate_radius_m: 80, pending_hours: 48, large_lyd: 500 }])
  })

  it('saves contact details with one link per line', async () => {
    const user = userEvent.setup()
    show()
    const form = await section('بيانات التواصل')
    await user.type(within(form).getByLabelText('بريد التواصل العام'), 'info@hufra.ly')
    await user.type(within(form).getByLabelText(/روابط التواصل الاجتماعي/), 'https://facebook.com/hufra{enter}{enter} https://x.com/hufra ')
    await user.click(within(form).getByRole('button', { name: 'حفظ بيانات التواصل' }))
    await waitFor(() =>
      expect(puts['/api/admin/settings/contact']).toEqual([{ public_email: 'info@hufra.ly', privacy_email: '', phone: '', social_links: ['https://facebook.com/hufra', 'https://x.com/hufra'] }]),
    )
  })

  it('publishes a new legal version, as a material change by default', async () => {
    const user = userEvent.setup()
    show()
    const form = await section('المعلومات القانونية')
    expect(within(form).getByText('لم تُنشر أي نسخة بعد.')).toBeInTheDocument()
    expect(within(form).getByText('قيد الإعداد')).toBeInTheDocument()
    await user.type(within(form).getByLabelText('الاسم القانوني للجهة (عربي)'), 'شركة حفرة')
    await user.type(within(form).getByLabelText('العنوان'), 'طرابلس')
    await user.type(within(form).getByLabelText('حفظ السجلات المالية'), '10')
    await user.click(within(form).getByRole('button', { name: 'حفظ ونشر الصفحات القانونية' }))
    expect(await within(form).findByText(/النسخة المنشورة: 1/)).toBeInTheDocument()
    expect(within(form).getByText('مكتملة')).toBeInTheDocument()
    expect(puts['/api/admin/settings/legal']![0]).toMatchObject({ legal_name_ar: 'شركة حفرة', retention_financial_years: 10, material: true })
  })

  it('checks app versions', async () => {
    const user = userEvent.setup()
    show()
    const form = await section('إصدارات التطبيق')
    const latest = within(within(form).getByRole('group', { name: 'Android' })).getByLabelText('آخر إصدار')
    await user.clear(latest)
    await user.type(latest, '1.1')
    await user.click(within(form).getByRole('button', { name: 'حفظ الإصدارات' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('1.2.3')
    await user.type(latest, '.0')
    await user.click(within(form).getByRole('button', { name: 'حفظ الإصدارات' }))
    await waitFor(() => expect(puts['/api/app/version-settings']![0].android.latest).toBe('1.1.0'))
  })

  it('is read-only for an admin, without the audit log', async () => {
    role = 'admin'
    show()
    const form = await section('حساب استلام التبرعات')
    expect(within(form).getByLabelText('اسم صاحب الحساب')).toBeDisabled()
    expect(within(form).getByText('للاطلاع فقط: يغيّرها المشرف العام.')).toBeInTheDocument()
    expect(within(await section('بيانات التواصل')).getByRole('button', { name: 'حفظ بيانات التواصل' })).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'سجل التدقيق' })).not.toBeInTheDocument()
  })
})

describe('audit log', () => {
  it('lists, filters and pages, with bank numbers masked', async () => {
    const user = userEvent.setup()
    show()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('app_settings · iban: ••••0361 → ••••6789')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'عرض المزيد' }))
    expect(await screen.findByText('campaigns #9 · pothole_id: 4')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('نوع الإجراء'), 'legal')
    expect(await screen.findByText('لا إجراءات مسجلة.')).toBeInTheDocument()
  })

  it('exports CSV that a spreadsheet cannot run as a formula', () => {
    const csv = toCsv([audit(5, { actor_name: '=HYPERLINK("x")', after: { note: 'a "quote"' } }) as never])
    expect(csv.split('\r\n')[0]).toBe('id,created_at,actor,action,entity,entity_id,before,after')
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"{""note"":""a \\""quote\\""""}"')
    expect(auditDetails(audit(6, { before: null, after: null, entity_id: 4, entity: 'potholes' }) as never)).toBe('potholes #4')
  })
})
