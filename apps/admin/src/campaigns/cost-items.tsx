import { DONATION_LIMITS } from '@hufra/contracts'
import { useId } from 'react'

import { useI18n } from '@/i18n/i18n'
import { pick } from '@/lib/format'
import { usePartners } from '@/partners/use-partners'

/** Editable lines; amounts stay as typed text until saved. */
export interface ItemDraft {
  key: number
  label: string
  amount: string
}

let nextKey = 1
export const newItem = (label = '', amount = ''): ItemDraft => ({ key: nextKey++, label, amount })

const AMOUNT = /^\d{1,8}(\.\d{1,3})?$/

/** The items as numbers, or null when one is incomplete. Blank lines are skipped. */
export function parseItems(items: ItemDraft[]): { label: string; amount_lyd: number }[] | null {
  const filled = items.filter((i) => i.label.trim() || i.amount.trim())
  const out = filled.map((i) => ({ label: i.label.trim(), amount_lyd: AMOUNT.test(i.amount.trim()) ? Number(i.amount.trim()) : NaN }))
  return out.every((i) => i.label && Number.isFinite(i.amount_lyd)) ? out : null
}

/** Sum in thousandths, so 0.1 + 0.2 stays 0.3. */
export const sumLyd = (items: { amount_lyd: number }[]) => Math.round(items.reduce((t, i) => t + Math.round(i.amount_lyd * 1000), 0)) / 1000

const input = 'min-h-11 w-full min-w-0 rounded-[10px] border border-strong bg-surface px-3 text-[15px]'

export function CostItemsEditor({ items, onChange, invalid }: { items: ItemDraft[]; onChange: (items: ItemDraft[]) => void; invalid?: boolean }) {
  const { t, number } = useI18n()
  const legend = useId()
  const parsed = parseItems(items)
  const set = (key: number, change: Partial<ItemDraft>) => onChange(items.map((i) => (i.key === key ? { ...i, ...change } : i)))
  return (
    <fieldset aria-labelledby={legend} className="m-0 flex flex-col gap-3 rounded-lg border border-default bg-surface p-4" aria-invalid={invalid || undefined}>
      <legend id={legend} className="px-1.5 text-[17px] font-semibold">
        {t('camp.costs')}
      </legend>
      <div aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_140px_44px] gap-2.5 text-[13px] font-semibold text-secondary">
        <span>{t('camp.item')}</span>
        <span>{t('camp.amount')}</span>
        <span />
      </div>
      {items.map((item, i) => (
        <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_140px_44px] gap-2.5">
          <input aria-label={t('camp.itemN', { n: i + 1 })} value={item.label} maxLength={120} onChange={(e) => set(item.key, { label: e.target.value })} className={input} />
          <input
            aria-label={t('camp.amountN', { n: i + 1 })}
            inputMode="decimal"
            dir="ltr"
            value={item.amount}
            onChange={(e) => set(item.key, { amount: e.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))) })}
            className={input}
          />
          <button
            type="button"
            aria-label={t('camp.removeN', { n: i + 1 })}
            disabled={items.length === 1}
            onClick={() => onChange(items.filter((x) => x.key !== item.key))}
            className="flex size-11 items-center justify-center rounded-[10px] bg-subtle text-secondary disabled:opacity-40"
          >
            ✕
          </button>
        </div>
      ))}
      {items.length < DONATION_LIMITS.maxCostItems ? (
        <button type="button" onClick={() => onChange([...items, newItem()])} className="min-h-10 self-start px-1 text-sm font-semibold text-link">
          {t('camp.addItem')}
        </button>
      ) : null}
      <div className="flex items-center justify-between border-t border-default pt-3">
        <span className="font-semibold">{t('camp.target')}</span>
        <span className="text-[26px] font-bold" aria-live="polite">
          {parsed ? number(sumLyd(parsed)) : '—'} {t('money.lyd')}
        </span>
      </div>
    </fieldset>
  )
}

/** "Supported by": choose the partner funding this repair (optional). */
export function PartnerSelect({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const { t, locale } = useI18n()
  const partners = usePartners()
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {t('camp.partner')} <span className="font-normal text-secondary">{t('camp.optional')}</span>
      </label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className="min-h-11 rounded-[10px] border border-strong bg-surface px-3">
        <option value="">{t('camp.noPartner')}</option>
        {(partners.data ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {pick(locale, p.name_ar, p.name_en)}
          </option>
        ))}
      </select>
    </div>
  )
}
