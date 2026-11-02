import type { KeyValueStore } from '@/storage/secure';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStore {
  get(): Promise<SessionTokens | null>;
  set(tokens: SessionTokens): Promise<void>;
  clear(): Promise<void>;
}

const ACCESS = 'hufra.accessToken';
const REFRESH = 'hufra.refreshToken';

/** Session tokens in the Keychain / Keystore; a half-written pair counts as signed out. */
export function createTokenStore(store: KeyValueStore): TokenStore {
  return {
    async get() {
      const [accessToken, refreshToken] = await Promise.all([store.get(ACCESS), store.get(REFRESH)]);
      return accessToken && refreshToken ? { accessToken, refreshToken } : null;
    },
    async set({ accessToken, refreshToken }) {
      await store.set(REFRESH, refreshToken);
      await store.set(ACCESS, accessToken);
    },
    async clear() {
      await Promise.all([store.remove(ACCESS), store.remove(REFRESH)]);
    },
  };
}
