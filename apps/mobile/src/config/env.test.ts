import { DEFAULT_API_URL, resolveApiUrl } from './env';

describe('resolveApiUrl', () => {
  it('uses the live Worker when nothing is set', () => {
    expect(resolveApiUrl(undefined)).toBe(DEFAULT_API_URL);
    expect(resolveApiUrl('  ')).toBe(DEFAULT_API_URL);
  });

  it('accepts another server and drops a trailing slash', () => {
    expect(resolveApiUrl('http://192.168.1.10:8787/')).toBe('http://192.168.1.10:8787');
  });

  it('refuses something that is not a URL', () => {
    expect(() => resolveApiUrl('hufra.example')).toThrow(/http\(s\) URL/);
  });
});
