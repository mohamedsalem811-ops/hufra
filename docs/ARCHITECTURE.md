# HUFRA — Architecture

## 1. High-level system diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser                                                              │
│  Server-rendered HTML (Hono, no client framework) + vanilla JS       │
│  Leaflet map · i18n.js (ar/en, RTL/LTR) · theme.js (light/dark)      │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ fetch('/api/*') , cookies (hufra_session, hufra_refresh)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Cloudflare Workers — Hono app (src/index.tsx)                        │
│                                                                       │
│  middleware/auth.ts                                                  │
│    attachAuth        → populates c.get('auth') from Bearer/cookie    │
│    requireAuth()     → 401 if not authenticated                      │
│    requireRole(...)  → 403 if role not in list                       │
│                                                                       │
│  routes/                                                              │
│    auth.ts       register · login · refresh · logout · /me           │
│                  GDPR export/delete                                  │
│    potholes.ts   list/detail/create · status transitions · "mine"    │
│    photos.ts     multipart upload → R2 (report/before/during/after)  │
│    media.ts      binary photo streaming from R2                      │
│    regions.ts    Greater Tripoli region CRUD (admin)                  │
│    admin.ts      notifications · duplicates · analytics · audit log  │
│                  · admin management (super_admin)                     │
└───────┬────────────────────────┬────────────────────────┬────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
┌───────────────┐      ┌───────────────────┐      ┌─────────────────┐
│ Cloudflare D1  │      │ Cloudflare KV      │      │ Cloudflare R2   │
│ (SQLite)       │      │                    │      │                 │
│ relational data│      │ rl:* rate-limit    │      │ photos/…        │
│ + triggers      │      │ windows            │      │ thumbs/…        │
│ (see §3)       │      │ counters:v1 cache  │      │ (2MB/photo cap) │
└───────────────┘      └───────────────────┘      └─────────────────┘
```

**Why this shape:** Cloudflare Pages/Workers has no persistent process, no
filesystem, and a 10ms/30ms CPU budget per request — so HUFRA is built as a
stateless edge function per request, with all state in D1/KV/R2 (never in
memory), and the frontend deliberately kept to server-rendered HTML + vanilla
JS (no SPA bundle) to stay fast on the slow/expensive mobile connections
common in the target market.

## 2. Request flow example: submitting a report

1. `POST /api/potholes` (guest or authenticated — `attachAuth` runs but does
   not require a session).
2. Per-IP rate limit checked in D1 (`checkRateLimit`, `report_ip` scope, table `rate_limit_counters`); if
   authenticated, a second per-user check runs too.
3. Body validated against `createPotholeSchema` (Zod) — coordinate plausibility
   is checked separately (`isPlausibleLibyaCoordinate`) since Zod validates
   shape, not geographic sanity.
4. If no `region_id` supplied, the nearest active region is computed
   server-side (`nearestRegion`, Haversine distance against all active
   region centers) — this is why report creation in tests always uses
   coordinates matching a real seeded region center, to get deterministic
   region assignment.
5. `INSERT INTO potholes … status='reported'`, then an explicit
   `INSERT INTO status_history (…, to_status='reported', note='Report submitted')`
   for the initial row (the auto-insert trigger only fires on *updates* to
   `status`, not the initial insert — see §3.3).
6. **Duplicate detection**: a bounding-box pre-filter (`boundingBoxForRadius`)
   narrows candidates, then exact Haversine distance decides which open
   (non-`fixed`) reports within `DUPLICATE_RADIUS_METERS` (~50m) get a
   `duplicate_flags` row — flagged for admin review only, never auto-merged
   or auto-rejected.
7. `notifyAdmins()` inserts a `notifications` row targeted at `admin`/`super_admin`.
8. `recordAudit()` inserts an `audit_logs` row with the IP hashed
   (`hashIp`, HMAC-SHA256 keyed with `JWT_SECRET` — never the raw IP) rather
   than storing raw IP addresses.

## 3. Data model (ER diagram)

```mermaid
erDiagram
    USERS ||--o{ POTHOLES : "reports (reporter_id, nullable)"
    USERS ||--o{ STATUS_HISTORY : "acts as (actor_id, nullable)"
    USERS ||--o{ POTHOLE_PHOTOS : "uploads (uploaded_by, nullable)"
    USERS ||--o{ AUDIT_LOGS : "acts as (actor_id, nullable)"
    USERS ||--o{ REFRESH_TOKENS : owns
    USERS ||--o{ NOTIFICATIONS : "targeted (target_user_id, nullable)"
    USERS ||--o{ DUPLICATE_FLAGS : "reviews (reviewed_by, nullable)"

    REGIONS ||--o{ POTHOLES : contains

    POTHOLES ||--o{ POTHOLE_PHOTOS : has
    POTHOLES ||--o{ STATUS_HISTORY : has
    POTHOLES ||--o{ DUPLICATE_FLAGS : "flagged as (pothole_id)"
    POTHOLES ||--o{ DUPLICATE_FLAGS : "flagged against (duplicate_of_id)"
    POTHOLES ||--o| PENDING_STATUS_CHANGE : "staged actor/note for"

    USERS {
        int id PK
        text email UK
        text password_hash
        text role "user | admin | super_admin"
        text code UK "LBY{n}-{year}, auto-generated"
        text locale "ar | en"
        text totp_secret "nullable"
        int totp_enabled "0/1"
        text display_name "nullable"
        text consent_at "nullable"
        text created_at
        text updated_at
        text deleted_at "nullable, soft-delete"
    }

    REGIONS {
        int id PK
        text slug UK
        text name_ar
        text name_en
        text city
        real center_lat
        real center_lng
        int active "0/1"
        text created_at
    }

    POTHOLES {
        int id PK
        int region_id FK
        int reporter_id FK "nullable, guest reports allowed"
        text reporter_contact "nullable"
        real lat
        real lng
        real length_cm "nullable"
        real width_cm "nullable"
        real depth_cm "nullable"
        text severity "minor | medium | severe"
        text status "reported | verified | under_repair | fixed"
        text description_ar "nullable"
        text description_en "nullable"
        int view_count
        text created_at
        text updated_at
        text verified_at "nullable"
        text under_repair_at "nullable"
        text fixed_at "nullable"
        text deleted_at "nullable, soft-delete"
    }

    POTHOLE_PHOTOS {
        int id PK
        int pothole_id FK
        text r2_key "unique R2 object key"
        text thumb_key "unique R2 object key"
        text stage "report | before | during | after"
        int width_px "nullable"
        int height_px "nullable"
        int size_bytes "nullable"
        int uploaded_by FK "nullable"
        text created_at
        text deleted_at "nullable, soft-delete"
    }

    STATUS_HISTORY {
        int id PK
        int pothole_id FK
        text from_status "nullable, NULL on first row"
        text to_status
        int actor_id FK "nullable, attributed via pending_status_change"
        text note "nullable"
        text at
    }

    DUPLICATE_FLAGS {
        int id PK
        int pothole_id FK "the newer/candidate report"
        int duplicate_of_id FK "the original report it matches"
        real distance_m
        text review_status "pending | confirmed | rejected"
        int reviewed_by FK "nullable"
        text reviewed_at "nullable"
        text created_at
    }

    NOTIFICATIONS {
        int id PK
        text target_role "nullable: admin | super_admin"
        int target_user_id FK "nullable"
        text type
        text payload_json
        text read_at "nullable"
        text created_at
    }

    AUDIT_LOGS {
        int id PK
        int actor_id FK "nullable"
        text action
        text entity
        int entity_id "nullable"
        text before_json "nullable"
        text after_json "nullable"
        text ip_hash "nullable, HMAC of IP, never raw"
        text created_at
    }

    REFRESH_TOKENS {
        int id PK
        int user_id FK
        text token_hash UK
        text user_agent "nullable"
        text ip_hash "nullable"
        text created_at
        text expires_at
        text revoked_at "nullable"
    }

    PENDING_STATUS_CHANGE {
        int pothole_id PK_FK "one pending change per pothole"
        int actor_id FK "nullable"
        text note "nullable"
    }

    RATE_LIMIT_EVENTS {
        int id PK
        text scope
        text key_hash
        text created_at
    }
```

Full column definitions with `CHECK` constraints, defaults, and indexes:
`migrations/0001_initial_schema.sql`. Trigger definitions: `migrations/0002_triggers.sql`
and `migrations/0004_fix_status_history_attribution.sql`.

### 3.1 Why plain lat/lng instead of PostGIS-style geometry

Cloudflare D1 is SQLite-based with no native geospatial extension. HUFRA
stores plain `REAL` `lat`/`lng` columns with a composite index
(`idx_potholes_geo`), and does "near me" and duplicate-radius queries as a
cheap bounding-box SQL pre-filter (`boundingBoxForRadius`, `src/lib/geo.ts`)
followed by an exact Haversine distance calculation in application code
(`haversineDistanceMeters`). This trades a small amount of query precision
(a bounding box is a superset of the true circle) for zero extra
infrastructure — acceptable at the city scale HUFRA targets.

### 3.2 Why no native row-level security (RLS)

SQLite/D1 has no RLS engine. The same *guarantee* RLS would provide — every
row access checked against the caller's role/ownership — is reproduced by
centralizing all authorization decisions in `src/middleware/auth.ts`
(`attachAuth`, `requireAuth`, `requireRole`) and requiring every route
handler to go through them rather than querying D1 with unchecked filters.
`attachAuth` never trusts a client-supplied role claim — the role is only
ever read from a server-signed JWT (see §4).

### 3.3 The `pending_status_change` staging pattern (a real bug found + fixed)

`status_history` and `audit_logs` are both made immutable at the database
level — `BEFORE UPDATE`/`BEFORE DELETE` triggers `RAISE(ABORT, …)` on any
attempt to modify or remove a row, so the immutability guarantee holds even
if application code has a bug (`migrations/0002_triggers.sql`).

The original implementation of `PATCH /api/potholes/:id/status` relied on a
trigger (`trg_potholes_status_history`) that auto-inserts a `status_history`
row whenever `potholes.status` changes, and then tried to `UPDATE` that
freshly-inserted row afterward to attach `actor_id`/`note`. That `UPDATE`
always hit the immutability trigger and aborted with
`SQLITE_CONSTRAINT_TRIGGER`, so **every admin status-change request 500'd**.

The fix (`migrations/0004_fix_status_history_attribution.sql`): a small
transient table, `pending_status_change (pothole_id PK, actor_id, note)`, is
populated by the application *immediately before* the `UPDATE potholes SET
status = ?`. The rewritten trigger reads (and immediately deletes) the
staged row inside the very same `INSERT INTO status_history` statement it
uses to create the row — so the row is correctly attributed from the moment
it exists, `status_history` is never `UPDATE`d, and its immutability
guarantee is preserved exactly as originally intended. This is the primary
scenario covered by `tests/integration/status-transitions.test.ts`.

## 4. Authentication

- JWTs (`src/lib/jwt.ts`) carry a `typ` claim as a capability discriminator:
  `'access'` (normal session, short TTL) and `'refresh'` (long-lived,
  rotates access tokens via `/api/auth/refresh`). Access tokens travel as
  either an `Authorization: Bearer` header or an HttpOnly `hufra_session`
  cookie.
- **Mandatory admin TOTP 2FA has been cancelled** per explicit user
  request (previously: RFC 6238 2FA required for admin/super_admin
  accounts, with a `typ:'totp_setup'` bootstrap-token flow to work around
  a login deadlock). `/api/auth/login` now issues a normal access token to
  any correct email+password, regardless of role. See docs/SECURITY.md for
  the full rationale and what was removed vs. left in place (the TOTP
  library `src/lib/totp.ts` and the `totp_secret`/`totp_enabled` DB columns
  are kept, unused, in case 2FA is reinstated later).
- RBAC (`requireRole('admin', 'super_admin')` etc.) is enforced per-route,
  never inferred from anything the client sends beyond the signed JWT — this
  is unaffected by the 2FA change; it is a separate authorization layer.

## 5. Bugs found and fixed during integration testing

Documented here because each one shaped a piece of the architecture above;
all four are now covered by dedicated regression tests.

| # | Bug | Root cause | Fix | Regression test |
|---|---|---|---|---|
| 1 | `/api/regions` and `/api/potholes/counters` 500'd in local dev | `wrangler pages dev` was invoked with `--d1/--r2/--kv` CLI flags, which spin up *fresh, separate* local resources instead of the ones declared in `wrangler.jsonc` — so the "real" bindings had no migrations/seed data | Removed the flags from `ecosystem.config.cjs`; bindings are picked up from `wrangler.jsonc` automatically | Manual verification (`curl`); this fix predates the automated integration suite |
| 2 | Every admin status-change request 500'd (`SQLITE_CONSTRAINT_TRIGGER`) | `PATCH /:id/status` tried to `UPDATE` an auto-inserted, immutable `status_history` row to attach `actor_id`/`note` | `pending_status_change` staging table + rewritten trigger (§3.3) | `tests/integration/status-transitions.test.ts` |
| 3 | `/me`, `/me/export`, `/me/delete` (and formerly `/2fa/setup`/`/2fa/verify`) always 401'd regardless of a valid token | `auth.ts` router never wired `attachAuth`, so `c.get('auth')` was always `null` on that router | `auth.use('*', attachAuth)` added | `tests/integration/auth-2fa-bootstrap.test.ts` |

**Historical (no longer applicable — mandatory 2FA was removed, see §4 and docs/SECURITY.md):**

| # | Bug | Root cause | Fix at the time |
|---|---|---|---|
| 4 | Brand-new admins could never complete 2FA setup (permanent lockout) | Structural bootstrap deadlock in the old mandatory-2FA design | `typ:'totp_setup'` token + `requireAuthOrTotpSetup` middleware (both since removed) |
| 5 | Raw 500 `ReferenceError` on every admin login attempt | `TOTP_SETUP_TOKEN_TTL_SECONDS` referenced in `/login` but never imported from `../lib/jwt` in `auth.ts` | Added the missing import (constant since removed along with 2FA) |

## 6. Testing strategy

- **Unit tests** (`tests/unit/*.test.ts`) cover `src/lib/*` in isolation
  (JWT, TOTP, password hashing, rate limiting, geo math, validation, audit,
  storage, notifications) — the majority of the suite, high statement
  coverage on `src/lib`.
- **Integration tests** (`tests/integration/*.test.ts`) drive the *real*
  Hono `app` (the actual `src/index.tsx` default export) end-to-end via
  `app.request(path, init, env)`, backed by a *real* migrated SQLite schema
  — including all triggers — via `createMigratedTestDb()`
  (`tests/integration/helpers/d1-sqlite-adapter.ts`, using `better-sqlite3`
  as a high-fidelity D1-compatible engine) plus lightweight in-memory fakes
  of KV and R2 (`fake-bindings.ts`). No Miniflare is needed. Covers report
  lifecycle + duplicate detection, status transitions (the primary
  regression suite for bug #2 above), admin login without 2FA + RBAC
  boundaries (bug #3, and confirming the removed `/2fa/*` routes now 404),
  all `/api/admin/*` routes, and `/api/regions`.
- Total: **143 tests**, run in CI on every push/PR via `.github/workflows/ci.yml`.

## 7. Known architectural trade-offs

- No client framework/bundler — server-rendered HTML + vanilla JS per page,
  chosen for low-bandwidth resilience over developer ergonomics of a SPA.
- Geospatial queries are bounding-box + Haversine, not a true spatial index
  — fine at city scale, would need revisiting at a much larger data volume.
- `photos.ts`/`media.ts` have low automated test coverage (file upload/R2
  streaming is harder to exercise without a real multipart `File`/R2
  round-trip) — see README §9 for the concrete next step.

## Status change rules (`PATCH /api/potholes/:id/status`)

Lifecycle: `reported → verified → under_repair → fixed` (`planStatusChange` in
`src/routes/potholes.ts`).

| Change | Result |
|---|---|
| Forward, including skipping a stage | Allowed. Sets only the target stage's timestamp. |
| Same status again | `409`. Nothing changes, so `fixed_at` and the other timestamps are never overwritten. |
| Backward (pothole re-opened, or a mistake) | Allowed only with a `note` of at least 5 characters (`400` otherwise). Clears the timestamps of the undone stages, so the average fix time stays correct. A skipped stage gets a start date when it is returned to. |
| Status changed by someone else since it was read | `409`. The `UPDATE ... WHERE status = <what was read>` changes no row, so the other admin's change is not overwritten. |

The staging row for the `status_history` trigger, the update, and the clean-up
run in one `DB.batch()` transaction. The offline admin queue drops a `409`
instead of retrying it forever.
