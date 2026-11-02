import type { Locale } from '@hufra/contracts';

import type { KeyValueStore } from '@/storage/secure';

export type { Locale };

/** Arabic first, on every phone, until the person chooses English. */
export const DEFAULT_LOCALE: Locale = 'ar';
const LOCALE_KEY = 'hufra.locale';

export const isRtlLocale = (locale: Locale) => locale === 'ar';

export async function loadLocale(store: KeyValueStore): Promise<Locale> {
  const saved = await store.get(LOCALE_KEY).catch(() => null);
  return saved === 'ar' || saved === 'en' ? saved : DEFAULT_LOCALE;
}

export function saveLocale(store: KeyValueStore, locale: Locale): Promise<void> {
  return store.set(LOCALE_KEY, locale);
}

/** The parts of React Native's I18nManager this module needs (injectable for tests). */
export interface DirectionManager {
  isRTL: boolean;
  allowRTL(allow: boolean): void;
  forceRTL(force: boolean): void;
}

/**
 * Makes the native layout direction match the language. Layout direction is
 * fixed when the JavaScript starts, so a change needs one reload; it happens
 * behind the splash screen on first launch and right after switching language.
 * Returns true when a reload was started (the caller should render nothing).
 */
export async function applyLayoutDirection(
  locale: Locale,
  manager: DirectionManager,
  reload: () => Promise<void>,
): Promise<boolean> {
  const rtl = isRtlLocale(locale);
  manager.allowRTL(true);
  if (manager.isRTL === rtl) return false;
  manager.forceRTL(rtl);
  await reload();
  return true;
}
