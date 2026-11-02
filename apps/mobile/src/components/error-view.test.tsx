import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/api/client';
import { AppProviders } from '@/app-shell/providers';

import { ErrorView, errorMessageKey } from './error-view';

describe('ErrorView', () => {
  it('explains a connection problem in plain words and offers a retry', async () => {
    const retry = jest.fn();
    await render(
      <AppProviders locale="ar" themeMode="light">
        <ErrorView error={new ApiError('network', 'x')} onRetry={retry} />
      </AppProviders>,
    );
    expect(screen.getByText('لا يوجد اتصال. تحقق من الإنترنت وحاول مرة أخرى.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'حاول مرة أخرى' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('never shows codes: every error maps to a sentence', () => {
    expect(errorMessageKey(new ApiError('timeout', 'x'))).toBe('error.timeout');
    expect(errorMessageKey(new ApiError('unauthorized', 'x', 401))).toBe('error.signedOut');
    expect(errorMessageKey(new ApiError('http', 'x', 500))).toBe('error.server');
    expect(errorMessageKey(new Error('render bug'))).toBe('error.body');
  });
});
