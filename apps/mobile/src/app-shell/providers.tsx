import type { ReactNode } from 'react';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiProvider } from '@/api/api-provider';
import { I18nProvider } from '@/i18n/i18n-provider';
import type { Locale } from '@/i18n/locale';
import type { ThemeMode } from '@/theme/theme';
import { ThemeProvider } from '@/theme/theme-provider';

/** Everything a screen can rely on: safe areas, language, theme, API and data cache. */
export function AppProviders({
  locale,
  themeMode,
  children,
}: {
  locale: Locale;
  themeMode: ThemeMode;
  children: ReactNode;
}) {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <I18nProvider locale={locale}>
        <ThemeProvider initialMode={themeMode}>
          <ApiProvider>{children}</ApiProvider>
        </ThemeProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
