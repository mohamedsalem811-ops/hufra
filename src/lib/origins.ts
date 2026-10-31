// Which browser origins may call the API with a user's credentials.
//
// Allowed:
//   - the site's own origin (whatever domain is serving this request: the
//     production pages.dev domain, a preview deployment or a custom domain);
//   - the Capacitor native app shells (iOS: capacitor://localhost, Android:
//     https://localhost - see capacitor.config.ts), which call the production
//     API from a bundled page;
//   - local development servers;
//   - anything listed in the optional ALLOWED_ORIGINS variable
//     (comma-separated exact origins, e.g. "https://hufra.ly,https://www.hufra.ly").
//
// Everything else is refused. In particular there is no "*.pages.dev"
// wildcard: anyone can publish a site on pages.dev for free.

import type { Bindings } from './types'

const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost']

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8788',
  'http://127.0.0.1:8788',
]

const STATIC_ALLOWED = new Set([...NATIVE_APP_ORIGINS, ...DEV_ORIGINS])

function configuredOrigins(env: Partial<Bindings> | undefined): string[] {
  const raw = env?.ALLOWED_ORIGINS
  if (!raw) return []
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function isAllowedOrigin(origin: string, requestUrl: string, env?: Partial<Bindings>): boolean {
  if (!origin || origin === 'null') return false
  if (STATIC_ALLOWED.has(origin)) return true
  try {
    if (origin === new URL(requestUrl).origin) return true
  } catch {
    /* unparsable request URL: fall through */
  }
  return configuredOrigins(env).includes(origin)
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * True when a state-changing request comes from a web page we do not trust.
 * Browsers always send Origin on cross-origin POST/PATCH/DELETE, so this
 * blocks cross-site request forgery even where CORS would not (CORS only
 * stops the attacker reading the response, not the request being processed).
 * Requests without an Origin header (curl, server-to-server, native HTTP
 * clients) are not affected.
 */
export function isForbiddenCrossSiteWrite(
  method: string,
  origin: string | undefined,
  requestUrl: string,
  env?: Partial<Bindings>
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false
  if (!origin) return false
  return !isAllowedOrigin(origin, requestUrl, env)
}
