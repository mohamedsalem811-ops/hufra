import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '@/app'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const me = { user: { id: 3, email: 'staff@hufra.ly', code: 'HF-3', role: 'admin', locale: 'ar', display_name: 'سالم', totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z' } }

const donation = (id: number, over: Record<string, unknown> = {}) => ({
  id, campaign_id: 3, pothole_id: 1042, reference_code: `HF-1042-${id}AB`, method: 'bank_transfer', amount_lyd: 50, status: 'under_review', show_name: false,
  has_proof: true, reject_reason: null, expires_at: null, created_at: '2026-11-07T08:00:00.000Z', reviewed_at: null, street_ar: 'شارع الجمهورية', street_en: null,
  donor: { email: 'donor@hufra.ly', name: 'سالم', code: 'HF-9' }, proof_url: `/api/donations/${id}/proof`, proof_uploaded_at: '2026-11-07T09:00:00.000Z', warnings: [],
  ...over,
})

let queue: ReturnType<typeof donation>[]
let funded = false
const reviews: [string, unknown][] = []
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input)
  if (path === '/api/auth/me') return json(me)
  if (path.startsWith('/api/admin/donations?status=')) {
    const status = new URL(path, 'http://x').searchParams.get('status')
    return json({ results: queue.filter((d) => d.status === status), counts: { under_review: queue.filter((d) => d.status === 'under_review').length, awaiting_transfer: 1, confirmed: 0, rejected: 0 } })
  }
  const review = /^\/api\/admin\/donations\/(\d+)\/review$/.exec(path)
  if (review) {
    const body = JSON.parse(String(init!.body))
    reviews.push([review[1]!, body])
    queue = queue.map((d) => (d.id === Number(review[1]) ? { ...d, status: body.decision === 'confirm' ? 'confirmed' : 'rejected' } : d))
    const { donor: _d, proof_url: _p, proof_uploaded_at: _u, warnings: _w, ...plain } = queue.find((d) => d.id === Number(review[1]))!
    return json({ donation: plain, campaign_funded: funded })
  }
  return json({ error: 'Not found' }, 404)
})
const show = (path = '/admin/donations') => render(<App fetchImpl={fetchMock as unknown as typeof fetch} history={createMemoryHistory({ initialEntries: [path] })} locale="ar" />)

beforeEach(() => {
  fetchMock.mockClear()
  reviews.length = 0
  funded = false
  queue = [donation(1), donation(2, { amount_lyd: 600, warnings: ['large_amount', 'amount_changed'] })]
})

describe('donation review', () => {
  it('shows the screenshot next to the amount, reference and donor', async () => {
    show()
    expect(await screen.findByRole('heading', { name: '50 د.ل · HF-1042-1AB' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'لقطة شاشة التحويل للتبرع HF-1042-1AB' })).toHaveAttribute('src', '/api/donations/1/proof')
    expect(screen.getByText('donor@hufra.ly')).toBeInTheDocument()
    expect(screen.getByText('لا، يظهر «متبرع»')).toBeInTheDocument()
    expect(screen.getByText(/لا تحذيرات تلقائية لهذا التبرع/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'بانتظار المراجعة (2)' })).toHaveAttribute('aria-selected', 'true')
  })

  it('lists warnings in words', async () => {
    const user = userEvent.setup()
    show()
    const list = await screen.findByRole('region', { name: 'قائمة التبرعات' })
    expect(within(list).getByText('مبلغ كبير')).toBeInTheDocument()
    await user.click(within(list).getByRole('button', { name: /600 د.ل/ }))
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('مبلغ كبير: تحقّق من الكشف مرتين.')
    expect(note).toHaveTextContent('غيّر المتبرع المبلغ عند إرسال الصورة.')
  })

  it('confirms only after matching the statement, with the amount that arrived', async () => {
    const user = userEvent.setup()
    funded = true
    show()
    await screen.findByRole('heading', { name: '50 د.ل · HF-1042-1AB' })
    await user.click(screen.getByRole('button', { name: 'تأكيد التبرع' }))
    expect(screen.getByRole('alert')).toHaveTextContent('أكّد أنك وجدت التحويل في الكشف أولاً.')
    expect(reviews).toHaveLength(0)
    await user.click(screen.getByRole('checkbox', { name: 'وجدت التحويل في كشف الحساب' }))
    const amount = screen.getByLabelText('المبلغ الفعلي في الكشف (د.ل)')
    await user.clear(amount)
    await user.type(amount, '45')
    await user.click(screen.getByRole('button', { name: 'تأكيد التبرع' }))
    expect(await screen.findByText('تم تأكيد التبرع واكتمل تمويل الحملة.')).toBeInTheDocument()
    expect(reviews).toEqual([['1', { decision: 'confirm', amount_lyd: 45 }]])
    await waitFor(() => expect(screen.getByRole('heading', { name: '600 د.ل · HF-1042-2AB' })).toBeInTheDocument())
  })

  it('rejects with a reason the donor sees', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByRole('heading', { name: '50 د.ل · HF-1042-1AB' })
    await user.click(screen.getByRole('button', { name: 'رفض…' }))
    await user.click(screen.getByRole('radio', { name: 'سبب آخر' }))
    await user.click(screen.getByRole('button', { name: 'رفض التبرع' }))
    expect(screen.getByRole('alert')).toHaveTextContent('اكتب السبب')
    await user.type(screen.getByLabelText('اكتب السبب'), 'التحويل لحساب آخر')
    await user.click(screen.getByRole('button', { name: 'رفض التبرع' }))
    expect(await screen.findByText('تم رفض التبرع وإبلاغ المتبرع.')).toBeInTheDocument()
    expect(reviews).toEqual([['1', { decision: 'reject', reason: 'التحويل لحساب آخر' }]])
  })

  it('uses a ready-made reason', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByRole('heading', { name: '50 د.ل · HF-1042-1AB' })
    await user.click(screen.getByRole('button', { name: 'رفض…' }))
    await user.click(screen.getByRole('radio', { name: 'الصورة غير واضحة' }))
    await user.click(screen.getByRole('button', { name: 'رفض التبرع' }))
    await waitFor(() => expect(reviews).toEqual([['1', { decision: 'reject', reason: 'الصورة غير واضحة' }]]))
  })

  it('shows past decisions read-only, and an empty tab plainly', async () => {
    queue = [donation(5, { status: 'rejected', reject_reason: 'الصورة غير واضحة', reviewed_at: '2026-11-07T10:00:00.000Z' })]
    show('/admin/donations?tab=rejected')
    expect(await screen.findByText(/سبب الرفض: الصورة غير واضحة/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تأكيد التبرع' })).not.toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'مؤكدة' }))
    expect(await screen.findByText('لا تبرعات هنا.')).toBeInTheDocument()
  })
})
