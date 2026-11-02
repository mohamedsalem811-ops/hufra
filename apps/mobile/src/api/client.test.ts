import { z } from 'zod';

import { memoryStore } from '@/storage/secure';

import { ApiError, createApiClient } from './client';
import { createTokenStore } from './token-store';

const okSchema = z.strictObject({ ok: z.literal(true) });
const BASE = 'https://api.test';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function setup(initialTokens?: { accessToken: string; refreshToken: string }) {
  const tokens = createTokenStore(memoryStore());
  if (initialTokens) await tokens.set(initialTokens);
  const fetchFn = jest.fn<Promise<Response>, [string, RequestInit]>();
  const onSignedOut = jest.fn();
  const api = createApiClient({ baseUrl: BASE, tokens, fetchFn: fetchFn as unknown as typeof fetch, onSignedOut });
  return { api, tokens, fetchFn, onSignedOut };
}

const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe('API client', () => {
  it('sends the access token and validates the response with the contract schema', async () => {
    const { api, fetchFn } = await setup({ accessToken: 'A1', refreshToken: 'R1' });
    fetchFn.mockResolvedValueOnce(json(200, { ok: true }));

    await expect(api.request('/api/thing', { schema: okSchema })).resolves.toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/api/thing`);
    expect(header(init, 'Authorization')).toBe('Bearer A1');
  });

  it('rejects a response that does not match the schema', async () => {
    const { api, fetchFn } = await setup();
    fetchFn.mockResolvedValueOnce(json(200, { ok: true, extra: 'field' }));
    await expect(api.request('/api/thing', { schema: okSchema })).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('keeps the server wording for errors', async () => {
    const { api, fetchFn } = await setup();
    fetchFn.mockResolvedValueOnce(json(422, { error: 'Bad street', error_ar: 'شارع غير صالح' }));
    const err = await api.request('/api/thing', { schema: okSchema, auth: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: 'http', status: 422, serverMessage: { en: 'Bad street', ar: 'شارع غير صالح' } });
  });

  it('turns a failed fetch into a network error', async () => {
    const { api, fetchFn } = await setup();
    fetchFn.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(api.request('/api/thing', { schema: okSchema })).rejects.toMatchObject({ kind: 'network' });
  });

  it('refreshes once on 401, stores the rotated tokens and retries', async () => {
    const { api, tokens, fetchFn } = await setup({ accessToken: 'A1', refreshToken: 'R1' });
    fetchFn
      .mockResolvedValueOnce(json(401, { error: 'expired' }))
      .mockResolvedValueOnce(json(200, { access_token: 'A2', refresh_token: 'R2' }))
      .mockResolvedValueOnce(json(200, { ok: true }));

    await expect(api.request('/api/thing', { schema: okSchema })).resolves.toEqual({ ok: true });
    const refreshCall = fetchFn.mock.calls[1];
    expect(refreshCall[0]).toBe(`${BASE}/api/auth/refresh`);
    expect(JSON.parse(String(refreshCall[1].body))).toEqual({ refresh_token: 'R1' });
    expect(header(fetchFn.mock.calls[2][1], 'Authorization')).toBe('Bearer A2');
    await expect(tokens.get()).resolves.toEqual({ accessToken: 'A2', refreshToken: 'R2' });
  });

  it('shares one refresh between parallel 401s (the server rejects a reused refresh token)', async () => {
    const { api, fetchFn } = await setup({ accessToken: 'A1', refreshToken: 'R1' });
    let refreshCalls = 0;
    fetchFn.mockImplementation(async (url, init) => {
      if (url.endsWith('/api/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { access_token: 'A2', refresh_token: 'R2' });
      }
      return header(init, 'Authorization') === 'Bearer A2' ? json(200, { ok: true }) : json(401, { error: 'expired' });
    });

    const results = await Promise.all([1, 2, 3].map(() => api.request('/api/thing', { schema: okSchema })));
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
  });

  it('signs out when the refresh token is rejected', async () => {
    const { api, tokens, fetchFn, onSignedOut } = await setup({ accessToken: 'A1', refreshToken: 'R1' });
    fetchFn.mockResolvedValueOnce(json(401, { error: 'expired' })).mockResolvedValueOnce(json(401, { error: 'reused' }));

    await expect(api.request('/api/thing', { schema: okSchema })).rejects.toMatchObject({ kind: 'unauthorized' });
    await expect(tokens.get()).resolves.toBeNull();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the refresh fails because the phone is offline', async () => {
    const { api, tokens, fetchFn, onSignedOut } = await setup({ accessToken: 'A1', refreshToken: 'R1' });
    fetchFn.mockResolvedValueOnce(json(401, { error: 'expired' })).mockRejectedValueOnce(new TypeError('offline'));

    await expect(api.request('/api/thing', { schema: okSchema })).rejects.toMatchObject({ kind: 'network' });
    await expect(tokens.get()).resolves.toEqual({ accessToken: 'A1', refreshToken: 'R1' });
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('does not send a token or refresh for public calls', async () => {
    const { api, fetchFn } = await setup({ accessToken: 'A1', refreshToken: 'R1' });
    fetchFn.mockResolvedValueOnce(json(401, { error: 'nope' }));
    await expect(api.request('/api/public', { schema: okSchema, auth: false })).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(header(fetchFn.mock.calls[0][1], 'Authorization')).toBeUndefined();
  });
});
