import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ar, en, type MessageKey } from './messages'

export type Locale = 'ar' | 'en'
const STORAGE_KEY = 'hufra.admin.locale'

interface I18n {
  locale: Locale
  dir: 'rtl' | 'ltr'
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  setLocale: (l: Locale) => void
  /** Western digits in both languages (the brand rule for numbers). */
  number: (n: number) => string
}

const I18nContext = createContext<I18n | null>(null)

function storedLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ar'
  } catch {
    return 'ar'
  }
}

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initial ?? storedLocale)
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
    document.title = locale === 'ar' ? 'لوحة إدارة حفرة' : 'HUFRA admin'
  }, [locale, dir])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* private mode: the choice lasts for this visit */
    }
  }, [])

  const value = useMemo<I18n>(() => {
    const table = locale === 'ar' ? ar : en
    const fmt = new Intl.NumberFormat('en-US') // same digits and separators as the app
    return {
      locale,
      dir,
      setLocale,
      number: (n) => fmt.format(n),
      t: (key, vars) => {
        let s: string = table[key]
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
        return s
      },
    }
  }, [locale, dir, setLocale])

  return <I18nContext value={value}>{children}</I18nContext>
}

export function useI18n(): I18n {
  const v = useContext(I18nContext)
  if (!v) throw new Error('useI18n outside I18nProvider')
  return v
}
