import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Text } from 'react-native';

import { AppProviders } from '@/app-shell/providers';
import { API_URL } from '@/config/env';

import { LegalGate } from './legal-gate';
import { websiteUrl } from './website';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const info = {
  legal_name_ar: 'حفرة', legal_name_en: 'HUFRA', registration_no: '', address: 'طرابلس', courts: 'طرابلس',
  retention_financial_years: 10, retention_screenshots_days: 90, wrong_transfer_days: 14, privacy_reply_days: 30,
};
let accepted: number | null = null;
let legalFails = false;
const posted: unknown[] = [];

function mockFetch() {
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = String(url).split('?')[0];
    if (u.endsWith('/api/site/legal')) {
      if (legalFails) return json({ error: 'x' }, 500);
      return json({ version: 3, published_at: '2026-11-01T00:00:00.000Z', acceptance_required_from: 2, complete: true, info });
    }
    if (u.endsWith('/api/auth/me/accept-legal') && init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)));
      accepted = 3;
      return json({ ok: true });
    }
    if (u.endsWith('/api/auth/me')) {
      return json({
        user: { id: 9, email: 's@example.ly', code: 'HF-9', role: 'user', locale: 'ar', display_name: null, totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z', legal_version_accepted: accepted },
      });
    }
    if (u.endsWith('/api/auth/logout')) return json({ ok: true });
    return json({ error: 'x' }, 404);
  }) as unknown as typeof fetch;
}

const show = () =>
  render(
    <AppProviders locale="ar" themeMode="light">
      <LegalGate>
        <Text>التطبيق</Text>
      </LegalGate>
    </AppProviders>,
  );

beforeEach(async () => {
  jest.clearAllMocks();
  accepted = null;
  legalFails = false;
  posted.length = 0;
  await SecureStore.setItemAsync('hufra.accessToken', 'access');
  await SecureStore.setItemAsync('hufra.refreshToken', 'refresh');
  mockFetch();
});

describe('LegalGate', () => {
  it('asks someone who accepted an older version, and lets them in once they accept the latest', async () => {
    accepted = 1;
    await show();
    expect(await screen.findByText('حدّثنا الشروط وسياسة الخصوصية')).toBeTruthy();
    expect(screen.queryByText('التطبيق')).toBeNull();

    await fireEvent.press(screen.getByRole('link', { name: 'شروط الاستخدام' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(`${API_URL}/terms`);

    await fireEvent.press(screen.getByRole('button', { name: 'قرأتها وأوافق' }));
    expect(await screen.findByText('التطبيق')).toBeTruthy();
    expect(posted).toEqual([{ version: 3 }]);
  });

  it('does not ask someone who already accepted the required version', async () => {
    accepted = 2;
    await show();
    await waitFor(() => expect((globalThis.fetch as jest.Mock).mock.calls.some(([u]) => String(u).includes('/api/site/legal'))).toBe(true));
    expect(screen.getByText('التطبيق')).toBeTruthy();
    expect(screen.queryByText('حدّثنا الشروط وسياسة الخصوصية')).toBeNull();
  });

  it('never blocks when the server fails', async () => {
    legalFails = true;
    accepted = 1;
    await show();
    await waitFor(() => expect((globalThis.fetch as jest.Mock).mock.calls.some(([u]) => String(u).includes('/api/site/legal'))).toBe(true));
    expect(screen.getByText('التطبيق')).toBeTruthy();
  });

  it('never asks when signed out', async () => {
    await SecureStore.deleteItemAsync('hufra.accessToken');
    await SecureStore.deleteItemAsync('hufra.refreshToken');
    accepted = 1;
    await show();
    expect(screen.getByText('التطبيق')).toBeTruthy();
    expect((globalThis.fetch as jest.Mock).mock.calls.some(([u]) => String(u).includes('/api/site/legal'))).toBe(false);
  });

  it('can sign out instead of accepting', async () => {
    accepted = 1;
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: 'تسجيل الخروج' }));
    // Signing out takes a few steps (push token, server, keychain).
    expect(await screen.findByText('التطبيق', {}, { timeout: 3000 })).toBeTruthy();
    expect(await SecureStore.getItemAsync('hufra.accessToken')).toBeNull();
  });
});

describe('websiteUrl', () => {
  it('uses the English pages under /en', () => {
    expect(websiteUrl('ar', '/privacy')).toBe(`${API_URL}/privacy`);
    expect(websiteUrl('en', '/privacy')).toBe(`${API_URL}/en/privacy`);
    expect(websiteUrl('en', '/')).toBe(`${API_URL}/en/`);
  });
});
