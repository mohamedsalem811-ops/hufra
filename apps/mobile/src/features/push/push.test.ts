import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { createApiClient } from '@/api/client';
import { createTokenStore } from '@/api/token-store';
import { memoryStore } from '@/storage/secure';

import { needsRegistration, registerForPush, targetFor, unregisterPush } from './push';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: 'android', data: 'fcm-token-123456' })),
  setNotificationChannelAsync: jest.fn(async () => null),
  AndroidImportance: { HIGH: 4 },
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function setup() {
  const store = memoryStore();
  const tokens = createTokenStore(memoryStore());
  await tokens.set({ accessToken: 'access', refreshToken: 'refresh' });
  const fetchMock = jest.fn(async () => json({ ok: true }, 201));
  const api = createApiClient({ baseUrl: 'https://api.test', tokens, fetchFn: fetchMock as unknown as typeof fetch });
  return { store, api, fetchMock };
}

const original = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
});
afterAll(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original }));

describe('push registration', () => {
  it('sends the token once, then only when something changes', async () => {
    const { store, api, fetchMock } = await setup();
    expect(await registerForPush(api, store, { userId: 9, locale: 'ar' })).toBe('registered');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/notifications/push-token');
    expect(JSON.parse(String(init.body))).toEqual({ platform: 'android', token: 'fcm-token-123456', locale: 'ar' });

    expect(await registerForPush(api, store, { userId: 9, locale: 'ar' })).toBe('unchanged');
    expect(await registerForPush(api, store, { userId: 9, locale: 'en' })).toBe('registered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does nothing without permission, on iPhone, or when push is not set up', async () => {
    const { store, api, fetchMock } = await setup();
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({ status: 'denied' } as never);
    expect(await registerForPush(api, store, { userId: 9, locale: 'ar' })).toBe('skipped');
    jest.mocked(Notifications.getDevicePushTokenAsync).mockRejectedValueOnce(new Error('Default FirebaseApp is not initialized'));
    expect(await registerForPush(api, store, { userId: 9, locale: 'ar' })).toBe('skipped');
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    expect(await registerForPush(api, store, { userId: 9, locale: 'ar' })).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('removes this phone from the server on sign-out', async () => {
    const { store, api, fetchMock } = await setup();
    await registerForPush(api, store, { userId: 9, locale: 'ar' });
    await unregisterPush(api, store);
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/notifications/push-token');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(String(init.body))).toEqual({ token: 'fcm-token-123456' });
    // A new person signing in on this phone registers again.
    expect(await registerForPush(api, store, { userId: 10, locale: 'ar' })).toBe('registered');
  });

  it('refreshes an unchanged token weekly', () => {
    const saved = { token: 't', userId: 1, locale: 'ar' as const, at: 0 };
    expect(needsRegistration(saved, 't', 1, 'ar', 1000)).toBe(false);
    expect(needsRegistration(saved, 't', 1, 'ar', 8 * 24 * 3600 * 1000)).toBe(true);
    expect(needsRegistration(saved, 'other', 1, 'ar', 1000)).toBe(true);
    expect(needsRegistration(saved, 't', 2, 'ar', 1000)).toBe(true);
  });
});

describe('targetFor', () => {
  it('opens the report a notification is about, otherwise the inbox', () => {
    expect(targetFor({ url: '/pothole/42' })).toEqual({ pathname: '/pothole/[id]', params: { id: '42' } });
    expect(targetFor({ url: '/admin?report=4' })).toBe('/notifications');
    expect(targetFor({ url: 'https://evil.example/pothole/1' })).toBe('/notifications');
    expect(targetFor(null)).toBe('/notifications');
  });
});
