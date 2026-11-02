import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AppProviders } from '@/app-shell/providers';

import { MapScreen } from './map-screen';
import { report } from './test-fixtures';

// MapLibre is native; under Jest it becomes plain views so the screen logic can run.
jest.mock('@maplibre/maplibre-react-native', () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories cannot use imports */
  const { View, Pressable } = require('react-native');
  const React = require('react');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    Map: ({ children }: { children: ReactNode }) => <View testID="map">{children}</View>,
    Camera: React.forwardRef(function Camera() {
      return null;
    }),
    UserLocation: () => null,
    ViewAnnotation: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => (
      <Pressable onPress={onPress}>{children}</Pressable>
    ),
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const reports = [
  report({ id: 1, status: 'reported', lng: 13.1, lat: 32.85, street_ar: 'شارع الجمهورية' }),
  report({ id: 2, status: 'fixed', lng: 13.3, lat: 32.95, street_ar: 'طريق الشط' }),
];

beforeEach(() => {
  globalThis.fetch = jest.fn(async (url: string) => {
    const body = String(url).includes('/api/regions')
      ? { results: [] }
      : { results: reports, limit: 500, offset: 0 };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
});

describe('MapScreen', () => {
  it('loads public reports for the visible area, shows pins and opens a preview', async () => {
    await render(
      <AppProviders locale="ar" themeMode="light">
        <MapScreen />
      </AppProviders>,
    );
    const pin = await screen.findByLabelText('تم الإبلاغ، شارع الجمهورية');
    expect(screen.getByLabelText('تم الإصلاح، طريق الشط')).toBeTruthy();

    const url = String((globalThis.fetch as jest.Mock).mock.calls.find(([u]) => String(u).includes('/api/potholes'))[0]);
    expect(url).toMatch(/\/api\/potholes\?bbox=[\d.%C,]+&limit=500$/);
    const init = (globalThis.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();

    await fireEvent.press(pin);
    expect(await screen.findByRole('button', { name: 'عرض التفاصيل' })).toBeTruthy();
  });

  it('filters by status from the chip row', async () => {
    await render(
      <AppProviders locale="ar" themeMode="light">
        <MapScreen />
      </AppProviders>,
    );
    await screen.findByLabelText('تم الإبلاغ، شارع الجمهورية');
    await fireEvent.press(screen.getByRole('button', { name: 'تم الإصلاح' }));
    await waitFor(() => expect(screen.queryByLabelText('تم الإبلاغ، شارع الجمهورية')).toBeNull());
    expect(screen.getByLabelText('تم الإصلاح، طريق الشط')).toBeTruthy();
  });
});
