import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { App, shouldRetry } from './app'
import { ApiError } from './api/client'
import { fakeApi } from './test/fake-api'

function show(api: ReturnType<typeof fakeApi>, path = '/admin/', locale?: 'ar' | 'en') {
  return render(<App fetchImpl={api.fetch as unknown as typeof fetch} history={createMemoryHistory({ initialEntries: [path] })} locale={locale} />)
}

async function signIn(password = 'right-Passw0rd') {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('البريد الإلكتروني'), 'staff@hufra.ly')
  await user.type(screen.getByLabelText('كلمة المرور'), password)
  await user.click(screen.getByRole('button', { name: 'دخول' }))
  return user
}

describe('sign-in', () => {
  it('shows the sign-in form, in Arabic and right to left, when signed out', async () => {
    show(fakeApi())
    expect(await screen.findByRole('heading', { name: 'دخول المشرفين' })).toBeInTheDocument()
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
  })

  it('asks for both fields before sending', async () => {
    const api = fakeApi()
    show(api)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'دخول' }))
    expect(screen.getByRole('alert')).toHaveTextContent('أدخل البريد الإلكتروني وكلمة المرور.')
    expect(api.fetch.mock.calls.some(([p]) => p === '/api/auth/login')).toBe(false)
  })

  it('says plainly when the password is wrong', async () => {
    show(fakeApi())
    await signIn('wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent('البريد أو كلمة المرور غير صحيحة.')
  })

  it('says how long to wait after too many attempts', async () => {
    show(fakeApi())
    await signIn('too-many')
    expect(await screen.findByRole('alert')).toHaveTextContent('حاول بعد 2 دقيقة')
  })

  it('refuses a citizen account and does not keep its session', async () => {
    const api = fakeApi({ role: 'user' })
    show(api)
    await signIn()
    expect(await screen.findByRole('alert')).toHaveTextContent('هذا الحساب ليس حساب مشرف')
    expect(api.state.loggedOut).toBe(1)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('opens the panel for an admin, then signs out', async () => {
    const api = fakeApi()
    show(api)
    const user = await signIn()
    const nav = await screen.findByRole('navigation', { name: 'قائمة الإدارة' })
    expect(within(nav).getByText('سالم')).toBeInTheDocument()
    expect(within(nav).getByText('مشرف')).toBeInTheDocument()
    expect(await screen.findByText('1,240')).toBeInTheDocument()
    await user.click(within(nav).getByRole('button', { name: 'تسجيل الخروج' }))
    expect(await screen.findByRole('heading', { name: 'دخول المشرفين' })).toBeInTheDocument()
    expect(api.state.loggedOut).toBe(1)
  })
})

describe('panel', () => {
  it('shows the dashboard numbers with Western digits', async () => {
    show(fakeApi({ signedIn: true, role: 'super_admin' }))
    const numbers = await screen.findByRole('region', { name: 'الأرقام الرئيسية' })
    expect(within(numbers).getByText('1,240')).toBeInTheDocument()
    expect(within(numbers).getByText('440')).toBeInTheDocument()
    expect(within(numbers).getByText('800')).toBeInTheDocument()
    expect(screen.getByText('مشرف عام')).toBeInTheDocument()
  })

  it('marks the current page in the menu and moves between pages', async () => {
    show(fakeApi({ signedIn: true }))
    const nav = await screen.findByRole('navigation', { name: 'قائمة الإدارة' })
    expect(within(nav).getByRole('link', { name: 'لوحة المتابعة' })).toHaveAttribute('aria-current', 'page')
    await userEvent.setup().click(within(nav).getByRole('link', { name: 'مراجعة التبرعات' }))
    expect(await screen.findByRole('heading', { name: 'مراجعة التبرعات', level: 1 })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'مراجعة التبرعات' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'لوحة المتابعة' })).not.toHaveAttribute('aria-current')
  })

  it('switches to English, left to right, and remembers it', async () => {
    show(fakeApi({ signedIn: true }))
    await userEvent.setup().click(await screen.findByRole('button', { name: 'تغيير اللغة إلى الإنجليزية' }))
    expect(await screen.findByRole('navigation', { name: 'Admin menu' })).toBeInTheDocument()
    expect(document.documentElement.dir).toBe('ltr')
    expect(localStorage.getItem('hufra.admin.locale')).toBe('en')
  })

  it('has a skip link to the content', async () => {
    show(fakeApi({ signedIn: true }), '/admin/', 'en')
    expect(await screen.findByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
  })

  it('opens the menu on a phone with a labelled button', async () => {
    show(fakeApi({ signedIn: true }), '/admin/', 'en')
    const button = await screen.findByRole('button', { name: 'Menu' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.setup().click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('explains an unknown address', async () => {
    show(fakeApi({ signedIn: true }), '/admin/nope', 'en')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('offers to try again when the numbers cannot load', async () => {
    const api = fakeApi({ signedIn: true })
    const base = api.fetch.getMockImplementation()!
    api.fetch.mockImplementation(async (input, init) =>
      String(input) === '/api/potholes/counters' ? new Response('{"error":"x"}', { status: 404 }) : base(input, init),
    )
    show(api, '/admin/', 'en')
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('retries', () => {
  it('retry only what can fix itself', () => {
    expect(shouldRetry(0, new ApiError('network', 'x'))).toBe(true)
    expect(shouldRetry(0, new ApiError('http', 'x', 503))).toBe(true)
    expect(shouldRetry(0, new ApiError('http', 'x', 404))).toBe(false)
    expect(shouldRetry(0, new ApiError('unauthorized', 'x', 401))).toBe(false)
    expect(shouldRetry(2, new ApiError('network', 'x'))).toBe(false)
    expect(shouldRetry(0, new Error('x'))).toBe(false)
  })
})

describe('components', () => {
  it('ties field errors to their input', async () => {
    const { TextField } = await import('./components/ui')
    render(<TextField label="Email" error="Required" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Required')
  })

  it('shows status with words, not colour alone', async () => {
    const { StatusBadge } = await import('./components/ui')
    render(<StatusBadge status="under_repair" label="قيد الإصلاح" />)
    expect(screen.getByText('قيد الإصلاح')).toBeInTheDocument()
  })
})

