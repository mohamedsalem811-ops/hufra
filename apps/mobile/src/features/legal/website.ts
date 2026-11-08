import * as WebBrowser from 'expo-web-browser';

import { API_URL } from '@/config/env';
import type { Locale } from '@/i18n/locale';

/** A page of the HUFRA website in the app's language (Arabic has no prefix, English lives under /en). */
export function websiteUrl(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === 'ar') return `${API_URL}${clean}`;
  return `${API_URL}${clean === '/' ? '/en' : `/en${clean}`}`;
}

/** Opens a website page in the in-app browser; failing to open is never an error screen. */
export function openWebsite(locale: Locale, path: string): void {
  void WebBrowser.openBrowserAsync(websiteUrl(locale, path)).catch(() => undefined);
}
