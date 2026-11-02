import type { CampaignSummary, Donation } from '@hufra/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

import { AppProviders } from '@/app-shell/providers';

import { CampaignCardView } from './campaign-card';
import { barParts, formatLyd } from './money';
import { confirmedTotal, MyDonationsScreen } from './my-donations-screen';
import { openModeFor } from './use-donations';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), navigate: jest.fn(), replace: jest.fn(), canGoBack: () => true }) }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'cancel' })),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));

const campaign: CampaignSummary = {
  id: 3,
  pothole_id: 9,
  status: 'active',
  target_lyd: 1200,
  confirmed_lyd: 340,
  under_review_lyd: 90,
  donors_count: 12,
  note_ar: null,
  note_en: null,
  street_ar: 'شارع الجمهورية',
  street_en: null,
  region_name_ar: 'وسط المدينة',
  region_name_en: 'City centre',
  created_at: '2026-11-01T08:00:00.000Z',
  funded_at: null,
  closed_at: null,
};
const donation = (over: Partial<Donation> & { id: number }): Donation => ({
  campaign_id: 3,
  pothole_id: 9,
  reference_code: 'HF-7KQ2MP',
  method: 'bank_transfer',
  amount_lyd: 50,
  status: 'confirmed',
  show_name: false,
  has_proof: true,
  reject_reason: null,
  expires_at: null,
  created_at: '2026-11-01T08:00:00.000Z',
  reviewed_at: '2026-11-02T08:00:00.000Z',
  street_ar: 'شارع الجمهورية',
  street_en: null,
  ...over,
});
const me = { user: { id: 9, email: 'a@b.ly', code: 'U9', role: 'user', locale: 'ar', display_name: null, totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z' } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let config = { enabled: true, open_mode: { ios: 'in_app', android: 'in_app' }, methods: { bank_transfer: true, card_moamalat: false } };
let mine: Donation[] = [];
let handoffOk = true;

beforeEach(async () => {
  jest.clearAllMocks();
  config = { enabled: true, open_mode: { ios: 'in_app', android: 'in_app' }, methods: { bank_transfer: true, card_moamalat: false } };
  mine = [];
  handoffOk = true;
  await SecureStore.setItemAsync('hufra.accessToken', 'access');
  await SecureStore.setItemAsync('hufra.refreshToken', 'refresh');
  globalThis.fetch = jest.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith('/api/auth/me')) return json(me);
    if (u.endsWith('/api/donations/config')) return json(config);
    if (u.endsWith('/api/donations/mine')) return json({ results: mine });
    if (u.endsWith('/api/auth/web-handoff')) return handoffOk ? json({ url: 'https://hufra.test/api/auth/handoff?t=abc', expires_in: 60 }) : json({ error: 'x' }, 500);
    return json({ error: 'x' }, 404);
  }) as unknown as typeof fetch;
});

const show = (ui: React.ReactElement) => render(<AppProviders locale="ar" themeMode="light">{ui}</AppProviders>);
const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
const originalOS = Platform.OS;
afterEach(() => setOS(originalOS));

describe('money', () => {
  it('shows dinar with Western digits', () => {
    expect(formatLyd(1250.5, 'ar')).toBe('1,250.5 د.ل');
    expect(formatLyd(1250.5, 'en')).toBe('LYD 1,250.5');
  });
  it('keeps under-review money apart and never past the end of the bar', () => {
    expect(barParts(1200, 300, 120)).toEqual({ confirmed: 25, underReview: 10 });
    expect(barParts(100, 90, 50)).toEqual({ confirmed: 90, underReview: 10 });
    expect(barParts(0, 5, 5)).toEqual({ confirmed: 0, underReview: 0 });
  });
  it('adds confirmed donations exactly', () => {
    expect(confirmedTotal([donation({ id: 1, amount_lyd: 0.1 }), donation({ id: 2, amount_lyd: 0.2 }), donation({ id: 3, status: 'under_review' })])).toBe(0.3);
  });
});

