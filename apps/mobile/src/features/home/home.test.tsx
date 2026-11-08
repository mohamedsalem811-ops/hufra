import * as WebBrowser from 'expo-web-browser';
import type {
  CountersResponse,
  PublicPotholeListItem,
  RecentFixedResponse,
  TopDonorResponse,
  TopReporterResponse,
} from '@hufra/contracts';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppProviders } from '@/app-shell/providers';
import * as permissions from '@/permissions/permissions';

import { report } from '../map/test-fixtures';
import { cityNumbers, formatDistance, formatLyd, nearbyOpen } from './home-logic';
import { HomeScreen } from './home-screen';

const mockRouter = { push: jest.fn(), navigate: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock('@/permissions/permissions', () => ({
  hasLocationPermission: jest.fn(async () => true),
  requestLocation: jest.fn(async () => 'granted'),
  currentPosition: jest.fn(async () => ({ latitude: 32.88721, longitude: 13.19134 })),
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
interface HomeFixture {
  counters: CountersResponse;
  recent: RecentFixedResponse;
  reporter: TopReporterResponse;
  donor: TopDonorResponse;
  near: { results: PublicPotholeListItem[]; limit: number; offset: number };
}
const empty: HomeFixture = {
  counters: { totals: { total: 0, fixed: null, reported: null, verified: null, under_repair: null }, by_region: [], avg_response_days: null },
  recent: { results: [] },
  reporter: { reporter: null },
  donor: { donor: null },
  near: { results: [], limit: 50, offset: 0 },
};
let data: HomeFixture = empty;
let partners: unknown[] = [];

function mockFetch() {
  globalThis.fetch = jest.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/counters')) return json(data.counters);
    if (u.includes('/recent-fixed')) return json(data.recent);
    if (u.includes('/top-reporter')) return json(data.reporter);
    if (u.includes('/donors/top')) return json(data.donor);
    if (u.includes('/api/partners?place=app')) return json({ results: partners });
    if (u.includes('near_lat')) return json(data.near);
    return json({ error: 'x' }, 404);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  data = empty;
  partners = [];
  mockFetch();
});

const show = () =>
  render(
    <AppProviders locale="ar" themeMode="light">
      <HomeScreen />
    </AppProviders>,
  );

describe('home logic', () => {
  it('adds reported and verified into "waiting"', () => {
    expect(cityNumbers({ ...empty.counters, totals: { total: 9, reported: 3, verified: 2, under_repair: 1, fixed: 3 } })).toEqual({
      waiting: 5,
      underRepair: 1,
      fixed: 3,
    });
    expect(cityNumbers(undefined)).toEqual({ waiting: 0, underRepair: 0, fixed: 0 });
  });

  it('keeps open reports, nearest first', () => {
    const list = [
      report({ id: 1, distance_m: 900 }),
      report({ id: 2, distance_m: 100, status: 'fixed' }),
      report({ id: 3, distance_m: 300 }),
    ];
    expect(nearbyOpen(list).map((r) => r.id)).toEqual([3, 1]);
  });

  it('formats distances and money', () => {
    expect(formatDistance(346, 'ar')).toBe('350 م');
    expect(formatDistance(3, 'en')).toBe('10 m');
    expect(formatDistance(1249, 'ar')).toBe('1.2 كم');
    expect(formatLyd(1250, 'ar')).toBe('1,250 د.ل');
    expect(formatLyd(99.5, 'en')).toBe('LYD 99.5');
  });
});

describe('HomeScreen', () => {
  it('invites instead of apologising when the city has no data yet', async () => {
    await show();
    expect(await screen.findByText('لم تُصلح أي حفرة بعد. كل بلاغ يقرّبنا من أول إصلاح.')).toBeTruthy();
    expect(await screen.findByText('لا توجد بلاغات مفتوحة قريبة منك. شفت حفرة في طريقك؟')).toBeTruthy();
    expect(screen.getByText('بلّغ عن أول حفرة، وقد يظهر اسمك هنا.')).toBeTruthy();
    expect(screen.getByText('دعم الإصلاحات بالتبرع يبدأ قريباً.')).toBeTruthy();
    expect(screen.getByLabelText('بانتظار الإصلاح: 0')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'بلّغ عن حفرة' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/new-report');
  });

  it('shows city numbers, recent repairs, nearby reports and top people', async () => {
    data = {
      counters: { ...empty.counters, totals: { total: 12, reported: 4, verified: 3, under_repair: 2, fixed: 3 }, avg_response_days: 4.4 },
      recent: {
        results: [
          {
            id: 7,
            street_ar: 'طريق الشط',
            street_en: null,
            fixed_at: '2026-11-01T09:00:00.000Z',
            created_at: '2026-10-25T09:00:00.000Z',
            region_name_ar: 'سوق الجمعة',
            region_name_en: 'Souq Al Juma',
            before_thumb_key: 'a.webp',
            after_thumb_key: 'b.webp',
          },
        ],
      },
      reporter: { reporter: { name: 'سالم', report_count: 14 } },
      donor: { donor: { id: 1, name: 'شركة الأمل', amount_lyd: 5000, note: null } },
      near: { results: [report({ id: 3, street_ar: 'شارع الجمهورية', distance_m: 346, severity: 'severe' })], limit: 50, offset: 0 },
    };
    await show();
    expect(await screen.findByLabelText('بانتظار الإصلاح: 7')).toBeTruthy();
    expect(screen.getByLabelText('تم إصلاحه: 3')).toBeTruthy();
    expect(screen.getByText('متوسط مدة الإصلاح: 4 أيام')).toBeTruthy();
    expect(await screen.findByText('سالم')).toBeTruthy();
    expect(screen.getByText('عدد البلاغات: 14')).toBeTruthy();
    expect(screen.getByText('5,000 د.ل')).toBeTruthy();
    expect(await screen.findByText('350 م · خطيرة')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'تم الإصلاح، طريق الشط، سوق الجمعة' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/pothole/[id]', params: { id: '7' } });
    await fireEvent.press(screen.getByRole('button', { name: 'عرض الكل' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/map', params: { status: 'fixed' } });

    // The position is rounded (~100 m) before it is sent.
    const nearUrl = String((globalThis.fetch as jest.Mock).mock.calls.find(([u]) => String(u).includes('near_lat'))[0]);
    expect(nearUrl).toContain('near_lat=32.887&near_lng=13.191&radius_m=2000');
  });

  it('shows the partners the team chose for the app, with their funded repairs', async () => {
    partners = [
      { id: 1, name_ar: 'مصرف الجمهورية', name_en: 'Jumhouria Bank', description_ar: '', description_en: '', website: 'https://bank.ly', kind: 'repair_sponsor', logo_key: null, featured: true, funded_count: 3, funded_lyd: 2400 },
    ];
    await show();
    expect(await screen.findByRole('header', { name: 'شركاؤنا' })).toBeTruthy();
    expect(screen.getByText('موّل إصلاح 3 حفر')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'مصرف الجمهورية' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://bank.ly');
  });

    it('asks for location when it is off', async () => {
    jest.mocked(permissions.hasLocationPermission).mockResolvedValueOnce(false);
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: 'السماح بالموقع' }));
    expect(permissions.requestLocation).toHaveBeenCalled();
    expect(await screen.findByText('لا توجد بلاغات مفتوحة قريبة منك. شفت حفرة في طريقك؟')).toBeTruthy();
  });
});
