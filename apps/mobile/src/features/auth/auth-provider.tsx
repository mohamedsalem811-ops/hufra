import { loginResponseSchema, meResponseSchema, registerResponseSchema } from '@hufra/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';

import { useApi } from '@/api/api-provider';
import { ApiError } from '@/api/client';
import type { Locale } from '@/i18n/locale';

export interface SessionUser {
  id: number;
  email: string;
  display_name: string | null;
  /** Public short code (shown instead of a name when there is none). */
  code?: string;
}

type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser };

interface AuthValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; displayName?: string; locale: Locale }) => Promise<void>;
  signOut: (options?: { remote?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Session for the app. Tokens live in the Keychain/Keystore (API client);
 * this keeps who is signed in. On start it asks /api/auth/me once; while
 * offline it trusts the saved tokens so the person stays signed in.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { api, tokens, onSignedOut } = useApi();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => onSignedOut(() => setState({ status: 'signedOut' })), [onSignedOut]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await tokens.get())) return setState({ status: 'signedOut' });
      try {
        const { user } = await api.request('/api/auth/me', { schema: meResponseSchema });
        if (!cancelled) setState({ status: 'signedIn', user });
      } catch (err) {
        if (cancelled) return;
        // Offline at start: keep the session (tokens are still saved); other errors sign out.
        if (err instanceof ApiError && (err.kind === 'network' || err.kind === 'timeout')) {
          setState({ status: 'signedIn', user: { id: 0, email: '', display_name: null } });
        } else {
          setState({ status: 'signedOut' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, tokens]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.request('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        schema: loginResponseSchema,
        auth: false,
      });
      if (!res.access_token || !res.refresh_token) throw new ApiError('invalid_response', 'Login returned no tokens');
      await tokens.set({ accessToken: res.access_token, refreshToken: res.refresh_token });
      setState({ status: 'signedIn', user: res.user });
    },
    [api, tokens],
  );

  const signUp = useCallback<AuthValue['signUp']>(
    async ({ email, password, displayName, locale }) => {
      await api.request('/api/auth/register', {
        method: 'POST',
        body: { email, password, locale, display_name: displayName || undefined, consent: true },
        schema: registerResponseSchema,
        auth: false,
      });
      await signIn(email, password);
    },
    [api, signIn],
  );

  /**
   * Forget the session on this phone. `remote: false` skips telling the server
   * (after deleting the account, the server has already ended every session).
   */
  const signOut = useCallback(async ({ remote = true }: { remote?: boolean } = {}) => {
    const session = await tokens.get();
    if (session && remote) {
      // Best effort: tell the server to retire the refresh token, then forget locally either way.
      await api
        .request('/api/auth/logout', {
          method: 'POST',
          body: { refresh_token: session.refreshToken },
          schema: z.unknown(),
        })
        .catch(() => {});
    }
    await tokens.clear();
    // Nothing personal may outlive the session: own reports, inbox, per-person report details.
    for (const queryKey of [['me'], ['my-reports'], ['notifications'], ['pothole']]) queryClient.removeQueries({ queryKey });
    setState({ status: 'signedOut' });
  }, [api, tokens, queryClient]);

  const value = useMemo(() => ({ state, signIn, signUp, signOut }), [state, signIn, signUp, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
