import type { AdminAccount, AdminRegion } from '@hufra/contracts'
import { useId, useState, type FormEvent, type ReactNode } from 'react'

import { ApiError } from '@/api/client'
import { useSession } from '@/auth/session'
import { Alert, Button, Card, ScrollArea, Spinner } from '@/components/ui'
import { useI18n, type Locale } from '@/i18n/i18n'
import { age, dateTime, pick } from '@/lib/format'

import {
  useAdminRegions,
  useAdmins,
  useDeleteRegion,
  useDemote,
  usePromote,
  useRecordCash,
  useSaveRegion,
  useTopDonors,
  useUpdateAdmin,
} from './use-people'

const input = 'min-h-11 w-full rounded-[10px] border border-strong bg-surface px-3 text-[15px]'
const outline = 'min-h-10 rounded-[10px] border-[1.5px] border-brand bg-surface px-3 text-sm font-semibold text-brand'

function errorText(e: unknown, locale: Locale, fallback: string) {
  if (!e) return null
  return e instanceof ApiError ? (locale === 'ar' && e.messageAr) || e.message : fallback
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

export function PeoplePage() {
  const { t } = useI18n()
  const session = useSession()
  const superAdmin = session.data?.role === 'super_admin'
  const [adding, setAdding] = useState(false)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-[28px] font-bold">{superAdmin ? t('ppl.title') : t('ppl.titleDonors')}</h1>
        {superAdmin ? (
          <Button onClick={() => setAdding(true)} aria-expanded={adding}>
            {t('ppl.add')}
          </Button>
        ) : null}
      </div>
      {superAdmin ? <AdminsSection adding={adding} onAdded={() => setAdding(false)} /> : null}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <DonorsSection />
        <RegionsSection />
      </div>
    </div>
  )
}

export function RegionsPage() {
  const { t } = useI18n()
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-bold">{t('rg.title')}</h1>
        <p className="m-0 text-sm text-secondary">{t('rg.lead')}</p>
      </div>
      <RegionsSection />
    </div>
  )
}

// ---------------------------------------------------------------- admins

