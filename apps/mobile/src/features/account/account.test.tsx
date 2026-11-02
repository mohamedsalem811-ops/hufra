import type { MyPotholesResponse, Notification } from '@hufra/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { Alert, type AlertButton } from 'react-native';

import { AppProviders } from '@/app-shell/providers';

import { report } from '../map/test-fixtures';
import { filterMine, MyReportsScreen } from '../my-reports/my-reports-screen';
import { SettingsScreen } from '../settings/settings-screen';
import { AccountScreen } from './account-screen';
import { groupInbox, inboxTime } from './inbox';
import { NotificationsScreen } from './notifications-screen';
import { readNotification } from './use-account';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  // Settings re-reads permissions on focus; under test, "focus" is mount.
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use imports
    require('react').useEffect(cb, [cb]);
  },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-file-system', () => ({
  File: jest.fn((...parts: unknown[]) => ({
    uri: parts.map(String).join('/'),
    exists: false,
    create: jest.fn(),
    write: jest.fn(),
    delete: jest.fn(),
  })),
  Directory: jest.fn(() => ({ exists: false, create: jest.fn(), delete: jest.fn() })),
  Paths: { document: 'file:///documents', cache: 'file:///cache' },
}));
jest.mock('@/permissions/permissions', () => ({
  permissionStates: jest.fn(async () => ({ location: 'granted', camera: 'undetermined', notifications: 'denied' })),
  hasLocationPermission: jest.fn(async () => false),
  requestLocation: jest.fn(async () => 'denied'),
  currentPosition: jest.fn(async () => null),
}));

type Mine = MyPotholesResponse['results'][number];
const mine = (over: Partial<Mine> & { id: number }): Mine => ({
  ...report(over),
  reporter_id: 9,
  reporter_contact: null,
  client_report_uuid: null,
  ...over,
});
const note = (id: number, created_at: string, read_at: string | null, payload: object): Notification => ({
  id,
  target_role: null,
  target_user_id: 9,
  type: 'status_change',
  payload_json: JSON.stringify(payload),
  created_at,
  read_at,
});
const me = {
  user: { id: 9, email: 'salem@example.ly', code: 'HF-9', role: 'user', locale: 'ar', display_name: 'سالم', totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z' },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let myList: Mine[] = [];
let inbox: Notification[] = [];
function mockFetch() {
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/api/auth/me')) return json(me);
    if (u.endsWith('/api/potholes/mine/list')) return json({ results: myList });
    if (u.endsWith('/api/notifications')) return json({ results: inbox, unread_count: inbox.filter((n) => !n.read_at).length });
    if (u.endsWith('/api/notifications/read-all')) return json({ ok: true });
    if (u.endsWith('/api/auth/me/export')) return json({ user: me.user, reports: [] });
    if (u.endsWith('/api/auth/me/delete') && init?.method === 'POST') return json({ ok: true });
    if (u.endsWith('/api/auth/logout')) return json({ ok: true });
    return json({ error: 'x' }, 404);
  }) as unknown as typeof fetch;
}
const calls = () => (globalThis.fetch as jest.Mock).mock.calls.map(([u]) => String(u));

async function signIn() {
  await SecureStore.setItemAsync('hufra.accessToken', 'access');
  await SecureStore.setItemAsync('hufra.refreshToken', 'refresh');
}

beforeEach(async () => {
  jest.clearAllMocks();
  await SecureStore.deleteItemAsync('hufra.accessToken');
  await SecureStore.deleteItemAsync('hufra.refreshToken');
  myList = [];
  inbox = [];
  mockFetch();
});

const show = (ui: React.ReactElement) =>
  render(
    <AppProviders locale="ar" themeMode="light">
      {ui}
    </AppProviders>,
  );

describe('inbox logic', () => {
  const now = new Date('2026-11-02T12:00:00');
  it('groups by today, this week and earlier', () => {
    const items = [
      note(1, new Date('2026-11-02T11:30:00').toISOString(), null, {}),
      note(2, new Date('2026-10-30T09:00:00').toISOString(), null, {}),
      note(3, new Date('2026-10-01T09:00:00').toISOString(), null, {}),
    ];
    expect(groupInbox(items, now).map((g) => [g.group, g.items.map((n) => n.id)])).toEqual([
      ['today', [1]],
      ['week', [2]],
      ['earlier', [3]],
    ]);
  });

  it('says how long ago, in words', () => {
    const t = (k: string, v?: Record<string, string | number>) => `${k}${v ? `:${v.n}` : ''}`;
    expect(inboxTime(new Date('2026-11-02T11:59:40').toISOString(), 'ar', t as never, now)).toBe('time.justNow');
    expect(inboxTime(new Date('2026-11-02T11:15:00').toISOString(), 'ar', t as never, now)).toBe('time.minutes:45');
    expect(inboxTime(new Date('2026-11-02T08:00:00').toISOString(), 'ar', t as never, now)).toBe('time.hours:4');
  });

  it('reads the stored copy in the right language, with a fallback', () => {
    const payload = JSON.stringify({ title_ar: 'تحديث', title_en: 'Update', body_en: 'Now fixed', pothole_id: 5 });
    expect(readNotification(payload, 'ar')).toEqual({ title: 'تحديث', body: 'Now fixed', potholeId: 5 });
    expect(readNotification('not json', 'en')).toEqual({ title: '', body: '', potholeId: null });
  });

  it('filters my reports into open and fixed', () => {
    const list = [mine({ id: 1, status: 'reported' }), mine({ id: 2, status: 'fixed' }), mine({ id: 3, status: 'under_repair' })];
    expect(filterMine(list, 'open').map((r) => r.id)).toEqual([1, 3]);
    expect(filterMine(list, 'fixed').map((r) => r.id)).toEqual([2]);
    expect(filterMine(list, 'all')).toHaveLength(3);
  });
});

