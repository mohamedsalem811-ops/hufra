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
- **Login rate limiting**: `checkRateLimit` (`src/lib/rate-limit.ts`, D1-backed: one atomic upsert per check, so parallel requests cannot exceed the limit; IPs are stored only as salted hashes)
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

## 6. Admin accounts — no default credentials

- There is **no default admin login**. The first super admin, and any later
  password reset, is done out-of-band with `npm run admin:set-password --
  --email <you> [--local]` (`scripts/set-admin-password.mjs`). It hashes the
  password locally (same PBKDF2 format as `src/lib/password.ts`), writes it to
  D1 through `wrangler d1 execute`, requires 12+ characters, and revokes all of
  that account's refresh tokens.
- **History:** earlier versions seeded `admin@hufra.ly` with a password that
  was printed in the README, `deploy.sh` and migration `0006`, and the login
  route re-created that super admin whenever someone logged in with it and the
  account was missing. That meant anyone who had read the repository could
  become super admin. The fix:
  - the re-create/repair code was removed from `/api/auth/login`;
  - `isKnownPublicPassword()` makes login refuse a published password (403)
    even when it matches the stored hash, and registration / change-password
    refuse to set one;
  - migration `0007` replaces the seeded hash with a value that can never
    verify and revokes that account's refresh tokens.

## 7. Cross-origin access (CORS) and CSRF

- `src/lib/origins.ts` decides which browser origins may call `/api/*` with
  credentials: the site's own domain (production, preview deployments, custom
  domains), the Capacitor app shells (`capacitor://localhost`,
  `https://localhost`), local dev servers, and any exact origins listed in the
  optional `ALLOWED_ORIGINS` variable. Every other origin gets no
  `Access-Control-Allow-Origin` header, so its pages cannot read API responses.
- State-changing API calls (`POST`/`PATCH`/`DELETE`) that carry an `Origin`
  header from any other site are refused with 403 before reaching a route.
  This is the CSRF guard. Requests with no `Origin` (curl, servers, native HTTP
  clients) are unaffected.
- **History:** the previous CORS config returned the caller's origin in every
  branch together with `Access-Control-Allow-Credentials: true`, so any website
  was trusted. Even the intended rule (`*.pages.dev`) would have trusted sites
  that anyone can publish for free.

## 8. Refresh tokens — rotation and theft detection

- A refresh token is accepted only if it is correctly signed **and** recorded
  in `refresh_tokens` for the same user, and not revoked. (Previously a token
  missing from the table was accepted.)
- **Rotation:** every successful `POST /api/auth/refresh` retires the presented
  token (`revoked_at` + `replaced_at`) and returns a new one in the JSON and
  the `hufra_refresh` cookie. The retire step is a conditional `UPDATE ... WHERE
  revoked_at IS NULL`, so two parallel refreshes cannot both succeed.
- **Reuse detection:** presenting a token that was retired by rotation more
  than 60 seconds ago (`REFRESH_REUSE_GRACE_SECONDS`) means a copy exists, so
  all of that account's refresh tokens are revoked and a
  `session.refresh_token_reuse` audit entry is written. Within the grace period
  (two tabs refreshing at once) the late request just gets 401. Tokens revoked
  by logout or a password change are refused without signing out other devices.
- Every refresh token has a random `jti`, so two logins in the same second
  never produce the same token.
- The web/app client (`public/static/js/api.js`) shares one in-flight refresh
  between parallel 401s and retries with an already-refreshed access token,
  so rotation never logs a user out by accident.
- Malformed tokens (bad base64, wrong shape) are treated as "not logged in"
  (401) instead of causing a 500.

## 9. Photo uploads — who may upload, and what is stored

- **Upload permit:** `POST /api/potholes` returns an `upload_token`
  (`src/lib/upload-token.ts`, HMAC-signed, bound to that report id, valid
  6 hours). Report photos are accepted only with that permit, from the
  logged-in reporter, or from an admin. Repair-proof stages
  (`before`/`during`/`after`) are admin-only. Previously any guest could attach
  photos to any report.
- **Compression is enforced on the server** (`src/lib/image-check.ts`): the
  file bytes (not the declared type) must be WebP or JPEG, the long edge at most
  1280px (thumb 320px), the size at most 400 KB (thumb 64 KB), and there must be
  no EXIF block (canvas re-encoding strips it; EXIF can carry GPS and device
  data). The stored content type and dimensions come from the bytes.
- **Storage caps:** at most 3 photos per stage per report, plus the per-IP
  upload rate limit. Worst case per report is 12 photos (~5.5 MB); typical is
  1-3 photos of ~130 KB.
- **Deletion frees storage:** deleting a photo, deleting a report or confirming
  a duplicate removes the image objects from R2 (the D1 rows stay,
  soft-deleted, for the audit trail), so deleted photos are no longer served.

## 10. Account deletion — real erasure

`POST /api/auth/me/delete` (`src/routes/auth.ts`) runs one D1 transaction that:

- replaces the email with `deleted-<id>@deleted.invalid` (the address can be
  registered again), wipes the password hash, display name and 2FA secret, and
  drops any admin role;
- removes the phone number from the person's reports and unlinks them
  (`reporter_id = NULL`). The reports stay public, since they describe roads;
- deletes their device push tokens and notifications, and revokes their
  sessions, clearing the stored user agent and IP hash.

The numeric id and pseudonymous code remain, so status history and the audit
log stay consistent. The last super admin cannot delete their own account.
Migration `0009` applies the same clean-up to accounts deleted before this
fix. New `pothole.create` audit entries record `reporter_contact: "[provided]"`
instead of the number, because audit rows can never be edited. Entries written
before this change still contain the numbers they were given.

## 11. Website sessions are cookie-only

- For a request from a web page, login and refresh responses **never contain
  the tokens** (`tokensInBody` in `src/lib/origins.ts`). The session lives only
  in the HttpOnly `hufra_session` / `hufra_refresh` cookies, so script running
  in the page, including injected script from a future XSS bug, cannot read,
  store or exfiltrate it. A page's request is recognised by its `Origin`
  header, which browsers always send on POST and page script cannot remove.
- The Capacitor app (`capacitor://localhost`, `https://localhost`) cannot use
  the site's cookies from its own origin, so it still receives the tokens in
  the body and keeps them in app storage. Requests with no `Origin` (curl,
  server scripts) also receive them.
- `public/static/js/api.js` never stores tokens on the website and deletes any
  that older versions left in `localStorage`. A readable `hufra_auth=1` cookie
  (no secret) tells the page whether a refresh is worth trying, so logged-out
  visitors make no refresh calls.