function AdminsSection({ adding, onAdded }: { adding: boolean; onAdded: () => void }) {
  const { t, locale } = useI18n()
  const admins = useAdmins(true)
  const session = useSession()
  const [editing, setEditing] = useState<number | null>(null)
  const titleId = useId()
  const current = admins.data?.find((a) => a.id === editing) ?? null
  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-lg border border-default bg-surface">
      <h2 id={titleId} className="m-0 px-[18px] pt-4 pb-1.5 text-[17px] font-semibold">
        {t('ppl.admins')} <span className="text-[13px] font-normal text-secondary">· {t('ppl.adminsHint')}</span>
      </h2>
      {adding ? <AddAdmin onDone={onAdded} /> : null}
      {admins.isPending ? <Spinner label={t('loading')} /> : null}
      {admins.isError ? <Alert>{t('error.server')}</Alert> : null}
      {admins.data ? (
        <ScrollArea labelledBy={titleId}>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-start text-secondary">
                <th scope="col" className="px-[18px] py-3 text-start font-semibold">{t('ppl.name')}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t('ppl.role')}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t('ppl.regions')}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t('ppl.lastLogin')}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t('ppl.status')}</th>
                <th scope="col" className="p-3">
                  <span className="sr-only">{t('ppl.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {admins.data.map((a) => (
                <tr key={a.id} className={`border-t border-subtle ${editing === a.id ? 'bg-brand-tint' : ''}`}>
                  <td className="px-[18px] py-3">
                    <span className="flex flex-col">
                      <span className="font-semibold">{a.display_name || a.code}</span>
                      <span dir="ltr" className="self-start text-[13px] text-secondary">
                        {a.email}
                      </span>
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.role === 'super_admin' ? 'bg-brand text-white' : 'bg-brand-tint text-brand'}`}>{t(`role.${a.role}`)}</span>
                  </td>
                  <td className="p-3">
                    {a.role === 'super_admin' ? t('ppl.allRegions') : a.regions.length ? a.regions.map((r) => pick(locale, r.name_ar, r.name_en)).join(locale === 'ar' ? '، ' : ', ') : <span className="font-semibold text-danger">{t('ppl.noRegions')}</span>}
                  </td>
                  <td className="p-3">{a.last_login_at ? <time dateTime={a.last_login_at} title={dateTime(a.last_login_at, locale)}>{age(a.last_login_at, t)}</time> : t('ppl.never')}</td>
                  <td className={`p-3 font-semibold ${a.suspended ? 'text-secondary' : 'text-success'}`}>{a.suspended ? t('ppl.suspended') : t('ppl.active')}</td>
                  <td className="p-3">
                    {a.id === session.data?.id ? (
                      <span className="text-[13px] text-secondary">{t('ppl.you')}</span>
                    ) : (
                      <button type="button" className="font-semibold text-link" aria-label={t('ppl.editOne', { name: a.display_name || a.email })} onClick={() => setEditing(editing === a.id ? null : a.id)}>
                        {t('ppl.edit')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      ) : null}
      {current ? <EditAdmin key={current.id} admin={current} onClose={() => setEditing(null)} /> : null}
    </section>
  )
}

function RegionChecks({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const { t, locale } = useI18n()
  const regions = useAdminRegions()
  return (
    <fieldset className="m-0 flex flex-col gap-1 rounded-md border border-default p-3">
      <legend className="px-1.5 text-sm font-semibold">{t('ppl.regions')}</legend>
      {regions.isPending ? <Spinner label={t('loading')} /> : null}
      <div className="grid gap-x-4 sm:grid-cols-2">
        {regions.data?.map((r) => (
          <label key={r.id} className="flex min-h-10 items-center gap-2.5 text-[15px]">
            <input type="checkbox" className="size-5" checked={value.includes(r.id)} onChange={(e) => onChange(e.target.checked ? [...value, r.id] : value.filter((v) => v !== r.id))} />
            {pick(locale, r.name_ar, r.name_en)}
            {!r.active ? <span className="text-xs text-secondary">({t('rg.inactive')})</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function RoleSelect({ value, onChange }: { value: 'admin' | 'super_admin'; onChange: (v: 'admin' | 'super_admin') => void }) {
  const { t } = useI18n()
  return (
    <Field label={t('ppl.role')}>
      {(id) => (
        <select id={id} className={input} value={value} onChange={(e) => onChange(e.target.value as 'admin' | 'super_admin')}>
          <option value="admin">{t('role.admin')}</option>
          <option value="super_admin">{t('role.super_admin')}</option>
        </select>
      )}
    </Field>
  )
}

function AddAdmin({ onDone }: { onDone: () => void }) {
  const { t, locale } = useI18n()
  const promote = usePromote()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'super_admin'>('admin')
  const [regions, setRegions] = useState<number[]>([])
  const [problem, setProblem] = useState(false)
  const titleId = useId()
  function submit(e: FormEvent) {
    e.preventDefault()
    const ok = /^\S+@\S+\.\S+$/.test(email.trim())
    setProblem(!ok)
    if (ok) promote.mutate({ email: email.trim().toLowerCase(), role, region_ids: role === 'admin' ? regions : [] }, { onSuccess: onDone })
  }
  return (
    <form onSubmit={submit} noValidate aria-labelledby={titleId} className="mx-[18px] my-3 flex flex-col gap-3 rounded-lg border border-default bg-canvas p-4">
      <h3 id={titleId} className="m-0 text-[15px] font-semibold">
        {t('ppl.addTitle')}
      </h3>
      <p className="m-0 text-[13px] text-secondary">{t('ppl.addHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('login.email')}>{(id) => <input id={id} type="email" dir="ltr" autoComplete="off" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <RoleSelect value={role} onChange={setRole} />
      </div>
      {role === 'admin' ? <RegionChecks value={regions} onChange={setRegions} /> : <p className="m-0 text-[13px] text-secondary">{t('ppl.superHint')}</p>}
      {problem ? <Alert>{t('ppl.badEmail')}</Alert> : null}
      {promote.error ? <Alert>{errorText(promote.error, locale, t('error.server'))}</Alert> : null}
      <span className="flex gap-2">
        <Button type="submit" variant="brand" disabled={promote.isPending}>
          {promote.isPending ? t('set.saving') : t('ppl.addSubmit')}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </span>
    </form>
  )
}

function EditAdmin({ admin, onClose }: { admin: AdminAccount; onClose: () => void }) {
  const { t, locale } = useI18n()
  const update = useUpdateAdmin()
  const demote = useDemote()
  const [role, setRole] = useState(admin.role)
  const [regions, setRegions] = useState(admin.regions.map((r) => r.id))
  const [asking, setAsking] = useState(false)
  const titleId = useId()
  const name = admin.display_name || admin.email
  const save = (input: Parameters<typeof update.mutate>[0]['input']) => update.mutate({ id: admin.id, input })
  return (
    <div role="region" aria-labelledby={titleId} className="flex flex-col gap-3 border-t border-default bg-canvas p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="m-0 text-[17px] font-semibold">
          {t('ppl.editTitle', { name })}
        </h3>
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <RoleSelect value={role} onChange={setRole} />
      </div>
      {role === 'admin' ? <RegionChecks value={regions} onChange={setRegions} /> : <p className="m-0 text-[13px] text-secondary">{t('ppl.superHint')}</p>}
      {update.error ? <Alert>{errorText(update.error, locale, t('error.server'))}</Alert> : null}
      <div aria-live="polite">{update.isSuccess && !update.isPending ? <Alert tone="success">{t('set.saved')}</Alert> : null}</div>
      <div className="flex flex-wrap gap-2">
        <Button variant="brand" disabled={update.isPending} onClick={() => save({ role, region_ids: role === 'admin' ? regions : [] })}>
          {update.isPending ? t('set.saving') : t('set.save')}
        </Button>
        <Button variant="secondary" disabled={update.isPending} onClick={() => save({ suspended: !admin.suspended })}>
          {admin.suspended ? t('ppl.reinstate') : t('ppl.suspend')}
        </Button>
        <Button variant="ghost" className="text-danger!" onClick={() => setAsking(true)}>
          {t('ppl.remove')}
        </Button>
      </div>
      <p className="m-0 text-[13px] text-secondary">{t('ppl.suspendHint')}</p>
      {asking ? (
        <div role="alertdialog" aria-label={t('ppl.remove')} className="flex flex-col gap-3 rounded-lg border border-danger bg-danger-bg p-4">
          <p className="m-0 font-semibold text-danger">{t('ppl.removeConfirm', { name })}</p>
          {demote.error ? <Alert>{errorText(demote.error, locale, t('error.server'))}</Alert> : null}
          <span className="flex gap-2">
            <Button autoFocus disabled={demote.isPending} onClick={() => demote.mutate(admin.email, { onSuccess: onClose })}>
              {t('common.confirm')}
            </Button>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              {t('common.cancel')}
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- donors

function DonorsSection() {
  const { t, number } = useI18n()
  const donors = useTopDonors()
  const [recording, setRecording] = useState(false)
  const titleId = useId()
  return (
    <Card aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2.5">
        <h2 id={titleId} className="m-0 text-[17px] font-semibold">
          {t('ppl.donors')}
        </h2>
        <button type="button" className={outline} aria-expanded={recording} onClick={() => setRecording(true)}>
          {t('ppl.recordCash')}
        </button>
      </div>
      <p className="m-0 text-[13px] text-secondary">{t('ppl.donorsHint')}</p>
      {recording ? <CashForm onDone={() => setRecording(false)} /> : null}
      {donors.isPending ? <Spinner label={t('loading')} /> : null}
      {donors.isError ? <Alert>{t('error.server')}</Alert> : null}
      {donors.data?.length === 0 ? <p className="m-0 text-secondary">{t('ppl.noDonors')}</p> : null}
      <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
        {donors.data?.map((d, i) => (
          <li key={i} className="flex justify-between gap-3 rounded-[10px] bg-canvas px-3 py-2.5">
            <span>
              {number(i + 1)} · {d.name ?? t('ppl.anonymous')} {d.cash ? <span className="text-xs text-secondary">({t('ppl.cash')})</span> : null}
              {d.donations > 1 ? <span className="text-xs text-secondary"> · {t('ppl.times', { n: number(d.donations) })}</span> : null}
            </span>
            <span className="font-bold whitespace-nowrap">
              {number(d.amount_millimes / 1000)} {t('money.lyd')}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function CashForm({ onDone }: { onDone: () => void }) {
  const { t, locale } = useI18n()
  const record = useRecordCash()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState(false)
  function submit(e: FormEvent) {
    e.preventDefault()
    const lyd = Number(amount.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(',', '.'))
    const ok = !!name.trim() && Number.isFinite(lyd) && lyd > 0 && Math.round(lyd * 1000) === lyd * 1000
    setProblem(!ok)
    if (ok) record.mutate({ name: name.trim(), amount_lyd: lyd, ...(note.trim() ? { note: note.trim() } : {}) }, { onSuccess: onDone })
  }
  return (
    <form onSubmit={submit} noValidate aria-label={t('ppl.recordCash')} className="flex flex-col gap-3 rounded-lg border border-default bg-canvas p-3.5">
      <p className="m-0 text-[13px] text-secondary">{t('ppl.cashHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('ppl.cashName')}>{(id) => <input id={id} className={input} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('ppl.cashAmount')}>{(id) => <input id={id} inputMode="decimal" dir="ltr" className={input} value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
      </div>
      <Field label={t('ppl.cashNote')}>{(id) => <input id={id} className={input} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      {problem ? <Alert>{t('ppl.cashInvalid')}</Alert> : null}
      {record.error ? <Alert>{errorText(record.error, locale, t('error.server'))}</Alert> : null}
      <span className="flex gap-2">
        <Button type="submit" variant="brand" disabled={record.isPending}>
          {record.isPending ? t('set.saving') : t('set.save')}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </span>
    </form>
  )
}

// ---------------------------------------------------------------- regions

export function RegionsSection() {
  const { t, locale, number } = useI18n()
  const regions = useAdminRegions()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const titleId = useId()
  const current = editing === 'new' ? null : (regions.data?.find((r) => r.id === editing) ?? null)
  return (
    <Card aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2.5">
        <h2 id={titleId} className="m-0 text-[17px] font-semibold">
          {t('rg.title')}
        </h2>
        <button type="button" className={outline} onClick={() => setEditing('new')}>
          {t('rg.add')}
        </button>
      </div>
      {editing === 'new' ? <RegionForm key="new" region={null} onDone={() => setEditing(null)} /> : null}
      {regions.isPending ? <Spinner label={t('loading')} /> : null}
      {regions.isError ? <Alert>{t('error.server')}</Alert> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px]">
        {regions.data?.map((r) => (
          <li key={r.id} className="flex flex-col rounded-[10px] bg-canvas">
            <button type="button" aria-expanded={editing === r.id} onClick={() => setEditing(editing === r.id ? null : r.id)} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-start">
              <span>
                {pick(locale, r.name_ar, r.name_en)}{' '}
                <span lang={locale === 'ar' ? 'en' : 'ar'} className="text-[13px] text-secondary">
                  {locale === 'ar' ? r.name_en : r.name_ar}
                </span>
                {!r.active ? <span className="ms-2 rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-secondary">{t('rg.inactive')}</span> : null}
              </span>
              <span className={`text-[13px] ${r.admin_count === 0 && r.active ? 'font-semibold text-danger' : 'text-secondary'}`}>
                {t('rg.open', { n: number(r.open_reports) })} · {r.admin_count === 0 ? t('rg.noAdmin') : t('rg.admins', { n: number(r.admin_count) })}
              </span>
            </button>
            {editing === r.id && current ? <RegionForm key={r.id} region={current} onDone={() => setEditing(null)} /> : null}
          </li>
        ))}
      </ul>
    </Card>
  )
}

const TRIPOLI = { lat: 32.8872, lng: 13.1913 }
const slugOf = (en: string) =>
  en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function RegionForm({ region, onDone }: { region: AdminRegion | null; onDone: () => void }) {
  const { t, locale } = useI18n()
  const save = useSaveRegion()
  const del = useDeleteRegion()
  const [v, setV] = useState({
    name_ar: region?.name_ar ?? '',
    name_en: region?.name_en ?? '',
    lat: String(region?.center_lat ?? TRIPOLI.lat),
    lng: String(region?.center_lng ?? TRIPOLI.lng),
    active: region ? region.active === 1 : true,
  })
  const [problem, setProblem] = useState(false)
  const set = (c: Partial<typeof v>) => setV((o) => ({ ...o, ...c }))
  function submit(e: FormEvent) {
    e.preventDefault()
    const lat = Number(v.lat)
    const lng = Number(v.lng)
    const slug = region?.slug ?? slugOf(v.name_en)
    const ok = !!v.name_ar.trim() && !!v.name_en.trim() && !!slug && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && v.lat !== '' && v.lng !== ''
    setProblem(!ok)
    if (ok) save.mutate({ id: region?.id ?? null, input: { slug, name_ar: v.name_ar.trim(), name_en: v.name_en.trim(), center_lat: lat, center_lng: lng, active: v.active } }, { onSuccess: onDone })
  }
  return (
    <form onSubmit={submit} noValidate aria-label={region ? t('rg.editTitle') : t('rg.newTitle')} className="flex flex-col gap-3 border-t border-default p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('rg.nameAr')}>{(id) => <input id={id} className={input} maxLength={120} value={v.name_ar} onChange={(e) => set({ name_ar: e.target.value })} />}</Field>
        <Field label={t('rg.nameEn')}>{(id) => <input id={id} className={input} maxLength={120} lang="en" dir="ltr" value={v.name_en} onChange={(e) => set({ name_en: e.target.value })} />}</Field>
        <Field label={t('rg.lat')}>{(id) => <input id={id} inputMode="decimal" dir="ltr" className={input} value={v.lat} onChange={(e) => set({ lat: e.target.value })} />}</Field>
        <Field label={t('rg.lng')}>{(id) => <input id={id} inputMode="decimal" dir="ltr" className={input} value={v.lng} onChange={(e) => set({ lng: e.target.value })} />}</Field>
      </div>
      <p className="m-0 text-[13px] text-secondary">{t('rg.centerHint')}</p>
      <label className="flex min-h-10 items-center gap-2.5 text-[15px] font-semibold">
        <input type="checkbox" className="size-5" checked={v.active} onChange={(e) => set({ active: e.target.checked })} />
        {t('rg.activeLabel')}
      </label>
      {problem ? <Alert>{t('rg.invalid')}</Alert> : null}
      {save.error ? <Alert>{errorText(save.error, locale, t('error.server'))}</Alert> : null}
      {del.error ? <Alert>{errorText(del.error, locale, t('error.server'))}</Alert> : null}
      <span className="flex flex-wrap gap-2">
        <Button type="submit" variant="brand" disabled={save.isPending}>
          {save.isPending ? t('set.saving') : t('set.save')}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        {region && region.total_reports === 0 ? (
          <Button variant="ghost" className="text-danger!" disabled={del.isPending} onClick={() => del.mutate(region.id, { onSuccess: onDone })}>
            {t('rg.delete')}
          </Button>
        ) : null}
      </span>
      {region && region.total_reports > 0 ? <p className="m-0 text-[13px] text-secondary">{t('rg.keepHint')}</p> : null}
    </form>
  )
}
