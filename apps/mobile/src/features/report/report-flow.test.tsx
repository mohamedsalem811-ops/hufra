import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppProviders } from '@/app-shell/providers';

import { authErrorKey } from '../auth/auth-forms';
import { ApiError } from '@/api/client';
import { ReportFlow } from './report-flow';

jest.mock('@maplibre/maplibre-react-native', () => ({ Map: () => null, Camera: () => null }));

beforeEach(() => {
  globalThis.fetch = jest.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
});

describe('ReportFlow', () => {
  it('asks a signed-out person to sign up or sign in first', async () => {
    const nav = { close: jest.fn(), signIn: jest.fn(), signUp: jest.fn(), openReport: jest.fn() };
    await render(
      <AppProviders locale="ar" themeMode="light">
        <ReportFlow nav={nav} />
      </AppProviders>,
    );
    expect(await screen.findByRole('header', { name: 'سجّل الدخول لترسل بلاغاً' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'إنشاء حساب' }));
    await fireEvent.press(screen.getByRole('button', { name: 'لديّ حساب، تسجيل الدخول' }));
    expect(nav.signUp).toHaveBeenCalledTimes(1);
    expect(nav.signIn).toHaveBeenCalledTimes(1);
  });
});

describe('authErrorKey', () => {
  it('turns server answers into plain sentences', () => {
    expect(authErrorKey(new ApiError('unauthorized', 'x', 401), 'signIn')).toBe('auth.error.invalid');
    expect(authErrorKey(new ApiError('http', 'x', 409), 'signUp')).toBe('auth.error.emailTaken');
    expect(authErrorKey(new ApiError('http', 'x', 400), 'signUp')).toBe('auth.error.weakPassword');
    expect(authErrorKey(new ApiError('http', 'x', 429), 'signIn')).toBe('auth.error.tooMany');
    expect(authErrorKey(new ApiError('network', 'x'), 'signIn')).toBe('error.network');
  });
});
