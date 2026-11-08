import { donationSettingsResponseSchema, isValidLibyanIban, type AuditLogEntry } from '@hufra/contracts'
import type { z } from 'zod'
import { useId, useState, type FormEvent, type ReactNode } from 'react'

import { ApiError } from '@/api/client'
import { useSession } from '@/auth/session'
import { Alert, Button, Card, ScrollArea, Spinner, TextField } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import type { MessageKey } from '@/i18n/messages'
import { dateTime } from '@/lib/format'

import { useAppVersions, useAuditLog, useContact, useLegal, usePayout, useRules } from './use-settings'

const input = 'min-h-11 rounded-[10px] border border-strong bg-surface px-3 text-[15px] disabled:bg-subtle disabled:text-secondary'

function useErrorText(error: unknown, fallback?: string): string | null {
  const { t, locale } = useI18n()
  if (!error) return null
  if (error instanceof ApiError && error.status === 400 && fallback) return fallback
  return error instanceof ApiError ? (locale === 'ar' && error.messageAr) || error.message : t('error.server')
}

export function SettingsPage() {
  const { t } = useI18n()
  const session = useSession()
  const superAdmin = session.data?.role === 'super_admin'
  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 text-[28px] font-bold">{t('set.title')}</h1>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <PayoutForm canEdit={superAdmin} />
        <div className="flex flex-col gap-4">
          <RulesForm canEdit={superAdmin} />
          <ContactForm />
        </div>
        <LegalForm canEdit={superAdmin} />
        <AppVersionsForm canEdit={superAdmin} />
      </div>
      {superAdmin ? <AuditLog /> : null}
    </div>
  )
}

function Section({ title, superOnly, lead, children, onSubmit }: { title: string; superOnly?: boolean; lead?: ReactNode; children: ReactNode; onSubmit: (e: FormEvent) => void }) {
  const { t } = useI18n()
  const id = useId()
  return (
    <Card aria-labelledby={id}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={id} className="m-0 text-[17px] font-semibold">
            {title}
          </h2>
          {superOnly ? <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-semibold text-secondary">{t('set.superOnly')}</span> : null}
        </div>
        {lead ? <div className="text-sm leading-6 text-secondary">{lead}</div> : null}
        {children}
      </form>
    </Card>
  )
}

function Field({ label, hint, children }: { label: ReactNode; hint?: string; children: (ids: { id: string; describedBy?: string }) => ReactNode }) {
  const id = useId()
  const hintId = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children({ id, describedBy: hint ? hintId : undefined })}
      {hint ? (
        <span id={hintId} className="text-[13px] text-secondary">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

function NumberField({ label, unit, value, onChange, disabled, hint }: { label: string; unit: string; value: string; onChange: (v: string) => void; disabled?: boolean; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <span className="flex items-center gap-2">
          <input id={id} inputMode="numeric" dir="ltr" value={value} disabled={disabled} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)} className={`${input} w-28`} />
          <span className="text-sm text-secondary">{unit}</span>
        </span>
      )}
    </Field>
  )
}

function Footer({ canEdit, pending, success, error, label, note }: { canEdit: boolean; pending: boolean; success: boolean; error: string | null; label: string; note?: string }) {
  const { t } = useI18n()
  if (!canEdit) return <p className="m-0 text-sm text-secondary">{t('set.readOnly')}</p>
  return (
    <>
      {error ? <Alert>{error}</Alert> : null}
      <div aria-live="polite">{success && !pending ? <Alert tone="success">{t('set.saved')}</Alert> : null}</div>
      <Button type="submit" variant="brand" disabled={pending} className="self-start">
        {pending ? t('set.saving') : label}
      </Button>
      {note ? <p className="m-0 text-[13px] leading-6 text-secondary">{note}</p> : null}
    </>
  )
}

const int = (s: string) => (/^\d{1,7}$/.test(s.trim()) ? Number(s.trim()) : NaN)

// ------------------------------------------------------------------ payout

