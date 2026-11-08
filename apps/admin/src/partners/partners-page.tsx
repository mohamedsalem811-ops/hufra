import type { AdminPartner, PartnerInput } from '@hufra/contracts'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useId, useState, type FormEvent, type ReactNode } from 'react'

import { ApiError } from '@/api/client'
import { Alert, Button, Card, Spinner } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import type { MessageKey } from '@/i18n/messages'
import { dateTime, mediaUrl, pick } from '@/lib/format'

import { useDeletePartner, usePartners, useReorderPartners, useSavePartner, useUploadLogo } from './use-partners'

const KINDS = ['repair_sponsor', 'government', 'tech', 'media'] as const
const PLACES = [
  ['show_home', 'pt.place.home'],
  ['show_about', 'pt.place.about'],
  ['show_app', 'pt.place.app'],
  ['show_campaigns', 'pt.place.campaigns'],
  ['featured', 'pt.place.featured'],
] as const
const input = 'min-h-11 w-full rounded-[10px] border border-strong bg-surface px-3 text-[15px]'

const blank: PartnerInput = {
  name_ar: '', name_en: '', description_ar: '', description_en: '', website: '', kind: 'repair_sponsor', starts_on: null, ends_on: null,
  show_home: true, show_about: true, show_app: true, show_campaigns: true, featured: false, visible: true,
}

