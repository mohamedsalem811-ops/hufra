import { reloadAppAsync } from 'expo';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { I18nManager } from 'react-native';

import { secureStore } from '@/storage/secure';

import { applyLayoutDirection, saveLocale, type Locale } from './locale';
import { messages, type MessageKey } from './messages';

interface I18nValue {
  locale: Locale;
  isRTL: boolean;
  t: (key: MessageKey) => string;
  /** Saves the language and reloads the app so the layout direction follows. */
  setLocale: (locale: Locale) => Promise<void>;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const setLocale = useCallback(async (next: Locale) => {
    if (next === locale) return;
    await saveLocale(secureStore, next);
    await applyLayoutDirection(next, I18nManager, () => reloadAppAsync('language changed'));
  }, [locale]);

  const value = useMemo<I18nValue>(() => {
    const table = messages[locale];
    return { locale, isRTL: locale === 'ar', t: (key) => table[key], setLocale };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
