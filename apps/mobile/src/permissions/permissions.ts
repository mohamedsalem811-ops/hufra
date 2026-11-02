import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

export type PermissionResult = 'granted' | 'denied' | 'undetermined';

function toResult(status: string): PermissionResult {
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/**
 * Asks only after our own screen has explained why (VOICE.md: benefit first).
 * Never throws: a failure counts as "not granted" and the person can allow it later in Settings.
 */
export async function requestLocation(): Promise<PermissionResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return toResult(status);
  } catch {
    return 'undetermined';
  }
}

export async function requestNotifications(): Promise<PermissionResult> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return toResult(status);
  } catch {
    return 'undetermined';
  }
}
