import { render } from '@testing-library/react-native';

import { DEFAULT_API_URL } from '@/config/env';

import { SharedLinkRedirect } from './shared-link';

const mockParams: { id?: string } = {};
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Redirect: (props: { href: unknown }) => {
    mockRedirect(props.href);
    return null;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- app.config.js is CommonJS
const appConfig = require('../../../app.config.js') as {
  DEFAULT_SITE: string;
  sharedLinkFilters: (url: string) => { autoVerify: boolean; data: { scheme: string; host: string; pathPrefix: string }[] }[];
};

describe('shared report links', () => {
  beforeEach(() => mockRedirect.mockClear());

  it('opens the report from /r/<id>', async () => {
    mockParams.id = '1042';
    await render(<SharedLinkRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith({ pathname: '/pothole/[id]', params: { id: '1042' } });
  });

  it('goes home for anything that is not a report number', async () => {
    for (const id of ['0', 'abc', '12a', undefined]) {
      mockParams.id = id;
      await render(<SharedLinkRedirect />);
      expect(mockRedirect).toHaveBeenLastCalledWith('/');
    }
  });

  it('asks Android to open /r/ links on the app’s own server, verified', () => {
    expect(appConfig.DEFAULT_SITE).toBe(DEFAULT_API_URL);
    const [filter] = appConfig.sharedLinkFilters(DEFAULT_API_URL);
    expect(filter.autoVerify).toBe(true);
    expect(filter.data).toEqual([
      { scheme: 'https', host: new URL(DEFAULT_API_URL).host, pathPrefix: '/r/' },
      { scheme: 'https', host: new URL(DEFAULT_API_URL).host, pathPrefix: '/en/r/' },
    ]);
    // A plain-HTTP test server (end-to-end builds) gets no App Links.
    expect(appConfig.sharedLinkFilters('http://10.0.2.2:8788')).toEqual([]);
  });
});
