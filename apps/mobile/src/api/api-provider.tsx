import { QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';

import { API_URL } from '@/config/env';
import { secureStore } from '@/storage/secure';

import { createApiClient, type ApiClient } from './client';
import { createQueryClient } from './query-client';
import { createTokenStore, type TokenStore } from './token-store';

interface ApiValue {
  api: ApiClient;
  tokens: TokenStore;
}

const ApiContext = createContext<ApiValue | null>(null);

/** One API client and one query cache for the whole app. */
export function ApiProvider({ children }: { children: ReactNode }) {
  const [value] = useState<ApiValue>(() => {
    const tokens = createTokenStore(secureStore);
    return { tokens, api: createApiClient({ baseUrl: API_URL, tokens }) };
  });
  const [queryClient] = useState(createQueryClient);
  return (
    <ApiContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApi(): ApiValue {
  const value = useContext(ApiContext);
  if (!value) throw new Error('useApi must be used inside <ApiProvider>');
  return value;
}