describe('AccountScreen', () => {
  it('invites a signed-out person to sign in', async () => {
    await show(<AccountScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'تسجيل الدخول' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/auth/sign-in');
    expect(screen.queryByText('حذف حسابي')).toBeNull();
  });

  it('shows the person, their numbers and unread notifications', async () => {
    await signIn();
    myList = [mine({ id: 1, status: 'fixed', upvotes_count: 2 }), mine({ id: 2, status: 'reported', upvotes_count: 3 })];
    inbox = [note(1, new Date().toISOString(), null, { title_ar: 'تحديث' })];
    await show(<AccountScreen />);
    expect(await screen.findByText('سالم')).toBeTruthy();
    expect(screen.getByText('salem@example.ly')).toBeTruthy();
    expect(screen.getByText('رمزك: HF-9')).toBeTruthy();
    expect(await screen.findByLabelText('بلاغ: 2')).toBeTruthy();
    expect(screen.getByLabelText('أُصلح: 1')).toBeTruthy();
    expect(screen.getByLabelText('تأكيد: 5')).toBeTruthy();
    expect(await screen.findByText('1 جديدة')).toBeTruthy();
  });

  it('exports my data as a file through the share sheet', async () => {
    await signIn();
    await show(<AccountScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /^تنزيل نسخة من بياناتي/ }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(jest.mocked(Sharing.shareAsync).mock.calls[0][0]).toMatch(/^file:\/\/\/cache\/hufra-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('deletes the account only after a clear warning, then signs out on this phone', async () => {
    await signIn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await show(<AccountScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'حذف حسابي' }));
    expect(alert).toHaveBeenCalledWith('حذف حسابك نهائياً؟', expect.stringContaining('لا يمكن التراجع'), expect.any(Array));
    expect(calls().some((u) => u.endsWith('/me/delete'))).toBe(false);

    const buttons = alert.mock.calls[0][2] as AlertButton[];
    buttons.find((b) => b.style === 'destructive')!.onPress!();
    await waitFor(() => expect(alert).toHaveBeenLastCalledWith('حُذف حسابك. شكراً لأنك ساعدت في إصلاح طرق مدينتك.'));
    expect(calls().filter((u) => u.endsWith('/me/delete'))).toHaveLength(1);
    // The server already ended the session: no logout call, tokens gone locally.
    expect(calls().some((u) => u.endsWith('/logout'))).toBe(false);
    expect(await SecureStore.getItemAsync('hufra.accessToken')).toBeNull();
    expect(await screen.findByRole('button', { name: 'تسجيل الدخول' })).toBeTruthy();
    alert.mockRestore();
  });
});

describe('MyReportsScreen', () => {
  it('invites a first report when there is none', async () => {
    await signIn();
    await show(<MyReportsScreen />);
    expect(await screen.findByText('لا بلاغات بعد')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'بلّغ عن حفرة' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/new-report');
  });

  it('lists sent reports with open/fixed filters', async () => {
    await signIn();
    myList = [mine({ id: 1, status: 'fixed', street_ar: 'طريق الشط' }), mine({ id: 2, status: 'verified', street_ar: 'شارع الجمهورية' })];
    await show(<MyReportsScreen />);
    expect(await screen.findByText('طريق الشط')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'أُصلحت 1' }));
    expect(screen.queryByText('شارع الجمهورية')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'مفتوحة 1' }));
    expect(screen.getByText('شارع الجمهورية')).toBeTruthy();
    await fireEvent.press(screen.getByText('شارع الجمهورية'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/pothole/[id]', params: { id: '2' } });
  });
});

describe('NotificationsScreen', () => {
  it('shows notifications, opens the report, and marks all read', async () => {
    await signIn();
    inbox = [note(1, new Date().toISOString(), null, { title_ar: 'تحديث حالة البلاغ #4', body_ar: 'أصبحت حالة بلاغك الآن: تم الإصلاح', pothole_id: 4 })];
    await show(<NotificationsScreen />);
    expect(await screen.findByText('اليوم')).toBeTruthy();
    await fireEvent.press(screen.getByText('تحديث حالة البلاغ #4'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/pothole/[id]', params: { id: '4' } });
    await fireEvent.press(screen.getByRole('button', { name: 'قراءة الكل' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'قراءة الكل' })).toBeNull());
    expect(calls().some((u) => u.endsWith('/read-all'))).toBe(true);
  });

  it('explains an empty inbox', async () => {
    await signIn();
    await show(<NotificationsScreen />);
    expect(await screen.findByText('لا إشعارات بعد. سنخبرك هنا عندما تتغير حالة أحد بلاغاتك.')).toBeTruthy();
  });
});

describe('SettingsScreen', () => {
  it('saves the text size and shows permission states', async () => {
    await show(<SettingsScreen />);
    expect(await screen.findByText('مسموح')).toBeTruthy();
    expect(screen.getByText('لم يُطلب بعد')).toBeTruthy();
    expect(screen.getByText('غير مسموح')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'أكبر' }));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('hufra.textSize', 'larger');
    expect(screen.getByRole('radio', { name: 'أكبر' }).props.accessibilityState).toMatchObject({ checked: true });
  });
});
