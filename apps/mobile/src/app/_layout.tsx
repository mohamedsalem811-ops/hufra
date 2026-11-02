import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// Phase 5.1: the bare navigator. Fonts, right-to-left, theming, data and the
// splash hand-off arrive in 5.3; the tabs and onboarding in 5.4.
export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
