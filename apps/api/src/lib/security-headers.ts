// Plan 9.1: security headers for each surface the one Worker serves.
//
//   site    the website and the admin panel: static pages built by Astro and
//           Vite. Only this site's own files may run or load (no inline
//           scripts, nothing from other sites).
//   api     JSON, photos and map tiles: nothing in them may run or be framed.
//
// Static files never reach the Worker's code: Cloudflare serves them directly
// and applies apps/api/site/_headers, written from SITE_HEADERS below by
// scripts/assemble-site.ts. Pages the Worker builds itself (a shared report,
// the admin panel's fallback page, API answers) get the same headers from the
// middleware in src/index.tsx.

export type Surface = 'site' | 'api'

const csp = (rules: Record<string, string[]>) =>
  Object.entries(rules)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ')

export const CSP: Record<Surface, string> = {
  site: csp({
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'script-src-attr': ["'none'"],
    // Scripts set sizes on bars and the map library positions tiles with inline styles.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'manifest-src': ["'self'"],
    'worker-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }),
  api: csp({
    'default-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'none'"],
  }),
}

/** Headers every response carries, whatever the surface. */
export const COMMON_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

export function headersFor(surface: Surface): Record<string, string> {
  return {
    ...COMMON_HEADERS,
    'Content-Security-Policy': CSP[surface],
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // Nothing on the website uses the camera or location (reporting is in the app).
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  }
}

/** Which surface a path belongs to. */
export function surfaceFor(path: string): Surface {
  return /^\/(api|media|tiles)\//.test(path) ? 'api' : 'site'
}

/**
 * The _headers file for the static files. Cloudflare joins the values of a
 * header set by two matching rules, so the policy is set once for everything;
 * the paths below only add caching and indexing rules.
 */
export function staticHeadersFile(): string {
  const lines = (h: Record<string, string>) => Object.entries(h).map(([k, v]) => `  ${k}: ${v}`)
  return [
    '# Written by apps/api/scripts/assemble-site.ts from src/lib/security-headers.ts (plan 9.1). Do not edit.',
    '/*',
    ...lines(headersFor('site')),
    '',
    '# Website and admin panel files have hashed names: a new build is a new URL.',
    '/_astro/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/admin/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/admin',
    '  X-Robots-Tag: noindex, nofollow',
    '/admin/*',
    '  X-Robots-Tag: noindex, nofollow',
    '',
    '# Removes the old website\'s offline worker from browsers that still have it (plan 9.2).',
    '/sw.js',
    '  Cache-Control: no-cache',
    '',
  ].join('\n')
}
