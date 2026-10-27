# HUFRA — Security

This document covers the current authentication/authorization model, the
data-protection measures in place, the security headers configuration, and
a log of security-relevant decisions (including the cancellation of
mandatory admin 2FA).

## 1. Authentication

- **Password storage**: hashed with a salted, iterated algorithm
  (`src/lib/password.ts`, `hashPassword`/`verifyPassword`). Plaintext
  passwords are never stored or logged.
- **Sessions**: short-lived (15 min) HS256 JWT access tokens
  (`src/lib/jwt.ts`), refreshed via a long-lived (30 day) refresh token.
  Both travel as HttpOnly, `SameSite=Lax` cookies (`Secure` added
  automatically when served over HTTPS) — **or** as an `Authorization:
  Bearer` header for API/script clients. HttpOnly prevents the tokens from
  being read by page JavaScript (XSS mitigation for session theft).
- **Login rate limiting**: `checkRateLimit` (`src/lib/rate-limit.ts`, KV-backed)
  throttles `/api/auth/login` per client IP to slow down credential
  stuffing / brute force.
- **RBAC**: `requireRole('admin' | 'super_admin')` middleware
  (`src/middleware/auth.ts`) gates every admin/super_admin-only route.
  Role is read from the signed JWT only — never trusted from any
  client-supplied field.

## 2. Mandatory admin 2FA — cancelled

**Decision (explicit user request, this task): mandatory TOTP-based 2FA for
admin/super_admin accounts has been removed.** Previously:

- `/api/auth/login` refused to issue a normal access token to an admin
  account until `totp_enabled = 1`, and required a valid 6-digit
  `totp_code` on every subsequent login once enrolled.
- A `typ:'totp_setup'` short-lived bootstrap JWT plus a dedicated
  `requireAuthOrTotpSetup` middleware existed solely to work around a
  structural deadlock: enabling 2FA required being authenticated, but
  mandatory 2FA blocked a brand-new admin from ever getting a normal,
  authenticated session in the first place.

**What changed:**

- `src/routes/auth.ts` — `/login` no longer checks `totp_enabled`/`totp_code`
  for any role; it issues access+refresh tokens to any correct
  email+password pair, same as a regular user. The `/2fa/setup` and
  `/2fa/verify` routes and the `requireAuthOrTotpSetup` middleware were
  removed entirely (both now 404).
- `src/lib/jwt.ts` — the `typ:'totp_setup'` token type and
  `TOTP_SETUP_TOKEN_TTL_SECONDS` constant were removed (no longer
  reachable).
- `src/lib/validation.ts` — `loginSchema.totp_code` field removed.
- `src/pages/admin.ts`, `src/pages/auth-pages.ts`,
  `public/static/js/auth-pages.js`, `src/index.tsx` — the
  `/admin/2fa-setup` page, its route, its client script
  (`admin-2fa-setup.js`, deleted), and the login page's conditional
  TOTP-code input field were all removed.
- `src/pages/trust.ts` — the public claim "Administrator accounts require
  mandatory two-factor authentication" was removed from the Trust page
  copy (it would otherwise be false).
- `tests/integration/auth-2fa-bootstrap.test.ts` and the `enrolledAdmin`/
  `makeFullyEnrolledAdmin`/`registerAndPromoteToAdmin` test helpers in
  `tests/integration/{admin-routes,regions,status-transitions}.test.ts`
  were rewritten to log admin test users in with just email+password, and
  a new test asserts `POST /api/auth/2fa/setup` and `/2fa/verify` return
  404.

**What was deliberately left in place (harmless, unused):**

- `src/lib/totp.ts` (RFC 6238 TOTP implementation) and its unit tests
  (`tests/unit/totp.test.ts`) — kept in case 2FA is reinstated later; it is
  no longer imported by any route.
- The `users.totp_secret` / `users.totp_enabled` D1 columns
  (`migrations/0001_initial_schema.sql`) — kept as-is; no migration was
  written to drop them, since dropping columns from a live D1 table is a
  destructive, deploy-affecting schema change and this task explicitly
  excludes deployment. They are simply never read/written by the
  application anymore (aside from `/me` still selecting `totp_enabled` for
  informational display, which is harmless since it's always read-only
  there).

**Security trade-off being accepted:** admin accounts are now protected by
password + rate-limiting only, same as regular users. If credential
exposure risk for admin accounts is a concern, consider re-enabling 2FA
(the removed code is fully described above and in git history commit
history) or adding an alternative control such as IP allowlisting for
`/admin` and `/api/admin/*` at the Cloudflare edge (outside this app's
runtime — e.g. a WAF rule or Cloudflare Access), which was out of scope for
this change.

## 3. Transport & browser security headers

Configured centrally in `src/index.tsx` via `hono/secure-headers`:

- **Content-Security-Policy**: `default-src 'self'`; scripts/styles allow
  `'unsafe-inline'` plus the exact CDNs actually used
  (`cdn.jsdelivr.net`, `unpkg.com`, Google Fonts); `img-src` additionally
  allows OpenStreetMap tile servers and `cdn.jsdelivr.net` (required for
  Leaflet's default marker icon, which loads as an `<img>` rather than
  being inlined — omitting it breaks the map pin icon); `object-src
  'none'`; `frame-ancestors 'self'`. `'unsafe-inline'` is a deliberate,
  documented trade-off for the small number of inline `<script>`/`style=""`
  usages in server-rendered pages rather than a nonce-based CSP (which
  would require larger changes to every page template).
- **Strict-Transport-Security**: `max-age=15552000; includeSubDomains` —
  safe to always send since Cloudflare Pages terminates TLS at the edge.
- **X-Frame-Options**: `SAMEORIGIN` — prevents clickjacking via iframe
  embedding on other origins.
- **Referrer-Policy**: `strict-origin-when-cross-origin`.

## 4. Data protection

- **GDPR-style self-service**: `/api/auth/me/export` (data export) and
  `/api/auth/me/delete` (soft account deletion, keeps the immutable audit
  trail) are available to any authenticated user for their own account.
- **Audit log**: every administrative action (status changes, region
  edits, admin promotions, 2FA enable/disable while that feature existed,
  logins) is recorded via `recordAudit` (`src/lib/audit.ts`) into an
  append-only `audit_log` table with no `UPDATE`/`DELETE` path from the
  application.
- **IP hashing**: client IPs are never stored in plaintext in the audit
  log; `hashIp()` HMACs them with `JWT_SECRET` before storage, so raw IPs
  are not recoverable from a database dump alone.
- **Photo storage**: uploaded photos are stored in R2 object storage, not
  inlined into the D1 database, and are compressed client-side before
  upload (see `public/static/js/image-compress.js`).

## 5. Secrets management

- `JWT_SECRET` and `ADMIN_WHATSAPP` are the two required secrets
  (declared as a comment in `wrangler.jsonc`). Locally they live in
  `.dev.vars` (gitignored, never committed) with a clearly-labeled
  insecure placeholder value for `JWT_SECRET`. In production they must be
  set via `wrangler secret put` — never hardcoded in source.
