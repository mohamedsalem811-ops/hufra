import { useFonts } from 'expo-font';
import { Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useBoot } from '@/app-shell/boot';
import { OnboardingProvider, useOnboarding } from '@/app-shell/onboarding';
import { AppProviders } from '@/app-shell/providers';
import { ErrorView } from '@/components/error-view';
import { breadcrumb, reportError } from '@/crash/crash';
import { PushHandler } from '@/features/push/push-handler';
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
    <AppProviders locale={boot.locale} themeMode={boot.themeMode} textSize={boot.textSize}>
      <OnboardingProvider initial={boot.onboarded}>
        <RootStack />
      </OnboardingProvider>
    </AppProviders>
  );
}

/** First run shows onboarding; afterwards the tabs. The guards swap them without a back stack. */
function RootStack() {
  const { scheme, colors } = useTheme();
  const { onboarded } = useOnboarding();
  // The screen path (public, never personal data) goes with crash reports.
  const pathname = usePathname();
  useEffect(() => breadcrumb(`screen ${pathname}`), [pathname]);
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg.canvas } }}>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="pothole/[id]" />
          <Stack.Screen name="new-report" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
          <Stack.Screen name="auth/sign-in" />
          <Stack.Screen name="auth/sign-up" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="notifications" />
        </Stack.Protected>
      </Stack>
      {onboarded ? <PushHandler /> : null}
    </>
  );
}

/**
 * Last-resort screen for a crash while rendering any route. Providers may be
 * the thing that failed, so it rebuilds them with safe defaults.
 * The error is sent to crash reporting (Firebase Crashlytics, Android).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportError(error, 'crash screen shown'), [error]);
  return (
    <AppProviders locale="ar" themeMode="system">
      <ErrorView error={error} onRetry={retry} />
    </AppProviders>
  );
}
