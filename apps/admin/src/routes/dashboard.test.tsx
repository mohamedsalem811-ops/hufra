import { createMemoryHistory } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from '@/app'
import { DASHBOARD, fakeApi } from '@/test/fake-api'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const note = (id: number, over: Record<string, unknown> = {}) => ({
  id, target_role: 'admin', target_user_id: null, type: 'new_report', created_at: '2026-11-07T09:00:00.000Z', read_at: null,
  payload_json: JSON.stringify({ title_ar: `بلاغ حفرة جديد #${id}`, title_en: `New report #${id}`, body_ar: 'بانتظار المراجعة', body_en: 'Waiting', pothole_id: id }),
  ...over,
})

let notes: Record<string, any>[]
let dashboard: typeof DASHBOARD
function api() {
  const fake = fakeApi({ signedIn: true })
  const base = fake.fetch.getMockImplementation()!
  fake.fetch.mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.startsWith('/api/admin/dashboard')) return json({ ...dashboard, days: Number(new URL(path, 'http://x').searchParams.get('days')) })
    if (path === '/api/admin/counts') return json({ new_reports: 0, duplicates: 0, donations_to_review: 0, unread_notifications: notes.filter((n) => !n.read_at).length })
    if (path.startsWith('/api/notifications?')) {
      const cursor = new URL(path, 'http://x').searchParams.get('cursor')
      const page = cursor ? notes.filter((n) => n.id < Number(cursor)) : notes.slice(0, 3)
      return json({ results: page, unread_count: notes.filter((n) => !n.read_at).length, next_cursor: cursor ? null : '3' })
    }
    if (path === '/api/notifications/read-all') {
      notes = notes.map((n) => ({ ...n, read_at: '2026-11-08T00:00:00.000Z' }))
      return json({ ok: true })
    }
    if (path.startsWith('/api/admin/queue')) return json({ results: [], total: 0, page: 1, page_size: 25 })
    if (path === '/api/regions') return json({ results: [] })
    return base(input, init)
  })
  return fake
}
const show = (path: string) => render(<App fetchImpl={api().fetch as unknown as typeof fetch} history={createMemoryHistory({ initialEntries: [path] })} locale="ar" />)

beforeEach(() => {
  dashboard = structuredClone(DASHBOARD)
  notes = [
    note(5),
    note(4, { type: 'donation_review', payload_json: JSON.stringify({ title_ar: 'تبرع جديد بانتظار المراجعة', donation_id: 9 }) }),
    note(3, { type: 'payout_changed', read_at: '2026-11-07T10:00:00.000Z', payload_json: JSON.stringify({ title_ar: 'تغيّرت بيانات الحساب' }) }),
    note(2, { payload_json: 'not json' }),
  ]
})

