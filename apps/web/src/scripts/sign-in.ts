import type { AuthMessages, Locale } from '../i18n/i18n'
import { href } from '../i18n/i18n'
import { fill } from './api'
import { call, currentUser, errorText, safeNext } from './session'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Sign-in and sign-up forms: the session is set as cookies, then back to ?next= (My donations by default). */
export async function startAuth() {
  const raw = document.getElementById('i18n')?.textContent
  const form = document.querySelector<HTMLFormElement>('[data-auth-form]')
  if (!raw || !form) return
  const { locale, mode, m, min } = JSON.parse(raw) as { locale: Locale; mode: 'in' | 'up'; m: AuthMessages; min: number }
  const params = new URLSearchParams(location.search)
  const next = safeNext(params.get('next') ?? params.get('redirect')) ?? href(locale, '/donations')
  const go = () => location.assign(next)

  // Keep ?next= when switching between sign-in and sign-up.
  const other = document.querySelector<HTMLAnchorElement>('[data-other]')
  if (other && params.has('next')) other.href += `?next=${encodeURIComponent(next)}`

  const error = form.querySelector<HTMLElement>('[data-error]')!
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null
  const fail = (text: string, focus?: HTMLInputElement | null) => {
    error.textContent = text
    error.hidden = false
    focus?.focus()
  }

  let registered = false
  // Attached first: the form must never be sent the browser's own way (that would put the password in the address).
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    error.hidden = true
    const email = field('email')!
    const password = field('password')!
    const consent = field('consent')
    if (!EMAIL.test(email.value.trim())) return fail(m['auth.needEmail'], email)
    if (!password.value) return fail(m['auth.needPassword'], password)
    if (mode === 'up' && password.value.length < min) return fail(fill(m['auth.shortPassword'], { n: min }), password)
    if (mode === 'up' && !consent?.checked) return fail(m['auth.needConsent'], consent)

    submit.disabled = true
    const credentials = { email: email.value.trim(), password: password.value }
    try {
      if (mode === 'up' && !registered) {
        const name = field('display_name')?.value.trim()
        await call('/api/auth/register', { method: 'POST', body: { ...credentials, display_name: name || undefined, locale, consent: true } })
        registered = true
      }
      await call('/api/auth/login', { method: 'POST', body: credentials })
      go()
    } catch (err) {
      submit.disabled = false
      fail(errorText(locale, err, m['auth.failed']))
    }
  })

  // Already signed in (for example through the app): carry on.
  if (await currentUser().catch(() => null)) go()
}
