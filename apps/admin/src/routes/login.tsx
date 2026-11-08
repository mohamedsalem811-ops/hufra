import { useState, type FormEvent } from 'react'

import { ApiError } from '@/api/client'
import { NotStaffError, useSignIn } from '@/auth/session'
import { Alert, Button, TextField } from '@/components/ui'
import logo from '@/components/logo-on-brand.svg'
import { LanguageLabel, useI18n } from '@/i18n/i18n'

export function LoginPage() {
  const { t, locale, setLocale } = useI18n()
  const signIn = useSignIn()
  const [missing, setMissing] = useState(false)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')
    setMissing(!email || !password)
    if (email && password) signIn.mutate({ email, password })
  }

  const error = signIn.error
  let message: string | null = missing ? t('login.missing') : null
  if (!message && error) {
    if (error instanceof NotStaffError) message = t('login.notAdmin')
    else if (error instanceof ApiError && error.kind === 'unauthorized') message = t('login.failed')
    else if (error instanceof ApiError && error.status === 429) message = t('login.tooMany', { minutes: Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60)) })
    else if (error instanceof ApiError && error.kind === 'network') message = t('error.network')
    else if (error instanceof ApiError && error.messageAr && locale === 'ar') message = error.messageAr
    else message = error instanceof ApiError && error.kind === 'forbidden' ? error.message : t('error.server')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-6 rounded-xl border border-default bg-surface p-6 shadow-md md:p-8">
        <div className="-mx-6 -mt-6 flex items-center justify-between rounded-t-xl bg-brand-solid px-6 py-4 md:-mx-8 md:-mt-8 md:px-8">
          <img src={logo} alt={`${t('app.name')} HUFRA`} className="h-9" />
          <span className="text-xs font-semibold text-nav-muted">{t('app.panel')}</span>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold leading-tight">{t('login.title')}</h1>
          <p className="m-0 text-secondary">{t('login.lead')}</p>
        </div>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          {message ? <Alert>{message}</Alert> : null}
          <TextField label={t('login.email')} name="email" type="email" autoComplete="username" inputMode="email" dir="ltr" required />
          <TextField label={t('login.password')} name="password" type="password" autoComplete="current-password" dir="ltr" required />
          <Button type="submit" disabled={signIn.isPending} className="mt-2 min-h-12">
            {signIn.isPending ? t('login.busy') : t('login.submit')}
          </Button>
        </form>
      </div>
      <button type="button" className="min-h-11 text-link underline" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
        <LanguageLabel />
      </button>
    </div>
  )
}
