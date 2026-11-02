import { reloadAppAsync } from 'expo';
import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';

import { applyLayoutDirection, loadLocale, type Locale } from '@/i18n/locale';
import { secureStore } from '@/storage/secure';
import { loadThemeMode, type ThemeMode } from '@/theme/theme';

export type BootState = { ready: false } | { ready: true; locale: Locale; themeMode: ThemeMode };

/**
 * Runs behind the splash screen: reads the saved language and theme, and makes
 * the native layout direction match the language (one reload the first time an
 * Arabic-first app starts on a left-to-right phone, or after a language switch).
 */
export function useBoot(): BootState {
  const [state, setState] = useState<BootState>({ ready: false });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [locale, themeMode] = await Promise.all([loadLocale(secureStore), loadThemeMode(secureStore)]);
      const reloading = await applyLayoutDirection(locale, I18nManager, () => reloadAppAsync('layout direction'));
      if (!cancelled && !reloading) setState({ ready: true, locale, themeMode });
    })().catch(() => {
      // Storage unavailable: start in the defaults rather than never starting.
      if (!cancelled) setState({ ready: true, locale: 'ar', themeMode: 'system' });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
