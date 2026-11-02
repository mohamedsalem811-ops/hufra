import { Platform } from 'react-native';

/**
 * Crash reports (plan 6.8): Firebase Crashlytics, free. Android only for now:
 * the iPhone build leaves the Firebase native code out (react-native.config.js)
 * until it has its own Firebase config (plan 10.2). Unhandled JavaScript errors
 * and native crashes are reported automatically once Firebase is configured;
 * this module adds errors the app catches itself (e.g. the crash screen).
 * Nothing personal is attached: no name, email or location, only the app's
 * screen and the error.
 */
type CrashlyticsApi = typeof import('@react-native-firebase/crashlytics');

let api: CrashlyticsApi | null | undefined;

function crashlytics(): CrashlyticsApi | null {
  if (api !== undefined) return api;
  api = null;
  if (Platform.OS !== 'android') return api;
  try {
    // Loaded lazily: the native module only exists in Android builds with Firebase configured.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const firebase = require('@react-native-firebase/app') as typeof import('@react-native-firebase/app');
    if (firebase.getApps().length === 0) return api;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    api = require('@react-native-firebase/crashlytics') as CrashlyticsApi;
  } catch {
    api = null;
  }
  return api;
}

/** Report an error the app caught (it did not crash the app). */
export function reportError(error: unknown, context?: string): void {
  const c = crashlytics();
  if (!c) return;
  try {
    const instance = c.getCrashlytics();
    if (context) c.log(instance, context);
    c.recordError(instance, error instanceof Error ? error : new Error(String(error)));
  } catch {
    // Reporting must never cause a second failure.
  }
}

/** A breadcrumb shown with the next crash report (e.g. the screen being opened). */
export function breadcrumb(message: string): void {
  const c = crashlytics();
  if (!c) return;
  try {
    c.log(c.getCrashlytics(), message);
  } catch {
    // ignore
  }
}
