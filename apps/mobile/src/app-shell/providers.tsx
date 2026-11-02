import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiProvider } from '@/api/api-provider';
import { AuthProvider } from '@/features/auth/auth-provider';
import { OutboxProvider } from '@/features/outbox/outbox-provider';
import { I18nProvider } from '@/i18n/i18n-provider';
import type { Locale } from '@/i18n/locale';
import type { ThemeMode } from '@/theme/theme';
import { ThemeProvider } from '@/theme/theme-provider';

/** Everything a screen can rely on: gestures, safe areas, language, theme, API, data cache and session. */
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
    <GestureHandlerRootView style={styles.root}>
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <I18nProvider locale={locale}>
        <ThemeProvider initialMode={themeMode}>
          <ApiProvider>
            <AuthProvider>
              <OutboxProvider>{children}</OutboxProvider>
            </AuthProvider>
          </ApiProvider>
        </ThemeProvider>
      </I18nProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
