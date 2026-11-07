import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking, Text } from 'react-native';

import { AppProviders } from '@/app-shell/providers';

import { installedVersion, UpdateGate } from './update-gate';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const answer = (over: object) => ({ latest: '1.2.0', minimum: '1.0.0', update_required: false, update_available: true, store_url: 'https://play.google.com/store/apps/details?id=ly.hufra', ...over });

function show() {
  return render(
    <AppProviders locale="ar" themeMode="light">
      <UpdateGate>
        <Text>التطبيق</Text>
      </UpdateGate>
    </AppProviders>,
  );
}

describe('UpdateGate', () => {
  it('asks with this build’s version and platform', async () => {
    globalThis.fetch = jest.fn(async () => json(answer({}))) as unknown as typeof fetch;
    await show();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const url = String((globalThis.fetch as jest.Mock).mock.calls[0][0]);
    expect(url).toContain('/api/app/version?platform=');
    expect(url).toContain(`version=${installedVersion()}`);
    expect(screen.getByText('التطبيق')).toBeTruthy();
  });

  it('blocks a version that is too old and links to the store', async () => {
    globalThis.fetch = jest.fn(async () => json(answer({ update_required: true }))) as unknown as typeof fetch;
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await show();
    expect(await screen.findByText('يتوفر إصدار أحدث من حفرة')).toBeTruthy();
    expect(screen.queryByText('التطبيق')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'حدّث التطبيق' }));
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=ly.hufra');
  });

  it('never blocks when offline or the server fails', async () => {
    globalThis.fetch = jest.fn(async () => json({ error: 'x' }, 500)) as unknown as typeof fetch;
    await show();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.getByText('التطبيق')).toBeTruthy();
    expect(screen.queryByText('يتوفر إصدار أحدث من حفرة')).toBeNull();
  });
});
