import type { PotholeDetailResponse } from '@hufra/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import type { ReactNode } from 'react';

import { AppProviders } from '@/app-shell/providers';

import { ReportDetailScreen } from './report-detail-screen';

jest.mock('@maplibre/maplibre-react-native', () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories cannot use imports */
  const { View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { Map: ({ children }: { children: ReactNode }) => <View>{children}</View>, Camera: () => null };
});
const mockRouter = { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), replace: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const base: PotholeDetailResponse['pothole'] = {
  id: 42,
  region_id: 1,
  region_slug: 'centre',
  lat: 32.8872,
  lng: 13.1913,
  length_cm: null,
  width_cm: 60,
  depth_cm: 12,
  severity: 'severe',
  status: 'verified',
  description_ar: 'حفرة عميقة قرب الإشارة',
  description_en: null,
  street_ar: 'شارع الجمهورية',
  street_en: 'Al Jumhuriya St',
  view_count: 0,
  upvotes_count: 3,
  created_at: '2026-10-28T08:00:00.000Z',
  updated_at: '2026-10-29T08:00:00.000Z',
  verified_at: '2026-10-29T08:00:00.000Z',
  under_repair_at: null,
  fixed_at: null,
  deleted_at: null,
  region_name_ar: 'وسط المدينة',
  region_name_en: 'City centre',
};
const photo = (id: number, stage: 'report' | 'before' | 'after') => ({
  id,
  stage,
  r2_key: `p/${id}.webp`,
  thumb_key: `p/${id}-t.webp`,
  created_at: '2026-10-28T08:00:00.000Z',
});
const me = {
  user: { id: 9, email: 'a@b.ly', code: 'U9', role: 'user', locale: 'ar', display_name: null, totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z' },
};

let detail: PotholeDetailResponse;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(async () => {
  jest.clearAllMocks();
  await SecureStore.deleteItemAsync('hufra.accessToken');
  await SecureStore.deleteItemAsync('hufra.refreshToken');
  detail = {
    pothole: base,
    photos: [photo(1, 'report'), photo(2, 'report')],
    history: [
      { from_status: null, to_status: 'reported', note: null, at: '2026-10-28T08:00:00.000Z' },
      { from_status: 'reported', to_status: 'verified', note: 'زارها الفريق', at: '2026-10-29T08:00:00.000Z' },
    ],
  };
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/api/auth/me')) return json(me);
    if (u.endsWith('/upvote') && init?.method === 'POST') return json({ ok: true, already_upvoted: false, upvotes_count: 4 }, 201);
    if (u.endsWith('/api/potholes/42')) return json(detail);
    return json({ error: 'Not found' }, 404);
  }) as unknown as typeof fetch;
});

async function signIn() {
  await SecureStore.setItemAsync('hufra.accessToken', 'access');
  await SecureStore.setItemAsync('hufra.refreshToken', 'refresh');
}

function show() {
  return render(
    <AppProviders locale="ar" themeMode="light">
      <ReportDetailScreen id={42} />
    </AppProviders>,
  );
}

const calls = () => (globalThis.fetch as jest.Mock).mock.calls as [string, RequestInit | undefined][];

describe('ReportDetailScreen', () => {
  it('shows an open report: photos, details, measurements, timeline with team notes', async () => {
    await show();
    expect(await screen.findByRole('header', { name: 'شارع الجمهورية' })).toBeTruthy();
    expect(screen.getByLabelText('صورة 1 من 2')).toBeTruthy();
    expect(screen.getByText(/وسط المدينة · خطورة خطيرة · منذ/)).toBeTruthy();
    expect(screen.getByText('حفرة عميقة قرب الإشارة')).toBeTruthy();
    expect(screen.getByText('60 سم')).toBeTruthy();
    expect(screen.getByText('12 سم')).toBeTruthy();
    expect(screen.getByText('ملاحظة الفريق: زارها الفريق')).toBeTruthy();
    expect(screen.getByText('عدد من أكدوا وجودها: 3')).toBeTruthy();
    expect(screen.queryByText('بلاغك')).toBeNull();
  });

  it('asks a signed-out person to sign in before confirming, and sends no session', async () => {
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: 'سجّل الدخول لتأكيد وجودها' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/auth/sign-in');
    const [, init] = calls().find(([u]) => u.endsWith('/api/potholes/42'))!;
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('lets a signed-in person confirm once, and updates the count', async () => {
    await signIn();
    detail = { ...detail, viewer: { mine: false, upvoted: false } };
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: 'تأكيد وجود الحفرة' }));
    expect(await screen.findByRole('button', { name: 'أكدت وجودها. شكراً لك' })).toBeTruthy();
    expect(screen.getByText('عدد من أكدوا وجودها: 4')).toBeTruthy();
    const [, init] = calls().find(([u]) => u.endsWith('/api/potholes/42'))!;
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access');
  });

  it("marks the person's own report and does not ask them to confirm it", async () => {
    await signIn();
    detail = { ...detail, viewer: { mine: true, upvoted: false } };
    await show();
    expect(await screen.findByText('بلاغك')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'تأكيد وجود الحفرة' })).toBeNull();
  });

  it('shows a fixed report as before/after with how long the repair took', async () => {
    detail = {
      pothole: { ...base, status: 'fixed', under_repair_at: '2026-10-30T08:00:00.000Z', fixed_at: '2026-11-01T09:00:00.000Z' },
      photos: [photo(1, 'report'), photo(2, 'before'), photo(3, 'after')],
      history: [],
    };
    await show();
    const slider = await screen.findByRole('adjustable', { name: 'قارن قبل وبعد' });
    expect(slider.props.accessibilityValue).toMatchObject({ now: 50 });
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await waitFor(() => expect(slider.props.accessibilityValue).toMatchObject({ now: 60 }));
    expect(screen.getByText('أُصلحت خلال 4 أيام من الإبلاغ')).toBeTruthy();
    expect(screen.getByText(/^تم الإصلاح · /)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /تأكيد وجود الحفرة|سجّل الدخول لتأكيد/ })).toBeNull();
  });

  it('opens the map on this report', async () => {
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: 'فتح على الخريطة' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/map', params: { focus: '42', lat: '32.8872', lng: '13.1913' } });
  });

  it('explains a removed report in plain words', async () => {
    globalThis.fetch = jest.fn(async () => json({ error: 'Not found' }, 404)) as unknown as typeof fetch;
    await show();
    expect(await screen.findByText('لم نجد هذا البلاغ. ربما حُذف.')).toBeTruthy();
  });
});
