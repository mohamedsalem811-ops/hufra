import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { MapPin } from 'lucide-react-native';

import { loadOnboarded, saveOnboarded } from '@/app-shell/onboarding';
import { AppProviders } from '@/app-shell/providers';
import { interpolate } from '@/i18n/i18n-provider';
import { memoryStore } from '@/storage/secure';

import { PermissionStep } from './permission-step';
import { Welcome } from './welcome';

describe('Welcome', () => {
  it('shows the tagline, the three steps and starts on tap', async () => {
    const onStart = jest.fn();
    await render(
      <AppProviders locale="ar" themeMode="light">
        <Welcome onStart={onStart} />
      </AppProviders>,
    );
    expect(screen.getByRole('header', { name: 'كل حفرة لها موقع.' })).toBeTruthy();
    expect(screen.getByText('صوّر الحفرة')).toBeTruthy();
    expect(screen.getByText('حدّد موقعها')).toBeTruthy();
    expect(screen.getByText('تابعها حتى تُصلح')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'ابدأ' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('PermissionStep', () => {
  function renderStep(onAllow: () => Promise<unknown>) {
    const onDone = jest.fn();
    const onSkip = jest.fn();
    return {
      onDone,
      onSkip,
      view: render(
        <AppProviders locale="en" themeMode="light">
          <PermissionStep
            step={1}
            total={2}
            icon={MapPin}
            title="onboarding.location.title"
            body="onboarding.location.body"
            points={['onboarding.location.point1']}
            allowLabel="onboarding.location.allow"
            onAllow={onAllow}
            onDone={onDone}
            onSkip={onSkip}
          />
        </AppProviders>,
      ),
    };
  }

  it('explains first, asks on "Allow", then moves on', async () => {
    const onAllow = jest.fn(async () => 'granted');
    const { onDone, view } = renderStep(onAllow);
    await view;
    expect(screen.getByRole('header', { name: 'Your location puts the pothole in its place' })).toBeTruthy();
    expect(screen.getByLabelText('Step 1 of 2')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Allow location' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onAllow).toHaveBeenCalledTimes(1);
  });

  it('moves on without asking on "Not now", and moves on even if the prompt fails', async () => {
    const failing = jest.fn(async () => {
      throw new Error('prompt failed');
    });
    const { onDone, view } = renderStep(failing);
    await view;
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(failing).not.toHaveBeenCalled();
  });

  it('skips the rest', async () => {
    const { onSkip, view } = renderStep(jest.fn(async () => 'denied'));
    await view;
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('first-run flag and text placeholders', () => {
  it('is false until onboarding completes', async () => {
    const store = memoryStore();
    await expect(loadOnboarded(store)).resolves.toBe(false);
    await saveOnboarded(store);
    await expect(loadOnboarded(store)).resolves.toBe(true);
  });

  it('fills {placeholders}', () => {
    expect(interpolate('الخطوة {n} من {total}', { n: 1, total: 2 })).toBe('الخطوة 1 من 2');
    expect(interpolate('Hi {name}', {})).toBe('Hi {name}');
  });
});
