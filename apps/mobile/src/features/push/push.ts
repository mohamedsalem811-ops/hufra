import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { z } from 'zod';

import type { ApiClient } from '@/api/client';
import type { Locale } from '@/i18n/locale';
import type { KeyValueStore } from '@/storage/secure';

const SAVED_KEY = 'hufra.pushRegistration';
/** Re-send an unchanged token at most this often, so the server's "last seen" stays fresh. */
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

interface Saved {
  token: string;
  userId: number;
  locale: Locale;
  at: number;
}

export const ANDROID_CHANNEL = 'default';

/** Android channel for report updates (the server sends to the default channel). */
export async function ensureAndroidChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name,
    importance: AndroidImportance.HIGH,
    lightColor: '#0B4A6F',
  }).catch(() => undefined);
}

/**
 * Push needs the phone's FCM token (Android). iPhone push waits for a paid
 * Apple account (plan 10.2), so there is nothing to register there yet.
 */
export function pushSupported(): boolean {
  return Platform.OS === 'android';
}

async function readSaved(store: KeyValueStore): Promise<Saved | null> {
  try {
    const raw = await store.get(SAVED_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

/** Should this token be (re)sent for this person and language? */
export function needsRegistration(saved: Saved | null, token: string, userId: number, locale: Locale, now = Date.now()): boolean {
  return !saved || saved.token !== token || saved.userId !== userId || saved.locale !== locale || now - saved.at > REFRESH_MS;
}

/**
 * Register this phone for report updates. Quietly does nothing when
 * notifications are not allowed, push is not set up in this build (no
 * Firebase config), or the phone is offline; it is tried again on next start.
 */
export async function registerForPush(
  api: ApiClient,
  store: KeyValueStore,
  { userId, locale, token: given }: { userId: number; locale: Locale; token?: string },
): Promise<'registered' | 'unchanged' | 'skipped'> {
  if (!pushSupported()) return 'skipped';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return 'skipped';
    const token = given ?? (await Notifications.getDevicePushTokenAsync()).data;
    if (typeof token !== 'string' || token.length < 8) return 'skipped';
    if (!needsRegistration(await readSaved(store), token, userId, locale)) return 'unchanged';
    await api.request('/api/notifications/push-token', {
      method: 'POST',
      body: { platform: 'android', token, locale },
      schema: z.unknown(),
    });
    await store.set(SAVED_KEY, JSON.stringify({ token, userId, locale, at: Date.now() } satisfies Saved));
    return 'registered';
  } catch {
    return 'skipped';
  }
}

/** Stop sending to this phone (before signing out). Best effort; the local record is always cleared. */
export async function unregisterPush(api: ApiClient, store: KeyValueStore): Promise<void> {
  const saved = await readSaved(store);
  if (saved) {
    await api
      .request('/api/notifications/push-token', { method: 'DELETE', body: { token: saved.token }, schema: z.unknown() })
      .catch(() => undefined);
  }
  await store.remove(SAVED_KEY).catch(() => undefined);
}

/** Forget the local record only (the server already removed the device, e.g. account deleted). */
export function forgetPush(store: KeyValueStore): Promise<void> {
  return store.remove(SAVED_KEY).catch(() => undefined);
}

export type PushTarget = { pathname: '/pothole/[id]'; params: { id: string } } | '/notifications';

/** Where tapping a notification goes: its report, else the inbox. Only our own paths are followed. */
export function targetFor(data: unknown): PushTarget {
  const url = data && typeof data === 'object' && 'url' in data ? (data as { url: unknown }).url : null;
  const match = typeof url === 'string' ? /^\/pothole\/([1-9]\d{0,9})$/.exec(url) : null;
  return match ? { pathname: '/pothole/[id]', params: { id: match[1] } } : '/notifications';
}