function PayoutForm({ canEdit }: { canEdit: boolean }) {
  const { query, save } = usePayout()
  const { t } = useI18n()
  if (query.isPending) return <Card><Spinner label={t('loading')} /></Card>
  if (query.isError) return <Card><Alert>{t('error.server')}</Alert></Card>
  // Fresh fields after each save; the save state (and its message) stays here.
  return <PayoutFields key={JSON.stringify(query.data.settings)} initial={query.data.settings} canEdit={canEdit} save={save} />
}

function PayoutFields({ initial, canEdit, save }: { initial: z.infer<typeof donationSettingsResponseSchema>['settings']; canEdit: boolean; save: ReturnType<typeof usePayout>['save'] }) {
  const { t } = useI18n()
  const [v, setV] = useState({ ...initial })
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const set = (change: Partial<typeof v>) => setV((old) => ({ ...old, ...change }))
  const bankChanged = (['account_holder', 'bank_name', 'iban', 'account_number'] as const).some((k) => v[k].replace(/\s/g, '') !== initial[k].replace(/\s/g, ''))
  const ibanBad = !!v.iban.trim() && !isValidLibyanIban(v.iban.replace(/[\s-]/g, '').toUpperCase())
  const error = useErrorText(save.error)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (ibanBad) return setProblem(t('pay.ibanHint'))
    if (bankChanged && !password) return setProblem(t('pay.passwordMissing'))
    setProblem(null)
    save.mutate({ ...v, ...(bankChanged ? { current_password: password } : {}) }, { onSuccess: () => setPassword('') })
  }

  const empty = !initial.account_holder && !initial.iban && !initial.account_number
  return (
    <Section title={t('pay.title')} superOnly onSubmit={submit} lead={empty ? <span role="status">{t('pay.empty')}</span> : undefined}>
      <label className="flex min-h-11 items-center gap-2.5 font-semibold">
        <input type="checkbox" className="size-5" checked={v.enabled} disabled={!canEdit} onChange={(e) => set({ enabled: e.target.checked })} />
        {t('pay.enabled')}
      </label>
      <Field label={t('pay.holder')}>{({ id }) => <input id={id} className={input} value={v.account_holder} maxLength={120} disabled={!canEdit} onChange={(e) => set({ account_holder: e.target.value })} />}</Field>
      <Field label={t('pay.bank')}>{({ id }) => <input id={id} className={input} value={v.bank_name} maxLength={120} disabled={!canEdit} onChange={(e) => set({ bank_name: e.target.value })} />}</Field>
      <Field label={t('pay.iban')} hint={t('pay.ibanHint')}>
        {({ id, describedBy }) => (
          <input id={id} dir="ltr" className={input} value={v.iban} placeholder="LY00 0000 0000 0000 0000 0000 0" disabled={!canEdit} aria-invalid={ibanBad || undefined} aria-describedby={describedBy} onChange={(e) => set({ iban: e.target.value })} />
        )}
      </Field>
      <Field label={t('pay.account')} hint={t('pay.accountHint')}>
        {({ id, describedBy }) => <input id={id} dir="ltr" inputMode="numeric" className={input} value={v.account_number} disabled={!canEdit} aria-describedby={describedBy} onChange={(e) => set({ account_number: e.target.value })} />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['ios', 'android'] as const).map((p) => (
          <Field key={p} label={t(p === 'ios' ? 'pay.openIos' : 'pay.openAndroid')}>
            {({ id }) => (
              <select id={id} className={input} disabled={!canEdit} value={v[`open_mode_${p}`]} onChange={(e) => set({ [`open_mode_${p}`]: e.target.value as 'in_app' | 'safari' })}>
                <option value="in_app">{t('pay.inApp')}</option>
                <option value="safari">{t('pay.safari')}</option>
              </select>
            )}
          </Field>
        ))}
      </div>
      {canEdit && bankChanged ? (
        <Field label={t('pay.password')} hint={t('pay.passwordHint')}>
          {({ id, describedBy }) => <input id={id} type="password" autoComplete="current-password" className={input} value={password} aria-describedby={describedBy} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
      ) : null}
      {problem ? <Alert>{problem}</Alert> : null}
      <Footer canEdit={canEdit} pending={save.isPending} success={save.isSuccess} error={error} label={t('pay.saveDo')} note={t('pay.note')} />
    </Section>
  )
}

