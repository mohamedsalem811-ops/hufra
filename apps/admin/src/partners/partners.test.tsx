import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '@/app'
import { prepareLogo, type LogoCanvas } from '@/lib/photo'

vi.mock('@/lib/photo', async (orig) => {
  const real = await orig<typeof import('@/lib/photo')>()
  return { ...real, prepareLogo: vi.fn(async () => new Blob(['png'], { type: 'image/png' })), realPrepareLogo: real.prepareLogo }
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const me = { user: { id: 3, email: 'team@hufra.ly', code: 'HF-3', role: 'admin', locale: 'ar', display_name: 'سالم', totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z' } }
const row = (id: number, over: Record<string, unknown> = {}): Record<string, any> => ({
  id, name_ar: `شريك ${id}`, name_en: `Partner ${id}`, description_ar: '', description_en: '', website: '', kind: 'repair_sponsor', logo_key: null,
  starts_on: null, ends_on: null, show_home: true, show_about: true, show_app: true, show_campaigns: true, featured: false, visible: true,
  sort_order: id, live: true, funded_count: 0, funded_lyd: 0, ...over,
})

let partners: Record<string, any>[]
const calls: [string, string, unknown][] = []
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input)
  const method = init?.method ?? 'GET'
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
  if (method !== 'GET') calls.push([method, path, body])
  if (path === '/api/auth/me') return json(me)
  if (path === '/api/admin/partners' && method === 'GET') return json({ results: partners })
  if (path === '/api/admin/partners' && method === 'POST') {
    const p = row(9, { ...body, sort_order: 9 })
    partners = [...partners, p]
    return json({ partner: p }, 201)
  }
  if (path === '/api/admin/partners/order') {
    partners = (body as { ids: number[] }).ids.map((id, i) => ({ ...partners.find((p) => p.id === id)!, sort_order: i + 1 }))
    return json({ results: partners })
  }
  const one = /^\/api\/admin\/partners\/(\d+)(\/logo)?$/.exec(path)
  if (one) {
    const id = Number(one[1])
    if (one[2]) {
      partners = partners.map((p) => (p.id === id ? { ...p, logo_key: `photos/partners/${id}/l.png` } : p))
      return json({ partner: partners.find((p) => p.id === id) }, 201)
    }
    if (method === 'DELETE') {
      partners = partners.filter((p) => p.id !== id)
      return json({ ok: true })
    }
    partners = partners.map((p) => (p.id === id ? { ...p, ...body } : p))
    return json({ partner: partners.find((p) => p.id === id) })
  }
  return json({ error: 'Not found' }, 404)
})
const show = (path = '/admin/partners') => render(<App fetchImpl={fetchMock as unknown as typeof fetch} history={createMemoryHistory({ initialEntries: [path] })} locale="ar" />)

beforeEach(() => {
  fetchMock.mockClear()
  calls.length = 0
  partners = [row(1, { featured: true, funded_count: 3, funded_lyd: 2400 }), row(2, { ends_on: '2026-12-31' }), row(3, { visible: false })]
})

describe('partners', () => {
  it('lists partners with their state and moves them up and down', async () => {
    const user = userEvent.setup()
    show()
    const list = await screen.findByRole('region', { name: 'قائمة الشركاء' })
    expect(within(list).getByText('شريك مميز')).toBeInTheDocument()
    expect(within(list).getByText('مخفي')).toBeInTheDocument()
    expect(within(list).getByText(/حتى 31 ديسمبر 2026/)).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'نقل شريك 1 لأعلى' })).toBeDisabled()
    await user.click(within(list).getByRole('button', { name: 'نقل شريك 3 لأعلى' }))
    await waitFor(() => expect(calls).toContainEqual(['PUT', '/api/admin/partners/order', { ids: [1, 3, 2] }]))
  })

  it('adds a partner, then takes its logo', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: '+ إضافة شريك' }))
    const form = (await screen.findByRole('heading', { name: 'شريك جديد' })).closest('form')!
    expect(within(form).getByText('احفظ الشريك أولاً، ثم ارفع الشعار.')).toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: 'حفظ' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('أكمل الاسمين')
    await user.type(within(form).getByLabelText('الاسم بالعربية'), 'مصرف الجمهورية')
    await user.type(within(form).getByLabelText('الاسم بالإنجليزية'), 'Jumhouria Bank')
    await user.type(within(form).getByLabelText('الموقع الإلكتروني'), 'https://bank.ly')
    await user.click(within(form).getByRole('checkbox', { name: /شريك مميز/ }))
    await user.click(within(form).getByRole('button', { name: 'حفظ' }))
    const edit = (await screen.findByRole('heading', { name: 'تعديل الشريك' })).closest('form')!
    expect(calls[0]).toEqual(['POST', '/api/admin/partners', expect.objectContaining({ name_ar: 'مصرف الجمهورية', website: 'https://bank.ly', featured: true, visible: true })])
    await user.upload(within(edit).getByLabelText('رفع الشعار'), new File(['<svg/>'], 'l.svg', { type: 'image/svg+xml' }))
    expect(await within(edit).findByRole('img', { name: 'شعار مصرف الجمهورية' })).toHaveAttribute('src', '/media/photos/partners/9/l.png')
    const upload = calls.find(([, p]) => p.endsWith('/logo'))!
    expect((upload[2] as FormData).get('logo')).toBeInstanceOf(Blob)
  })

  it('edits placements and shows the featured preview with funded numbers', async () => {
    const user = userEvent.setup()
    show('/admin/partners?id=1')
    const form = (await screen.findByRole('heading', { name: 'تعديل الشريك' })).closest('form')!
    expect(within(form).getByText('موّل إصلاح 3 حفر · 2,400 د.ل')).toBeInTheDocument()
    await user.click(within(form).getByRole('checkbox', { name: 'الرئيسية في التطبيق' }))
    await user.click(within(form).getByRole('checkbox', { name: 'ظاهر للعامة' }))
    await user.click(within(form).getByRole('button', { name: 'حفظ' }))
    await waitFor(() => expect(calls[0]![2]).toMatchObject({ show_app: false, visible: false }))
  })

  it('refuses an end date before the start', async () => {
    const user = userEvent.setup()
    show('/admin/partners?id=2')
    const form = (await screen.findByRole('heading', { name: 'تعديل الشريك' })).closest('form')!
    await user.type(within(form).getByLabelText('يظهر من'), '2027-01-05')
    await user.click(within(form).getByRole('button', { name: 'حفظ' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('تاريخ النهاية بعد البداية')
    expect(calls).toHaveLength(0)
  })

  it('deletes only after a confirmation', async () => {
    const user = userEvent.setup()
    show('/admin/partners?id=2')
    await user.click(await screen.findByRole('button', { name: 'حذف الشريك' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'تأكيد' }))
    expect(await screen.findByText('اختر شريكاً من القائمة أو أضف شريكاً جديداً.')).toBeInTheDocument()
    expect(calls).toEqual([['DELETE', '/api/admin/partners/2', undefined]])
  })
})

describe('logo preparation', () => {
  it('draws small logos larger and keeps PNG when it fits', async () => {
    const { realPrepareLogo } = (await import('@/lib/photo')) as unknown as { realPrepareLogo: typeof prepareLogo }
    const draws: [number, number, string][] = []
    const canvas: LogoCanvas = { load: async () => ({ width: 200, height: 100, draw: async (w, h, type) => (draws.push([w, h, type]), new Blob(['x'], { type })) }) }
    const out = await realPrepareLogo(new Blob(['<svg/>']), canvas)
    expect(out.type).toBe('image/png')
    expect(draws).toEqual([[512, 256, 'image/png']])
  })

  it('falls back to WebP for a heavy logo, and gives up when nothing fits', async () => {
    const { realPrepareLogo } = (await import('@/lib/photo')) as unknown as { realPrepareLogo: typeof prepareLogo }
    const big = (type: string, size: number) => new Blob([new Uint8Array(size)], { type })
    const canvas: LogoCanvas = { load: async () => ({ width: 3000, height: 3000, draw: async (w, _h, type) => (expect(w).toBe(1024), type === 'image/png' ? big(type, 900_000) : big(type, 100_000)) }) }
    expect((await realPrepareLogo(new Blob(['x']), canvas)).type).toBe('image/webp')
    const never: LogoCanvas = { load: async () => ({ width: 600, height: 600, draw: async (_w, _h, type) => big(type, 900_000) }) }
    await expect(realPrepareLogo(new Blob(['x']), never)).rejects.toThrow('too-large')
  })
})