export function PartnersPage() {
  const { t } = useI18n()
  const partners = usePartners()
  const search = useSearch({ from: '/partners' })
  const navigate = useNavigate({ from: '/partners' })
  const reorder = useReorderPartners()
  const list = partners.data ?? []
  const editing: AdminPartner | 'new' | null = search.id === 'new' ? 'new' : (list.find((p) => p.id === search.id) ?? null)
  const choose = (id: number | 'new' | undefined) => void navigate({ search: { id }, replace: true })

  function move(i: number, by: -1 | 1) {
    const ids = list.map((p) => p.id)
    const j = i + by
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
    reorder.mutate(ids)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold">{t('pt.title')}</h1>
          <p className="m-0 text-sm text-secondary">{t('pt.lead')}</p>
        </div>
        <Button onClick={() => choose('new')}>{t('pt.add')}</Button>
      </div>
      {partners.isPending ? <Spinner label={t('loading')} /> : null}
      {partners.isError ? <Alert>{t('error.server')}</Alert> : null}
      {partners.data ? (
        <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section aria-label={t('pt.list')} className="overflow-hidden rounded-lg border border-default bg-surface">
            {list.length === 0 ? <p className="m-0 p-4 text-secondary">{t('pt.empty')}</p> : null}
            <ul className="m-0 list-none p-0">
              {list.map((p, i) => (
                <PartnerRow key={p.id} p={p} first={i === 0} last={i === list.length - 1} current={editing !== 'new' && editing?.id === p.id} onPick={() => choose(p.id)} onMove={(by) => move(i, by)} busy={reorder.isPending} />
              ))}
            </ul>
          </section>
          {editing ? (
            <PartnerForm key={editing === 'new' ? 'new' : editing.id} partner={editing === 'new' ? null : editing} onSaved={(id) => choose(id)} onDeleted={() => choose(undefined)} />
          ) : (
            <Card className="text-secondary">{t('pt.pick')}</Card>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Logo({ p, size, decorative }: { p: { logo_key: string | null; name_ar: string; name_en: string }; size: string; decorative?: boolean }) {
  const { t, locale } = useI18n()
  const name = pick(locale, p.name_ar, p.name_en) ?? ''
  return p.logo_key ? (
    <img src={mediaUrl(p.logo_key)} alt={decorative ? '' : t('pt.logoAlt', { name })} className={`${size} shrink-0 rounded-md border border-default bg-white object-contain p-1`} />
  ) : (
    <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-md bg-subtle text-lg font-bold text-secondary`}>
      {name.replace(/^ال/, '').slice(0, 1)}
    </span>
  )
}

function PartnerRow({ p, first, last, current, onPick, onMove, busy }: { p: AdminPartner; first: boolean; last: boolean; current: boolean; onPick: () => void; onMove: (by: -1 | 1) => void; busy: boolean }) {
  const { t, locale } = useI18n()
  const name = pick(locale, p.name_ar, p.name_en) ?? ''
  const tag = (text: string, tone: string) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{text}</span>
  return (
    <li className={`flex items-center gap-3 border-b border-subtle px-3 py-3 last:border-0 ${current ? 'border-s-4 border-s-brand bg-brand-tint' : ''}`}>
      <button type="button" onClick={onPick} aria-current={current ? 'true' : undefined} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        <Logo p={p} size="size-12" />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-semibold">{name}</span>
          <span className="flex flex-wrap gap-1">
            {p.featured ? tag(t('pt.featured'), 'bg-warning-bg text-warning') : null}
            {!p.visible ? tag(t('pt.hidden'), 'bg-subtle text-secondary') : p.live ? tag(t('pt.shown'), 'bg-success-bg text-success') : tag(t('pt.notLive'), 'bg-subtle text-secondary')}
            {p.ends_on ? tag(t('pt.until', { date: dateTime(`${p.ends_on}T00:00:00Z`, locale, false) }), 'bg-subtle text-secondary') : null}
          </span>
        </span>
      </button>
      <span className="flex flex-col gap-1">
        <button type="button" aria-label={t('pt.up', { name })} disabled={first || busy} onClick={() => onMove(-1)} className="flex size-9 items-center justify-center rounded-md bg-subtle disabled:opacity-40">
          ▲
        </button>
        <button type="button" aria-label={t('pt.down', { name })} disabled={last || busy} onClick={() => onMove(1)} className="flex size-9 items-center justify-center rounded-md bg-subtle disabled:opacity-40">
          ▼
        </button>
      </span>
    </li>
  )
}

function Field({ label, children }: { label: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

function PartnerForm({ partner, onSaved, onDeleted }: { partner: AdminPartner | null; onSaved: (id: number) => void; onDeleted: () => void }) {
  const { t, locale, number } = useI18n()
  const save = useSavePartner()
  const del = useDeletePartner()
  const logo = useUploadLogo()
  const [v, setV] = useState<PartnerInput>(() => (partner ? { ...blank, ...Object.fromEntries(Object.keys(blank).map((k) => [k, partner[k as keyof AdminPartner]])) } : blank))
  const [problem, setProblem] = useState(false)
  const [asking, setAsking] = useState(false)
  const titleId = useId()
  const set = (change: Partial<PartnerInput>) => setV((old) => ({ ...old, ...change }))
  const name = pick(locale, v.name_ar, v.name_en) ?? ''

  function submit(e: FormEvent) {
    e.preventDefault()
    const ok = !!v.name_ar.trim() && !!v.name_en.trim() && (!v.website || /^https:\/\/\S+\.\S+/.test(v.website.trim())) && (!v.starts_on || !v.ends_on || v.starts_on <= v.ends_on)
    setProblem(!ok)
    if (ok) save.mutate({ id: partner?.id ?? null, input: { ...v, website: v.website.trim() } }, { onSuccess: (res) => onSaved(res.partner.id) })
  }

  const serverError = save.error instanceof ApiError ? (locale === 'ar' && save.error.messageAr) || save.error.message : save.error ? t('error.server') : null
  const logoError = logo.error ? (logo.error instanceof ApiError ? (locale === 'ar' && logo.error.messageAr) || logo.error.message : t('pt.logoBad')) : null

  return (
    <Card aria-labelledby={titleId}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={titleId} className="m-0 text-[20px] font-bold">
            {partner ? t('pt.editTitle') : t('pt.newTitle')}
          </h2>
          {partner ? (
            <Button variant="ghost" className="text-danger!" onClick={() => setAsking(true)}>
              {t('pt.delete')}
            </Button>
          ) : null}
        </div>
        {asking && partner ? (
          <div role="alertdialog" aria-label={t('pt.delete')} className="flex flex-col gap-3 rounded-lg border border-danger bg-danger-bg p-4">
            <p className="m-0 font-semibold text-danger">{t('pt.deleteConfirm', { name })}</p>
            <span className="flex gap-2">
              <Button autoFocus disabled={del.isPending} onClick={() => del.mutate(partner.id, { onSuccess: onDeleted })}>
                {t('common.confirm')}
              </Button>
              <Button variant="secondary" onClick={() => setAsking(false)}>
                {t('common.cancel')}
              </Button>
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-4 rounded-md bg-canvas p-3">
          {partner ? <Logo p={partner} size="size-20" /> : <span aria-hidden="true" className="size-20 rounded-md bg-subtle" />}
          <span className="flex flex-1 flex-col gap-1.5">
            {partner ? (
              <label className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-[10px] border-[1.5px] border-brand px-4 font-semibold text-brand focus-within:outline-3 focus-within:outline-focus">
                {partner.logo_key ? t('pt.logoReplace') : t('pt.logoAdd')}
                <input
                  type="file"
                  accept="image/svg+xml,image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={logo.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) logo.mutate({ id: partner.id, file })
                  }}
                />
              </label>
            ) : null}
            <span className="text-[13px] text-secondary">{partner ? t('pt.logoHint') : t('pt.logoAfterSave')}</span>
            <span aria-live="polite">{logo.isPending ? t('report.uploading') : logo.isSuccess ? t('report.uploaded') : ''}</span>
            {logoError ? <Alert>{logoError}</Alert> : null}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('pt.nameAr')}>{(id) => <input id={id} className={input} maxLength={120} value={v.name_ar} onChange={(e) => set({ name_ar: e.target.value })} />}</Field>
          <Field label={t('pt.nameEn')}>{(id) => <input id={id} className={input} maxLength={120} lang="en" dir="ltr" value={v.name_en} onChange={(e) => set({ name_en: e.target.value })} />}</Field>
          <Field label={<>{t('pt.descAr')} <span className="font-normal text-secondary">{t('pt.descHint')}</span></>}>
            {(id) => <textarea id={id} rows={2} maxLength={160} className="rounded-[10px] border border-strong bg-surface p-3" value={v.description_ar} onChange={(e) => set({ description_ar: e.target.value })} />}
          </Field>
          <Field label={t('pt.descEn')}>
            {(id) => <textarea id={id} rows={2} maxLength={160} lang="en" dir="ltr" className="rounded-[10px] border border-strong bg-surface p-3" value={v.description_en} onChange={(e) => set({ description_en: e.target.value })} />}
          </Field>
          <Field label={t('pt.website')}>{(id) => <input id={id} type="url" dir="ltr" placeholder="https://" className={input} value={v.website} onChange={(e) => set({ website: e.target.value })} />}</Field>
          <Field label={t('pt.kind')}>
            {(id) => (
              <select id={id} className={input} value={v.kind} onChange={(e) => set({ kind: e.target.value as PartnerInput['kind'] })}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`pt.kind.${k}` as MessageKey)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('pt.from')}>{(id) => <input id={id} type="date" className={input} value={v.starts_on ?? ''} onChange={(e) => set({ starts_on: e.target.value || null })} />}</Field>
          <Field label={<>{t('pt.to')} <span className="font-normal text-secondary">{t('pt.toHint')}</span></>}>
            {(id) => <input id={id} type="date" className={input} value={v.ends_on ?? ''} onChange={(e) => set({ ends_on: e.target.value || null })} />}
          </Field>
        </div>

        <fieldset className="m-0 flex flex-col gap-1 rounded-md border border-default p-3.5">
          <legend className="px-1.5 text-[15px] font-semibold">{t('pt.where')}</legend>
          {PLACES.map(([k, label]) => (
            <label key={k} className="flex min-h-10 items-center gap-2.5 text-[15px]">
              <input type="checkbox" className="size-5" checked={v[k]} onChange={(e) => set({ [k]: e.target.checked })} />
              {t(label)}
            </label>
          ))}
        </fieldset>

        {problem ? <Alert>{t('pt.invalid')}</Alert> : null}
        {serverError ? <Alert>{serverError}</Alert> : null}
        <div aria-live="polite">{save.isSuccess && !save.isPending ? <Alert tone="success">{t('set.saved')}</Alert> : null}</div>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="brand" disabled={save.isPending}>
            {save.isPending ? t('set.saving') : t('set.save')}
          </Button>
          <label className="flex min-h-11 items-center gap-2.5 font-semibold">
            <input type="checkbox" className="size-5" checked={v.visible} onChange={(e) => set({ visible: e.target.checked })} />
            {t('pt.visible')}
          </label>
        </div>

        <section aria-label={t('pt.preview')} className="flex flex-col gap-2 border-t border-default pt-4">
          <h3 className="m-0 text-[15px] font-semibold text-secondary">{t('pt.preview')}</h3>
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-default p-4">
            {partner ? <Logo p={{ ...partner, name_ar: v.name_ar, name_en: v.name_en }} size="size-20" decorative /> : <span className="size-20 rounded-md bg-subtle" />}
            <span className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className="text-[13px] font-semibold text-link">{t(`pt.kind.${v.kind}` as MessageKey)}</span>
              <span className="text-lg font-bold">{name || '—'}</span>
              <span className="text-sm text-secondary">{pick(locale, v.description_ar, v.description_en) ?? ''}</span>
              <span className="text-sm font-semibold">{t('pt.funded', { n: number(partner?.funded_count ?? 0), lyd: number(partner?.funded_lyd ?? 0) })}</span>
              {v.website ? <span className="text-sm font-semibold text-link">{t('pt.visit')}</span> : null}
            </span>
          </div>
          <span className="text-[13px] text-secondary">{t('pt.fundedHint')}</span>
        </section>
      </form>
    </Card>
  )
}
