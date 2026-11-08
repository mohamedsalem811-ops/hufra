import {
  donationConfigResponseSchema,
  myDonationsResponseSchema,
  potholeCampaignResponseSchema,
  webHandoffResponseSchema,
  type DonationOpenMode,
} from '@hufra/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { useApi } from '@/api/api-provider';
import type { ApiClient } from '@/api/client';
import { API_URL } from '@/config/env';
import { useI18n } from '@/i18n/i18n-provider';
import type { Locale } from '@/i18n/locale';

import { useAuth } from '../auth/auth-provider';

/** The report's campaign (open one first), or null. Public. */
export function usePotholeCampaign(potholeId: number) {
  const { api } = useApi();
  return useQuery({
    queryKey: ['campaign', 'pothole', potholeId],
    enabled: Number.isInteger(potholeId) && potholeId > 0,
    queryFn: ({ signal }) => api.request(`/api/campaigns/by-pothole/${potholeId}`, { schema: potholeCampaignResponseSchema, auth: false, signal }),
  });
}

/** Whether donations are open and how this phone opens the page (set by the team in the admin panel). */
export function useDonationConfig() {
  const { api } = useApi();
  return useQuery({
    queryKey: ['donation-config'],
    staleTime: 5 * 60 * 1000,
    queryFn: ({ signal }) => api.request('/api/donations/config', { schema: donationConfigResponseSchema, auth: false, signal }),
  });
}

export function useMyDonations() {
  const { api } = useApi();
  const { state } = useAuth();
  const userId = state.status === 'signedIn' ? state.user.id : null;
  return useQuery({
    queryKey: ['my-donations', userId],
    enabled: userId !== null,
    queryFn: ({ signal }) => api.request('/api/donations/mine', { schema: myDonationsResponseSchema, signal }),
  });
}

/**
 * Website address for a donation page. Signed in: a one-time link that opens
 * the website already signed in (60 s, single use). Otherwise the plain page,
 * which asks the person to sign in. Never fails: falls back to the plain page.
 */
export async function donationUrl(api: ApiClient, path: string, signedIn: boolean): Promise<string> {
  if (signedIn) {
    try {
      const res = await api.request('/api/auth/web-handoff', { method: 'POST', body: { next: path }, schema: webHandoffResponseSchema });
      return res.url;
    } catch {
      // Fall through to the plain page.
    }
  }
  return `${API_URL}${path}`;
}

/** in_app: a browser sheet inside HUFRA; safari: the phone's own browser (Apple's rule 3.2.2 fallback). */
export function openModeFor(config: { open_mode: { ios: DonationOpenMode; android: DonationOpenMode } } | undefined): DonationOpenMode {
  if (!config) return Platform.OS === 'ios' ? 'safari' : 'in_app';
  return Platform.OS === 'ios' ? config.open_mode.ios : config.open_mode.android;
}

/** A donation page in the app's language: the website keeps English under /en (plan 9.2). */
export function donationPath(locale: Locale, path: string): string {
  return locale === 'en' ? `/en${path}` : path;
}

/** Opens a donation page on the website the way the team chose, then refreshes the numbers on return. */
export function useOpenDonationPage() {
  const { api } = useApi();
  const { state } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const config = useDonationConfig();
  const [opening, setOpening] = useState(false);

  const open = useCallback(
    async (path: string) => {
      setOpening(true);
      try {
        const url = await donationUrl(api, donationPath(locale, path), state.status === 'signedIn');
        if (openModeFor(config.data) === 'safari') {
          await Linking.openURL(url);
        } else {
          await WebBrowser.openBrowserAsync(url, {
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
            dismissButtonStyle: 'done',
            enableBarCollapsing: true,
          });
        }
      } finally {
        setOpening(false);
        for (const queryKey of [['campaign'], ['my-donations']]) void queryClient.invalidateQueries({ queryKey });
      }
    },
    [api, state.status, config.data, queryClient, locale],
  );
  return { open, opening };
}
