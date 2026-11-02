import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useBoot } from '@/app-shell/boot';
import { AppProviders } from '@/app-shell/providers';
import { ErrorView } from '@/components/error-view';
import { fontAssets } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const boot = useBoot();
  const ready = boot.ready && (fontsLoaded || fontError !== null);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready || !boot.ready) return null;
  return (
    <AppProviders locale={boot.locale} themeMode={boot.themeMode}>
      <ThemedStack />
    </AppProviders>
  );
}

function ThemedStack() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg.canvas } }} />
    </>
  );
}

/**
 * Last-resort screen for a crash while rendering any route. Providers may be
 * the thing that failed, so it rebuilds them with safe defaults.
 * Crash reporting (Firebase Crashlytics) is wired here in Phase 6.8.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <AppProviders locale="ar" themeMode="system">
      <ErrorView error={error} onRetry={retry} />
    </AppProviders>
  );
}
