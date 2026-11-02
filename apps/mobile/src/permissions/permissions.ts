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

export type Coordinates = { latitude: number; longitude: number };

/** Whether location is already allowed (no prompt). */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    return (await Location.getForegroundPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
}

/** Where the phone is: the last known fix if recent enough, otherwise a fresh one. Null if unavailable. */
export async function currentPosition(): Promise<Coordinates | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 });
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}
