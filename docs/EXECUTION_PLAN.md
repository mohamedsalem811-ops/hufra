# HUFRA — Execution plan: native app, new website, new admin

Status: **in progress.** Done: 1.1 (#3, admin password via #4), 1.2 (domain: later), 2.1 (#5), 2.2 (#6), 2.3 (#7), 3.1 (#8, Worker live at https://hufra.mohamedsalem811.workers.dev). 4.1 (#9, brand kit approved). Current: 4.2 (app screen designs incl. donations, on the design canvas, waiting for approval).

## 0. What we are building (agreed decisions)

| Decision | Choice |
|---|---|
| Citizens | Use **only the mobile app** (iOS + Android). No reporting on the website. |
| Mobile app | **Expo (React Native)**, new app replacing the Capacitor shell |
| Website | **Rebuilt** (option 3): company / service site only — who we are, how it works, legal pages, download links. **No citizen features.** |
| Admin panel | **Rebuilt** as a modern web app, on the website's domain |
| Brand | **Direction A · Civic Clarity** (sea blue `#0B4A6F`, signal orange `#FF6A3D`, repair green `#1E8E5A`, Readex Pro), with Direction C's before → after photo storytelling |
| Backend | The existing Hono API on Cloudflare (D1, R2, KV) stays and is extended. Security work already done is kept. |
| Testing | Owner only, sideloaded (Sideloadly for iOS, APK for Android), until everything is finished |
| Store accounts | Apple Developer + Google Play, **at the end** (Phase 10), before any public user |
| Pace | Quality over speed. One step at a time; every step is reviewed and approved before the next starts. |

### Versions this plan is based on (checked 2026-11-01)

Expo SDK 58 · React Native 0.88 · expo-router 58 · @maplibre/maplibre-react-native 11 · React 19 · Vite 8 · TanStack Router 1 / Query 5 · Tailwind CSS 4 · Astro 7 (+ @astrojs/cloudflare 14) · @hono/zod-openapi 1.6 · i18next 26. Each step re-checks and uses the latest stable version at that time.

## How every step is run

1. Work happens on the development branch, in small commits.
2. Every step ends with: typecheck, tests (existing + new), a GitHub CI run, and — for anything visual — **screenshots on phone sizes in Arabic and English, light and dark**.
3. I report what changed, what was verified and what was not, then **wait for your approval** before the next step.
4. Anything that needs you (an account, a key, a decision) is listed in the step and asked for before it blocks work.
5. The live site keeps working throughout. Old parts are removed only in Phase 9, after the replacements are approved.

### What sideload testing can and cannot show (until Phase 10)

| | Android APK | iPhone via Sideloadly (free Apple ID) |
|---|---|---|
| All screens, map, camera, GPS, reporting, offline | ✅ | ✅ |
| Push notifications | ✅ (needs your Firebase project) | ❌ needs a paid Apple account |
| Shared links opening the app | ✅ (App Links, needs a domain) | ❌ needs a paid Apple account |
| Lifetime of an install | Permanent | **7 days**, then re-sign with Sideloadly |

## Target structure (end state)

```
hufra/
├── apps/
│   ├── api/        Hono API on Cloudflare Workers (today's backend, moved here)
│   ├── mobile/     Expo app (citizens)
│   ├── admin/      React + Vite admin panel (municipal staff)
│   └── web/        Astro company website (public)
├── packages/
│   ├── brand/      Design tokens (colours, type, spacing, radius, motion) -> CSS + TypeScript
│   └── contracts/  Shared API schemas (zod) + generated typed API client
└── docs/
```

One Cloudflare Worker serves everything on one domain: `/api/*` (API), `/admin/*` (admin app), everything else (website). One domain keeps the admin's secure cookie login simple.

---

## Phase 1 — Prepare the ground

**1.1 Merge the finished work.** All fixes and upgrades so far live on the development branch. Open a pull request, you review it, merge it to `main`, so the live site gets the security fixes and the new work starts from a clean base.
- You: review and merge; set the admin password (`npm run admin:set-password`); confirm the Cloudflare token has D1 permission.
- Done when: CI deploy succeeds, migrations 0007–0012 applied, site works.

**1.2 Decide the domain.** Shared links into the app, the website and later the stores all work best on your own domain (for example `hufra.ly`). Until then we use the Cloudflare address.
- You: decide whether to buy a domain now or later (it can be added at any point before Phase 10).

## Phase 2 — Restructure into a monorepo (no behaviour change)

**2.1 Move the backend to `apps/api`** with npm workspaces. Same code, same tests, same deploy — only folders and scripts move.
- Done when: all 274+ tests pass, CI and deploy still work, the live site is unchanged.

**2.2 Create `packages/brand`**: the Direction A tokens as one source (JSON) that generates CSS variables (website, admin) and a TypeScript theme (app). Light and dark themes. Every text/background pair checked for WCAG AA contrast in CI.

**2.3 Create `packages/contracts`**: the API's request/response shapes as shared zod schemas, so the app, admin and API can never disagree about data.

## Phase 3 — Move hosting to Cloudflare Workers

**3.1 Migrate from Pages to Workers + Static Assets** (the step deferred earlier). The current site keeps working at a new Workers address; CI deploys there; secrets re-added (`JWT_SECRET`, optional `FCM_SERVICE_ACCOUNT`, `ADMIN_WHATSAPP`).
- You: re-enter the secrets on the new Worker (I give exact commands); later, attach your domain.
- Done when: the site, API and migrations work on Workers; the old Pages project stays as fallback until Phase 9.

## Phase 4 — Brand and design (before any screen is coded)

**4.1 Brand kit, Direction A final**: logo master (SVG), app icon (iOS + Android adaptive + monochrome), splash screen, favicon, colour tokens light/dark, type scale with Readex Pro (bundled, open licence), icon set (Lucide), photo rules (before/after), voice and tone guide in Arabic and English.

**4.2 App screen designs** (hi-fi, on the design canvas): onboarding/permissions, home, map, report flow (location → photos → details → review), report detail with before/after, my reports, notifications, account, settings, offline/empty/error states. Arabic first, English, light and dark.
- You: approve or request changes. **No app code until approved.**

**4.3 Admin and website designs**: admin dashboard, report queue, report detail, duplicates, regions, donors, admins, audit log; website home, how it works, about, transparency, legal pages, download, shared-report landing page.
- You: approve or request changes.

## Phase 5 — Mobile app foundation

**5.1 Create the Expo app** in `apps/mobile`: TypeScript (strict), expo-router, lint, unit tests (jest-expo). Native folders are generated at build time, not committed. App id `ly.tripoli.hufra` (same as today).

**5.2 Build pipeline**: a new GitHub workflow builds an Android APK and an unsigned iOS IPA from the Expo app (for Sideloadly). The old Capacitor workflow stays until Phase 9.
- Done when: both builds succeed in CI and install on your phones.

**5.3 Core plumbing**: Arabic (default) / English with full right-to-left layout, theme from `packages/brand`, fonts, typed API client, secure token storage with refresh rotation (one refresh at a time, as built on the server), data caching (TanStack Query), error screens and crash logging, API address per environment.

**5.4 App shell**: splash screen, first-run onboarding explaining location/camera/notification permissions, bottom tabs (Home · Map · Report · My reports · Account).
- You: install and try the empty shell on both phones.

## Phase 6 — Mobile app features (one screen at a time, each approved)

**6.1 Map**: MapLibre with OpenStreetMap tiles through our own tile proxy (no Google key, no cost), pins clustered and coloured by status, filters (status, region, severity) with clear labels, "near me", tap a pin → preview sheet → detail.

**6.2 Report flow** (account required): GPS location with a draggable pin, camera or gallery (up to 3 photos), compressed on the phone to the server limits (≤1280 px, ~130 KB WebP/JPEG, no EXIF), severity, street, description, optional measurements, review, submit with the upload permit. A logged-out user is asked to sign up or log in first, then returns to the report.

**6.3 Offline reporting**: reports saved on the phone (SQLite) when there is no signal, sent automatically when back online, never duplicated (device id), visible as "waiting to send".

**6.4 Report detail**: photo gallery, before/after slider, status timeline with reasons, confirm ("I saw it too"), share link, directions in maps apps.

**6.5 Home**: city numbers, reports near you, recently fixed before/after showcase, top contributors and donors (with proper empty states).

**6.6 Account**: register, log in, my reports, notification inbox, settings (language, theme, text size), export my data, **delete my account** (required by both stores), legal links.

**6.7 Push notifications**: expo-notifications; Android token sent to the existing Firebase backend; tapping a notification opens the right report. iPhone push is connected in Phase 10.
- You: create the Firebase project and add the two secrets (steps already documented).

**6.8 Polish, accessibility and crash reporting**: Firebase Crashlytics (free); screen reader labels, large text support, contrast, haptics, smooth animations, loading/empty/error states everywhere, image caching for slow networks, dark mode review.

**6.9 Repair campaigns and donations** (backend + app; decisions 8–12 below): the backend first (campaigns, donations, payout-account settings, reference codes, proof upload, fraud checks, tests), then the app: campaign card on the report page (target, confirmed amount, and an "under review, not yet confirmed" amount shown separately), donate sheet with the bank details and a unique reference code, amount + transfer screenshot (compressed on the phone, no EXIF, private), "under review", and "My donations". Pending donations without a screenshot expire after 48 hours.
- You: add the bank account (holder name, bank, IBAN) in the admin settings when ready (it can change later without an app update), and check whether collecting public donations needs a licence or a registered entity in Libya.

**6.10 App tests**: unit tests for logic (compression, queue, auth refresh) and automated end-to-end tests of the main journeys on an Android emulator in CI (Maestro).

## Phase 7 — Backend changes for an app-only service

**7.1 API additions the app needs**: a public "shared report" payload, cursor pagination for long lists, notification preferences, an app-version check (to require updates later), and the OpenAPI description of every endpoint generated from the shared schemas (`@hono/zod-openapi`) so the typed client is always correct.
**7.2 Review limits for the app**: rate limits, upload limits and caching tuned for app traffic. Existing tests extended.

## Phase 8 — New admin panel and new website

**8.1 Admin foundation** (`apps/admin`): React + Vite + TypeScript, Tailwind CSS with the brand tokens, accessible components with right-to-left support, TanStack Router/Query, typed API client, secure cookie login on the same domain.

**8.2 Admin screens**: dashboard (numbers and charts), report queue (filters, search, bulk actions), report detail (status changes with the existing rules and reasons, photos, repair-proof upload, duplicates), map view, duplicate review, regions, donors, **repair campaigns** (set the repair cost and breakdown, start / close a campaign, publish the final cost and receipt), **donation review queue** (screenshot next to amount, reference and donor; approve, or reject with a reason; duplicate screenshot and reused-reference warnings), **payout account settings** (super admin only, every change in the audit log), admins (super admin), audit log, notifications, CSV export.

**8.3 Admin tests**: component tests and browser end-to-end tests (Playwright) in CI.

**8.4 Website** (`apps/web`): Astro, Arabic/English, right-to-left. Pages: home (what HUFRA is), how it works, regions covered, public transparency numbers (read-only), about / partners / donors, contact, download (app store badges once live), privacy policy, terms, support/FAQ, account deletion information (required by Google Play).

**8.5 Shared report links**: `/r/<id>` shows the photo, area and status with "Open in the app / Get the app", plus the files that let phones open the app directly (Android `assetlinks.json`; Apple's file, which works in Phase 10).

**8.6 Website quality**: performance budget, search engine basics, accessibility audit.

## Phase 9 — Put it together and remove the old system

**9.1 One Worker, three surfaces**: routing for API, admin and website; security headers per surface (strict script policy everywhere); one CI pipeline that tests and deploys all of it.

**9.2 Remove the old citizen website and Capacitor app**: old pages, scripts and styles, service worker/PWA, the Capacitor shell and its workflow, and their tests. The old Pages project is deleted.
- You: confirm the switch-over date.

**9.3 Full test pass on your devices**: a written checklist covering every journey, on Android and on iPhone via Sideloadly, in Arabic and English, online and offline.

## Phase 10 — Store readiness (only when you decide to publish)

**10.1 Accounts and signing**: Apple Developer ($99/year) and Google Play ($25 once); app signing set up (EAS Build or GitHub Actions signing).
**10.2 iPhone-only features**: push notifications (APNs) and shared links opening the app (associated domains).
**10.3 Donation rules of the stores**: check Apple's and Google's current rules for donations in apps. If needed, either register as a non-profit or, in the store builds only, open the donation step on the website.
**10.4 Store listings**: Arabic and English descriptions, screenshots from the real app, privacy questionnaires (App Privacy / Data safety), age rating, support and privacy URLs from the website.
**10.5 Beta, then release**: TestFlight and Play internal testing, fixes, then public release. Website download buttons switch on.

---

## Decisions (answered by the owner, 2026-11-01)

| # | Question | Decision |
|---|---|---|
| 1 | Buy a domain now or later? | **Later.** The Cloudflare address is used until then. |
| 2 | Can guests report without an account? | **No: an account is required to report.** Email verification and password reset come later with a transactional email service (a separate step, added when the service is chosen). |
| 3 | Public transparency numbers on the website? | **Yes, read-only.** |
| 4 | Admin address | **`/admin`** on the same domain |
| 5 | Maps provider | **MapLibre + OpenStreetMap** (free). Can move to a paid tile provider later without app changes (the tile proxy already supports `TILE_UPSTREAM`). |
| 6 | Admin features inside the mobile app? | **No.** Admin stays on the web. |
| 7 | Crash reporting | **Firebase Crashlytics (free), added in Phase 6.8**, before any beta tester. Sentry's free plan only if server/admin errors are wanted in the same place later. |
| 8 | Repair campaigns | Admins set the repair cost of a verified report and start a campaign; anyone with an account can donate. Donations by **LYPAY bank transfer** (no payment gateway). |
| 9 | Bank account | **One account for all campaigns**; the reference code tells which campaign a transfer is for. Entered later in the admin settings. |
| 10 | Account required to donate | **Yes.** |
| 11 | Progress bar | Confirmed money moves the target. Money under review is shown separately and clearly marked **not confirmed**. |
| 12 | Leftover / cancelled campaign money | Goes to the **next open campaign**. No second approver for large donations. |

### What decision 2 changes in the plan

- **6.2 Report flow:** requires login. A logged-out user who taps "Report" sees a short sign-up / log-in screen first, then returns to the report.
- **6.6 Account:** registration (email + password + consent) is part of the first-run experience.
- **7.1 API:** `POST /api/potholes` and report photo uploads require an authenticated user. Guest reporting is switched off on the server when the old website is removed (9.2), so the current site keeps working until then. Upvotes ("I saw it too") also require an account, which removes the IP-based vote counting.
- **Later step (after Phase 9, when the email service is chosen):** email verification, password reset, and optionally requiring a verified email before reporting.

## Risks and how they are handled

| Risk | Mitigation |
|---|---|
| Long project; the old site must keep working meanwhile | New apps are built beside the old ones; removal only in Phase 9 |
| iPhone testing limits (7-day installs, no push) | Android covers push and links; iPhone features finished in Phase 10 |
| Arabic right-to-left bugs | Arabic is the default in every screenshot and test |
| Slow networks in Libya | Photo compression, caching, offline queue, performance budgets |
| Breaking the API for the app | Shared schemas + generated client + contract tests |
| Dependency churn | Versions re-checked at each step; CI blocks conflicts (no more legacy-peer-deps) |
