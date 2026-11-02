import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppProviders } from '@/app-shell/providers';

import { TabBar, type BottomTabBarProps } from './tab-bar';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const names = ['index', 'map', 'report', 'my-reports', 'account'];

function props(index: number) {
  const emit = jest.fn(() => ({ defaultPrevented: false }));
  const navigateToTab = jest.fn();
  const p = {
    state: { index, routes: names.map((name) => ({ key: `${name}-key`, name, params: undefined })) },
    emitter: { emit },
    navigateToTab,
    descriptors: {},
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as unknown as BottomTabBarProps;
  return { p, emit, navigateToTab };
}

describe('TabBar', () => {
  it('shows the five tabs from the design with the current one selected', async () => {
    const { p } = props(0);
    await render(
      <AppProviders locale="ar" themeMode="light">
        <TabBar {...p} />
      </AppProviders>,
    );
    for (const label of ['الرئيسية', 'الخريطة', 'بلّغ', 'بلاغاتي', 'حسابي']) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('tab', { name: 'الرئيسية', selected: true })).toBeTruthy();
  });

  it('goes to a tab on press, but not to the one already open', async () => {
    const { p, navigateToTab, emit } = props(0);
    await render(
      <AppProviders locale="en" themeMode="light">
        <TabBar {...p} />
      </AppProviders>,
    );
    await fireEvent.press(screen.getByRole('tab', { name: 'Map' }));
    expect(navigateToTab).toHaveBeenCalledWith('map-key');
    await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
    expect(emit).toHaveBeenCalledTimes(2);
    expect(navigateToTab).toHaveBeenCalledTimes(1);
  });

  it('opens reporting full screen instead of switching tab', async () => {
    const { p, navigateToTab } = props(0);
    await render(
      <AppProviders locale="en" themeMode="light">
        <TabBar {...p} />
      </AppProviders>,
    );
    await fireEvent.press(screen.getByRole('tab', { name: 'Report' }));
    expect(mockPush).toHaveBeenCalledWith('/new-report');
    expect(navigateToTab).not.toHaveBeenCalled();
  });
});