describe('open mode', () => {
  it('follows the team setting per platform, and Safari on iPhone when unknown', () => {
    const cfg = { open_mode: { ios: 'safari' as const, android: 'in_app' as const } };
    setOS('ios');
    expect(openModeFor(cfg)).toBe('safari');
    expect(openModeFor(undefined)).toBe('safari');
    setOS('android');
    expect(openModeFor(cfg)).toBe('in_app');
  });
});

describe('CampaignCardView', () => {
  it('shows confirmed and under-review money apart, and opens the website signed in, inside the app', async () => {
    await show(<CampaignCardView campaign={campaign} />);
    expect(screen.getByText('340 د.ل مؤكدة من 1,200 د.ل')).toBeTruthy();
    expect(screen.getByText('90 د.ل قيد المراجعة، غير مؤكدة بعد')).toBeTruthy();
    expect(screen.getByText('12 متبرع · يبقى 860 د.ل')).toBeTruthy();
    await waitFor(() => expect((globalThis.fetch as jest.Mock).mock.calls.some(([u]) => String(u).endsWith('/api/auth/me'))).toBe(true));
    await fireEvent.press(await screen.findByRole('button', { name: 'تبرّع لإصلاحها' }));
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://hufra.test/api/auth/handoff?t=abc', expect.objectContaining({ presentationStyle: 'pageSheet' })));
    const handoff = (globalThis.fetch as jest.Mock).mock.calls.find(([u]) => String(u).endsWith('/web-handoff'));
    expect(JSON.parse(String(handoff[1].body))).toEqual({ next: '/donate/3' });
  });

  it("uses the phone's browser when the team switched to Safari, and the plain page if the link fails", async () => {
    setOS('ios');
    config = { ...config, open_mode: { ios: 'safari', android: 'in_app' } };
    handoffOk = false;
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await show(<CampaignCardView campaign={campaign} />);
    await waitFor(() => expect((globalThis.fetch as jest.Mock).mock.calls.some(([u]) => String(u).endsWith('/donations/config'))).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    await fireEvent.press(await screen.findByRole('button', { name: 'تبرّع لإصلاحها' }));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/\/donate\/3$/)));
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it('thanks donors instead of asking once the repair is funded', async () => {
    await show(<CampaignCardView campaign={{ ...campaign, status: 'funded', confirmed_lyd: 1200, under_review_lyd: 0 }} />);
    expect(screen.getByText('اكتمل تمويل هذا الإصلاح، شكراً لكل المتبرعين.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'تبرّع لإصلاحها' })).toBeNull();
  });

  it('says when donations are not open yet', async () => {
    config = { ...config, enabled: false };
    await show(<CampaignCardView campaign={campaign} />);
    expect(await screen.findByText('التبرعات غير متاحة بعد.')).toBeTruthy();
  });
});

describe('MyDonationsScreen', () => {
  it('lists every status and the confirmed total', async () => {
    mine = [
      donation({ id: 1, amount_lyd: 100 }),
      donation({ id: 2, status: 'awaiting_transfer', reviewed_at: null, amount_lyd: 25 }),
      donation({ id: 3, status: 'rejected', reject_reason: 'لم يصل التحويل', amount_lyd: 50 }),
    ];
    await show(<MyDonationsScreen />);
    expect(await screen.findByText('100 د.ل')).toBeTruthy();
    expect(screen.getByText('بانتظار صورة التحويل')).toBeTruthy();
    expect(screen.getByText('إكمال التبرع')).toBeTruthy();
    expect(screen.getByText('السبب: لم يصل التحويل')).toBeTruthy();
    await fireEvent.press(screen.getByText('إكمال التبرع'));
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalled());
    const handoff = (globalThis.fetch as jest.Mock).mock.calls.find(([u]) => String(u).endsWith('/web-handoff'));
    expect(JSON.parse(String(handoff[1].body))).toEqual({ next: '/donations/2' });
  });
});