// ------------------------------------------------------------------- rules

function RulesForm({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n()
  const { query, save } = useRules()
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [problem, setProblem] = useState(false)
  const error = useErrorText(save.error, t('rules.invalid'))
  if (query.isPending) return <Card><Spinner label={t('loading')} /></Card>
  if (query.isError) return <Card><Alert>{t('error.server')}</Alert></Card>
  const r = query.data.rules
  const v = draft ?? { duplicate_radius_m: String(r.duplicate_radius_m), pending_hours: String(r.pending_hours), large_lyd: String(r.large_lyd) }
  const set = (k: string, val: string) => setDraft({ ...v, [k]: val })

  function submit(e: FormEvent) {
    e.preventDefault()
    const body = { duplicate_radius_m: int(v.duplicate_radius_m!), pending_hours: int(v.pending_hours!), large_lyd: int(v.large_lyd!) }
    const ok = body.duplicate_radius_m >= 10 && body.duplicate_radius_m <= 500 && body.pending_hours >= 1 && body.pending_hours <= 720 && body.large_lyd >= 1
    setProblem(!ok)
    if (ok) save.mutate(body, { onSuccess: () => setDraft(null) })
  }

  return (
    <Section title={t('rules.title')} superOnly onSubmit={submit}>
      <NumberField label={t('rules.radius')} unit={t('rules.meters')} value={v.duplicate_radius_m!} onChange={(x) => set('duplicate_radius_m', x)} disabled={!canEdit} />
      <NumberField label={t('rules.hours')} unit={t('rules.hoursUnit')} value={v.pending_hours!} onChange={(x) => set('pending_hours', x)} disabled={!canEdit} />
      <NumberField label={t('rules.large')} unit={t('rules.largeUnit')} value={v.large_lyd!} onChange={(x) => set('large_lyd', x)} disabled={!canEdit} />
      {problem ? <Alert>{t('rules.invalid')}</Alert> : null}
      <Footer canEdit={canEdit} pending={save.isPending} success={save.isSuccess} error={error} label={t('rules.saveDo')} />
    </Section>
  )
}

// ----------------------------------------------------------------- contact

function ContactForm() {
  const { t } = useI18n()
  const { query, save } = useContact()
  const [draft, setDraft] = useState<{ public_email: string; privacy_email: string; phone: string; social: string } | null>(null)
  const error = useErrorText(save.error, t('contact.invalid'))
  if (query.isPending) return <Card><Spinner label={t('loading')} /></Card>
  if (query.isError) return <Card><Alert>{t('error.server')}</Alert></Card>
  const c = query.data.contact
  const v = draft ?? { public_email: c.public_email, privacy_email: c.privacy_email, phone: c.phone, social: c.social_links.join('\n') }
  const set = (change: Partial<typeof v>) => setDraft({ ...v, ...change })

  function submit(e: FormEvent) {
    e.preventDefault()
    const social_links = v.social.split('\n').map((l) => l.trim()).filter(Boolean)
    save.mutate({ public_email: v.public_email.trim(), privacy_email: v.privacy_email.trim(), phone: v.phone.trim(), social_links }, { onSuccess: () => setDraft(null) })
  }

  return (
    <Section title={t('contact.title')} onSubmit={submit} lead={t('contact.lead')}>
      <TextField label={t('contact.public')} type="email" dir="ltr" value={v.public_email} onChange={(e) => set({ public_email: e.target.value })} />
      <TextField label={t('contact.privacy')} type="email" dir="ltr" value={v.privacy_email} onChange={(e) => set({ privacy_email: e.target.value })} />
      <TextField label={`${t('contact.phone')} ${t('camp.optional')}`} type="tel" dir="ltr" value={v.phone} onChange={(e) => set({ phone: e.target.value })} />
      <Field label={<>{t('contact.social')} <span className="font-normal text-secondary">{t('contact.socialHint')}</span></>}>
        {({ id }) => <textarea id={id} dir="ltr" rows={3} className="rounded-[10px] border border-strong bg-surface p-3" value={v.social} onChange={(e) => set({ social: e.target.value })} />}
      </Field>
      <Footer canEdit pending={save.isPending} success={save.isSuccess} error={error} label={t('contact.saveDo')} />
    </Section>
  )
}

// ------------------------------------------------------------------- legal

function LegalForm({ canEdit }: { canEdit: boolean }) {
  const { t, locale } = useI18n()
  const { query, save } = useLegal()
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [material, setMaterial] = useState(true)
  const [problem, setProblem] = useState(false)
  const error = useErrorText(save.error, t('legal.invalid'))
  if (query.isPending) return <Card><Spinner label={t('loading')} /></Card>
  if (query.isError) return <Card><Alert>{t('error.server')}</Alert></Card>
  const L = query.data
  const i = L.info
  const v = draft ?? {
    legal_name_ar: i.legal_name_ar, legal_name_en: i.legal_name_en, registration_no: i.registration_no, address: i.address, courts: i.courts,
    retention_financial_years: i.retention_financial_years === null ? '' : String(i.retention_financial_years),
    retention_screenshots_days: String(i.retention_screenshots_days), wrong_transfer_days: String(i.wrong_transfer_days), privacy_reply_days: String(i.privacy_reply_days),
  }
  const set = (k: string, val: string) => setDraft({ ...v, [k]: val })
  const text = (k: keyof typeof v, label: MessageKey, extra: { dir?: 'ltr'; lang?: string } = {}) => (
    <Field label={t(label)}>{({ id }) => <input id={id} className={input} value={v[k]} maxLength={300} disabled={!canEdit} onChange={(e) => set(k, e.target.value)} {...extra} />}</Field>
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    const years = v.retention_financial_years!.trim() === '' ? null : int(v.retention_financial_years!)
    const body = {
      legal_name_ar: v.legal_name_ar!.trim(), legal_name_en: v.legal_name_en!.trim(), registration_no: v.registration_no!.trim(), address: v.address!.trim(), courts: v.courts!.trim(),
      retention_financial_years: years, retention_screenshots_days: int(v.retention_screenshots_days!), wrong_transfer_days: int(v.wrong_transfer_days!), privacy_reply_days: int(v.privacy_reply_days!), material,
    }
    const ok = (years === null || (years >= 0 && years <= 50)) && body.retention_screenshots_days >= 1 && body.wrong_transfer_days >= 1 && body.privacy_reply_days >= 1 && body.privacy_reply_days <= 90
    setProblem(!ok)
    if (ok) save.mutate(body, { onSuccess: () => setDraft(null) })
  }

  return (
    <Section
      title={t('legal.title')}
      superOnly
      onSubmit={submit}
      lead={
        <span className="flex flex-col gap-1.5">
          <span role="status">{t('legal.lead')}</span>
          <span className="flex flex-wrap items-center gap-2 font-semibold text-primary">
            {L.version ? t('legal.version', { v: L.version, date: dateTime(L.published_at!, locale, false) }) : t('legal.none')}
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${L.complete ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}>{L.complete ? t('legal.complete') : t('legal.incomplete')}</span>
          </span>
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {text('legal_name_ar', 'legal.nameAr')}
        {text('legal_name_en', 'legal.nameEn', { dir: 'ltr', lang: 'en' })}
        {text('registration_no', 'legal.reg')}
        {text('courts', 'legal.courts')}
      </div>
      {text('address', 'legal.address')}
      <fieldset className="m-0 grid gap-3 rounded-md border border-default p-3.5 sm:grid-cols-2">
        <legend className="px-1.5 text-[15px] font-semibold">{t('legal.periods')}</legend>
        <NumberField label={t('legal.financial')} unit={t('legal.years')} hint={t('legal.financialHint')} value={v.retention_financial_years!} onChange={(x) => set('retention_financial_years', x)} disabled={!canEdit} />
        <NumberField label={t('legal.screenshots')} unit={t('legal.days')} value={v.retention_screenshots_days!} onChange={(x) => set('retention_screenshots_days', x)} disabled={!canEdit} />
        <NumberField label={t('legal.wrongTransfer')} unit={t('legal.days')} value={v.wrong_transfer_days!} onChange={(x) => set('wrong_transfer_days', x)} disabled={!canEdit} />
        <NumberField label={t('legal.privacyReply')} unit={t('legal.days')} value={v.privacy_reply_days!} onChange={(x) => set('privacy_reply_days', x)} disabled={!canEdit} />
      </fieldset>
      {canEdit ? (
        <label className="flex items-start gap-2.5 text-[15px] leading-6">
          <input type="checkbox" className="mt-1 size-5 shrink-0" checked={material} onChange={(e) => setMaterial(e.target.checked)} />
          {t('legal.material')}
        </label>
      ) : null}
      {problem ? <Alert>{t('legal.invalid')}</Alert> : null}
      <Footer canEdit={canEdit} pending={save.isPending} success={save.isSuccess} error={error} label={t('legal.publishDo')} note={t('legal.note')} />
    </Section>
  )
}

// ------------------------------------------------------------ app versions

const SEMVER = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/

function AppVersionsForm({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n()
  const { query, save } = useAppVersions()
  const [draft, setDraft] = useState<NonNullable<typeof query.data> | null>(null)
  const [problem, setProblem] = useState(false)
  const error = useErrorText(save.error, t('appv.invalid'))
  if (query.isPending) return <Card><Spinner label={t('loading')} /></Card>
  if (query.isError) return <Card><Alert>{t('error.server')}</Alert></Card>
  const v = draft ?? query.data
  const set = (p: 'ios' | 'android', k: 'latest' | 'minimum' | 'store_url', val: string) => setDraft({ ...v, [p]: { ...v[p], [k]: val } })

  function submit(e: FormEvent) {
    e.preventDefault()
    const ok = (['ios', 'android'] as const).every((p) => SEMVER.test(v[p].latest) && SEMVER.test(v[p].minimum) && (v[p].store_url === '' || /^https:\/\//.test(v[p].store_url)))
    setProblem(!ok)
    if (ok) save.mutate(v, { onSuccess: () => setDraft(null) })
  }

  return (
    <Section title={t('appv.title')} superOnly onSubmit={submit} lead={t('appv.lead')}>
      {(['android', 'ios'] as const).map((p) => (
        <fieldset key={p} className="m-0 grid gap-3 rounded-md border border-default p-3.5 sm:grid-cols-2">
          <legend className="px-1.5 text-[15px] font-semibold">{p === 'ios' ? 'iPhone' : 'Android'}</legend>
          <Field label={t('appv.latest')}>{({ id }) => <input id={id} dir="ltr" className={input} value={v[p].latest} disabled={!canEdit} onChange={(e) => set(p, 'latest', e.target.value)} />}</Field>
          <Field label={t('appv.minimum')}>{({ id }) => <input id={id} dir="ltr" className={input} value={v[p].minimum} disabled={!canEdit} onChange={(e) => set(p, 'minimum', e.target.value)} />}</Field>
          <div className="sm:col-span-2">
            <Field label={t('appv.store')}>{({ id }) => <input id={id} dir="ltr" type="url" className={`${input} w-full`} value={v[p].store_url} disabled={!canEdit} onChange={(e) => set(p, 'store_url', e.target.value)} />}</Field>
          </div>
        </fieldset>
      ))}
      {problem ? <Alert>{t('appv.invalid')}</Alert> : null}
      <Footer canEdit={canEdit} pending={save.isPending} success={save.isSuccess} error={error} label={t('appv.saveDo')} />
    </Section>
  )
}

// --------------------------------------------------------------- audit log

const FILTERS = ['', 'pothole', 'campaign', 'donation', 'settings', 'legal', 'user'] as const

/** "IBAN: LY83…0361" style summary of what changed (bank numbers masked). */
export function auditDetails(e: AuditLogEntry): string {
  const mask = (k: string, v: unknown) => (typeof v === 'string' && /iban|account_number/.test(k) && v.length > 4 ? `••••${v.slice(-4)}` : v)
  const before = (e.before && typeof e.before === 'object' ? e.before : {}) as Record<string, unknown>
  const after = (e.after && typeof e.after === 'object' ? e.after : {}) as Record<string, unknown>
  const changed = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]) && typeof after[k] !== 'object')
  const parts = changed.slice(0, 4).map((k) => (k in before ? `${k}: ${mask(k, before[k])} → ${mask(k, after[k])}` : `${k}: ${mask(k, after[k])}`))
  return [e.entity_id ? `${e.entity} #${e.entity_id}` : e.entity, ...parts].join(' · ')
}

export function toCsv(rows: AuditLogEntry[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v)
    // Quote everything; a leading = + - @ could run as a formula in a spreadsheet.
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`
  }
  const head = ['id', 'created_at', 'actor', 'action', 'entity', 'entity_id', 'before', 'after']
  return [head.join(','), ...rows.map((r) => [r.id, r.created_at, r.actor_name, r.action, r.entity, r.entity_id, r.before, r.after].map(cell).join(','))].join('\r\n')
}

function AuditLog() {
  const { t, locale } = useI18n()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('')
  const log = useAuditLog(filter)
  const id = useId()
  const filterId = useId()
  const rows = log.data?.pages.flatMap((p) => p.results) ?? []

  function exportCsv() {
    const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hufra-audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={id} className="m-0 text-[17px] font-semibold">
          {t('audit.title')}
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <span className="flex flex-col gap-1">
            <label htmlFor={filterId} className="text-sm text-secondary">
              {t('audit.filter')}
            </label>
            <select id={filterId} className={input} value={filter} onChange={(e) => setFilter(e.target.value as (typeof FILTERS)[number])}>
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f ? t(`audit.f.${f}` as MessageKey) : t('audit.all')}
                </option>
              ))}
            </select>
          </span>
          <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
            {t('audit.export')}
          </Button>
        </div>
      </div>
      {log.isPending ? <Spinner label={t('loading')} /> : null}
      {log.isError ? <Alert>{t('error.server')}</Alert> : null}
      {log.data && !rows.length ? <p className="m-0 text-secondary">{t('audit.empty')}</p> : null}
      {rows.length ? (
        <ScrollArea labelledBy={id}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-secondary">
                {(['audit.time', 'audit.actor', 'audit.action', 'audit.details'] as const).map((k) => (
                  <th key={k} scope="col" className="border-b border-default p-2.5 text-start font-semibold">
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap border-b border-subtle p-2.5">{dateTime(r.created_at, locale)}</td>
                  <td className="border-b border-subtle p-2.5">{r.actor_name ?? t('audit.system')}</td>
                  <td className="border-b border-subtle p-2.5" dir="ltr">
                    <code className="rounded bg-subtle px-1.5 py-0.5 text-[13px]">{r.action}</code>
                  </td>
                  <td className="border-b border-subtle p-2.5 [overflow-wrap:anywhere]" dir="auto">
                    {auditDetails(r)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      ) : null}
      {log.hasNextPage ? (
        <Button variant="secondary" className="self-start" disabled={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>
          {t('audit.more')}
        </Button>
      ) : null}
    </Card>
  )
}
