import { render, screen } from '@testing-library/react-native';

import { AppProviders } from '@/app-shell/providers';
import { ErrorView } from '@/components/error-view';
import { ApiError } from '@/api/client';

import { Welcome } from './welcome';

describe('Welcome', () => {
  it('shows the Arabic name, tagline and the switch to English', async () => {
    await render(
      <AppProviders locale="ar" themeMode="light">
        <Welcome />
      </AppProviders>,
    );
    expect(screen.getByRole('header', { name: 'حفرة' })).toBeTruthy();
    expect(screen.getByText('كل حفرة لها موقع.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'التبديل إلى الإنجليزية' })).toBeTruthy();
  });

  it('shows English text when the language is English', async () => {
    await render(
      <AppProviders locale="en" themeMode="dark">
        <Welcome />
      </AppProviders>,
    );
    expect(screen.getByRole('header', { name: 'HUFRA' })).toBeTruthy();
    expect(screen.getByText('Every pothole has a place.')).toBeTruthy();
  });
});

describe('ErrorView', () => {
  it('explains a connection problem in plain words and offers a retry', async () => {
    const retry = jest.fn();
    await render(
      <AppProviders locale="ar" themeMode="light">
        <ErrorView error={new ApiError('network', 'x')} onRetry={retry} />
      </AppProviders>,
    );
    expect(screen.getByText('لا يوجد اتصال. تحقق من الإنترنت وحاول مرة أخرى.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'حاول مرة أخرى' })).toBeTruthy();
  });
});