describe('dashboard', () => {
  it('shows the five numbers with their notes, and changes period', async () => {
    const user = userEvent.setup()
    show('/admin/')
    const numbers = await screen.findByRole('region', { name: 'الأرقام الرئيسية' })
    expect(within(numbers).getByText('+40 عن الفترة السابقة')).toBeInTheDocument()
    expect(within(numbers).getByText('في 3 مناطق')).toBeInTheDocument()
    expect(within(numbers).getByText('متوسط 4.5 يوماً للإصلاح')).toBeInTheDocument()
    expect(within(numbers).getByText('12,500.5')).toBeInTheDocument()
    expect(within(numbers).getByText('300 د.ل بانتظار المراجعة')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'تصدير CSV' })).toHaveAttribute('href', '/api/admin/export/reports.csv?days=30')

    await user.selectOptions(screen.getByRole('combobox', { name: 'الفترة' }), '90')
    await waitFor(() => expect(screen.getByRole('link', { name: 'تصدير CSV' })).toHaveAttribute('href', '/api/admin/export/reports.csv?days=90'))
  })

  it('says when nothing changed and nothing was fixed', async () => {
    dashboard.tiles = { ...dashboard.tiles, new_reports_previous: 1240, avg_fix_days: null, oldest_waiting_at: null }
    show('/admin/')
    const numbers = await screen.findByRole('region', { name: 'الأرقام الرئيسية' })
    expect(within(numbers).getByText('0 عن الفترة السابقة')).toBeInTheDocument()
    expect(within(numbers).getByText('لا إصلاحات في هذه الفترة')).toBeInTheDocument()
    expect(within(numbers).getByText('لا شيء ينتظر')).toBeInTheDocument()
  })

  it('draws the weekly chart with a description, a hover number and a table view', async () => {
    const user = userEvent.setup()
    show('/admin/')
    const chart = await screen.findByRole('img', { name: /هذا الأسبوع 33، والأعلى 33/ })
    fireEvent.mouseEnter(chart.firstElementChild!.children[2]!)
    expect(within(chart).getByText(/: 6$/)).toBeInTheDocument()
    fireEvent.mouseLeave(chart.firstElementChild!)
    expect(within(chart).queryByText(/: 6$/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'عرض كجدول' }))
    const table = screen.getByRole('table', { name: 'بلاغات جديدة كل أسبوع' })
    expect(within(table).getAllByRole('row')).toHaveLength(13)
    await user.click(screen.getByRole('button', { name: 'عرض كرسم' }))
    expect(screen.getByRole('img', { name: /رسم أعمدة/ })).toBeInTheDocument()
  })

  it('breaks reports down by status with numbers, lists to-dos and regions', async () => {
    show('/admin/')
    const status = (await screen.findByRole('heading', { name: 'البلاغات حسب الحالة' })).closest('section')!
    expect(within(status).getByRole('img', { name: 'تم الإبلاغ 440، تم التحقق 140، قيد الإصلاح 100، تم الإصلاح 800' })).toBeInTheDocument()
    expect(within(status).getByText(/الحملات المفتوحة: 2 · تحتاج 1,500 د.ل لإكمالها/)).toBeInTheDocument()

    const todo = screen.getByRole('heading', { name: 'يحتاج إجراء منك' }).closest('section')!
    expect(within(todo).getAllByRole('link')).toHaveLength(3) // donations: none waiting
    expect(within(todo).getByRole('link', { name: /12 بلاغات تنتظر التحقق/ })).toHaveAttribute('href', '/admin/reports?status=reported&sort=oldest')
    expect(within(todo).getByRole('link', { name: /3 بلاغات قد تكون مكررة/ })).toHaveAttribute('href', '/admin/duplicates')

    const regions = screen.getByRole('heading', { name: 'حسب المنطقة' }).closest('section')!
    expect(within(regions).getByRole('link', { name: 'سوق الجمعة' })).toHaveAttribute('href', '/admin/reports?region_id=1')
    expect(within(regions).getByText('3.2 يوماً')).toBeInTheDocument()
  })

  it('has calm empty states', async () => {
    dashboard.todo = { stale_reports: 0, donations_to_review: 0, funded_campaigns: 0, duplicates: 0 }
    dashboard.by_region = []
    dashboard.by_status = { reported: 0, verified: 0, under_repair: 0, fixed: 0 }
    show('/admin/')
    expect(await screen.findByText('لا شيء ينتظرك الآن.')).toBeInTheDocument()
    expect(screen.getByText('لا بلاغات بعد.')).toBeInTheDocument()
  })
})

describe('notifications', () => {
  it('lists notifications with where each leads, older ones on request, and marks all read', async () => {
    const user = userEvent.setup()
    show('/admin/notifications')
    expect(await screen.findByText('3 غير مقروءة')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'قائمة الإدارة' })
    expect(await within(nav).findByRole('link', { name: 'الإشعارات 3 غير مقروءة' })).toBeInTheDocument()

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('جديد: بلاغ حفرة جديد #5')
    expect(within(items[0]!).getByRole('link', { name: 'فتح البلاغ' })).toHaveAttribute('href', '/admin/reports/5')
    expect(within(items[1]!).getByRole('link', { name: 'مراجعة التبرع' })).toHaveAttribute('href', '/admin/donations?id=9')
    expect(within(items[2]!).getByRole('link', { name: 'فتح الإعدادات' })).toHaveAttribute('href', '/admin/settings')
    expect(items[2]).not.toHaveTextContent('جديد:')

    await user.click(screen.getByRole('button', { name: 'عرض إشعارات أقدم' }))
    expect(await screen.findByText('إشعار')).toBeInTheDocument() // unreadable payload falls back
    expect(screen.queryByRole('button', { name: 'عرض إشعارات أقدم' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'تعليم الكل كمقروء' }))
    expect(await screen.findByText('قرأت كل الإشعارات.')).toBeInTheDocument()
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'الإشعارات' })).toBeInTheDocument())
  })

  it('says when there are none', async () => {
    notes = []
    show('/admin/notifications')
    expect(await screen.findByText('لا توجد إشعارات بعد.')).toBeInTheDocument()
  })
})

describe('queue CSV', () => {
  it('exports with the same filters as the list', async () => {
    show('/admin/reports?status=verified&region_id=2&page=3')
    expect(await screen.findByRole('link', { name: 'تصدير النتائج CSV' })).toHaveAttribute('href', expect.stringMatching(/^\/api\/admin\/export\/reports\.csv\?(?=.*status=verified)(?=.*region_id=2)(?!.*page=)/))
  })
})

