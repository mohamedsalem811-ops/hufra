# HUFRA — Execution plan: native app, new website, new admin

Status: **in progress.** Done: 1.1 (#3, admin password via #4), 1.2 (domain: later), 2.1 (#5), 2.2 (#6), 2.3 (#7), 3.1 (#8, Worker live at https://hufra.mohamedsalem811.workers.dev). 4.1 (#9, brand kit approved). 4.2 (app screen designs incl. donations, approved). 4.3 (admin panel and website designs, approved). 5.1 (#10), 5.2 + 5.3 (#11), 5.4 (#12), 6.1 (#13), 6.2 (#14), 6.3 (#15), 6.4–6.7 (#16), 6.8 (#17), 6.9 (#18; donation admin screens deferred to 8.2 by the owner). 6.10 (#19). 7.1 (#20). 7.2 (#21). 8.1 (#22). 8.2a report queue and report page (#23), 8.2b campaigns and donation review (#24), lenient app parsing + public campaign costs (#25). 8.2c settings and audit log (#26). 8.2d partners (#27). 8.2e admins, donors, regions (#28). 8.2f map, duplicates, menu counts (#29). 8.2g dashboard charts, notifications, CSV (#30), completing 8.2. 8.3 admin browser tests in CI (#31). 8.4a website home, how it works, about, FAQ (#32). 8.4b transparency, contact, open data (#33). 8.4c legal pages, legal acceptance in the app (#34). 8.5 shared report links, Android App Links (#35); emulator CI disk fix (#36). 8.6 website quality (#37), completing Phase 8. 9.1 one Worker for API, admin and website (#38). 9.2a donation pages and sign-in on the new website (#39). 9.2b old site and Capacitor app removed (#40), old Pages project deleted. Current: 9.3 (test pass on your devices); next Phase 10 when you decide to publish.

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

**6.9 Repair campaigns and donations** (decisions 8–18 below): the backend (campaigns, donations, bank-details settings, reference codes, private proof upload, duplicate-screenshot and rate checks, 48-hour expiry, shared pool for leftover money, notifications, tests); the **donation website** (campaign, amount, bank details + code, proof upload compressed in the browser, under review, receipt, my donations; Arabic/English, light/dark); and in the app the campaign card on the report page (confirmed money and an "under review, not yet confirmed" amount shown separately), the Donate button (in-app browser or Safari per the server switch, signed in via a one-time link) and a read-only "My donations".
- You: add the bank account (holder name, bank, IBAN and account number) in the admin settings when ready (it can change later without an app update), and check whether collecting public donations needs a licence or a registered entity in Libya.

**6.10 App tests**: unit tests for logic (compression, queue, auth refresh) and automated end-to-end tests of the main journeys on an Android emulator in CI (Maestro).

## Phase 7 — Backend changes for an app-only service

**7.1 API additions the app needs**: a public "shared report" payload, cursor pagination for long lists, notification preferences, an app-version check (to require updates later), and the OpenAPI description of every endpoint generated from the shared schemas (`@hono/zod-openapi`) so the typed client is always correct. Built: `GET /api/openapi.json` from a list of every endpoint (`apps/api/src/lib/openapi.ts`) whose schemas are the shared contracts, turned into JSON Schema by zod; a test fails if any served route is missing from it. This gives the same result as `@hono/zod-openapi` without rewriting every route.
**7.2 Review limits for the app**: rate limits, upload limits and caching tuned for app traffic. Existing tests extended. Built: signed-in people are limited per account (Libyan carriers share a few addresses between many phones) with a high per-address backstop; signed-out requests keep the strict per-address limits. Sign-in is limited per account (10 per 15 min) and per address (60); new accounts 30 per address per hour. Every 429 says when to try again (`Retry-After`, `retry_after`). API bodies are capped at 64 KB (uploads have their own limits, and the proof upload is refused by size before reading). API answers carry `Vary: Authorization, Cookie`.

## Phase 8 — New admin panel and new website

**8.1 Admin foundation** (`apps/admin`): React + Vite + TypeScript, Tailwind CSS with the brand tokens, accessible components with right-to-left support, TanStack Router/Query, typed API client, secure cookie login on the same domain.

**8.2 Admin screens**: dashboard (numbers and charts), report queue (filters, search, bulk actions), report detail (status changes with the existing rules and reasons, photos, repair-proof upload, duplicates), map view, duplicate review, regions, donors, **repair campaigns** (set the repair cost and breakdown, start / close a campaign, publish the final cost and receipt), **donation review queue** (screenshot next to amount, reference and donor; approve, or reject with a reason; duplicate screenshot and reused-reference warnings), **payout account settings** (holder, bank, IBAN, account number; super admin only, password to save, every change in the audit log), **legal information settings** (super admin: legal name in Arabic/English, registration number, address, competent courts, retention periods for financial records and transfer screenshots, wrong-transfer window, privacy reply time; fills the legal pages, versioned, users asked to accept a material change, accepted version recorded per user), **contact settings** (public email, privacy email, phone, social links; shown on the website and in the app, editable any time), **partners** (add / edit / hide / delete / reorder; logo, Arabic and English name and description, link, partnership type, display period, where it appears: website home, about page, app home, "supported by" on campaigns they fund; featured partner card; funded-repair numbers computed automatically), admins (super admin), audit log, notifications, CSV export.

Notes from 8.4b: the transparency page has the figures, repairs per month (chart with a table view), the per-region table, the donation totals and every completed campaign with its final cost and receipt; the open data (`GET /api/site/open-data.csv`) has every public report and nothing about who reported it. The design's region filter was left out: the per-region table already shows each region. 8.6 should also run the accessibility check on the admin panel at phone width (scrollable tables there need the same keyboard fix as the website's).

Notes from 8.4a: the website is built by Astro as static pages (no server code of its own), so in 9.1 the one Worker serves them as static files next to the API and the admin panel. Live parts (figures, open campaigns, partners, before/after photos, contact email) are filled in the browser from the public API on the same domain (`GET /api/site/numbers` added for the figures), as plain text, never HTML. The App Store and Google Play badges say "coming soon" until Phase 10.

Notes from 8.3: the browser tests found that reinstating a suspended admin brought back the session they had before the suspension; ending an admin's sessions now also refuses every access token issued before that moment (`users.sessions_revoked_at`, tokens carry their issue time in milliseconds). The language switch's spoken name now starts with its visible word (WCAG 2.5.3).

Notes from 8.2e: admins can be given regions, suspended (signed out at once, cannot sign in until reinstated) or have their rights removed; staff rights are re-read from the database on every request, so a change applies immediately rather than when the 15-minute token expires. The donor ranking combines confirmed transfers per person with cash gifts the team records by hand.

Notes from 8.2c: the server records which legal version each user accepted (`POST /api/auth/me/accept-legal`, `legal_version_accepted` in `/api/auth/me`, `acceptance_required_from` in `/api/site/legal`); the app's "please accept the updated terms" screen comes with the legal pages (8.4). Deleting transfer screenshots after the retention period needs a scheduled job on the Worker: added in 9.1, when the Worker becomes the only host.

**8.3 Admin tests**: component tests and browser end-to-end tests (Playwright) in CI.

Note from 8.2b: the app now reads server answers leniently (`lenient()` in `@hufra/contracts`: unknown fields are ignored; the server's tests stay strict, so a leaked private field is still caught). New information can then be added to answers without breaking copies already installed. Campaigns publish their cost breakdown, final cost and receipt photo (never the contractor), shown on the app's campaign card and, from 8.4, on the website.

**8.4 Website** (`apps/web`): Astro, Arabic/English, right-to-left. Pages: home (what HUFRA is), how it works, regions covered, public transparency numbers (read-only), about / partners / donors, contact, download (app store badges once live), privacy policy, terms and donation rules (written against Libyan Law No. 6 of 2022 on electronic transactions and Law No. 5 of 2022 on cybercrime; reviewed by a Libyan lawyer before publishing; it must list the services that receive data: Cloudflare (hosting, storage), Google Firebase (Android push tokens, crash reports without names, emails or locations), OpenStreetMap tiles via our proxy), support/FAQ, partner showcase, account deletion information (required by Google Play).

Notes from 8.4c: the legal pages are `/privacy`, `/terms`, `/donation-rules` and `/delete-account` (the last is the URL Google Play asks for). Their blanks are filled from the admin panel's legal information and contact settings; until every required blank is filled they show a "draft under review" note. The owner publishes only after a Libyan lawyer has reviewed them. Signing up now counts as accepting the version published at that moment; after a material change the app asks for acceptance before it can be used (signing out is always possible). The privacy policy promises that technical records are kept 90 days: the 9.1 scheduled job must also clear session records (`refresh_tokens.ip_hash`, `user_agent`) older than 90 days, alongside the transfer screenshots.

**8.5 Shared report links**: `/r/<id>` shows the photo, area and status with "Open in the app / Get the app", plus the files that let phones open the app directly (Android `assetlinks.json`; Apple's file, which works in Phase 10).

Notes from 8.5: the app shares `/r/<id>`. The Worker answers `/r/<id>` and `/en/r/<id>` by filling the website's `/r/` page with the report's preview tags (title, description, photo), so WhatsApp and others show a card; until the Worker serves the website (9.1: give it the `ASSETS` binding) it sends the link to the old report page. `/.well-known/assetlinks.json` lists the signing keys in the `ANDROID_CERT_SHA256` variable: for now the public React Native template debug key that signs the test APKs, so only for owner testing; in Phase 10 it becomes the Play signing key. Apple's file comes with 10.2.

**8.6 Website quality**: performance budget, search engine basics, accessibility audit.

Notes from 8.6: the website and the admin panel use WOFF2 copies of Readex Pro trimmed to Arabic, Latin and punctuation (`packages/brand/scripts/web-fonts.py`, about 22 KB per weight instead of 98 KB; the apps keep the TTF files). A first visit to any page now downloads about 63 KB from our build (it was about 330 KB); `npm run budget -w @hufra/web` fails CI above the limits in `apps/web/scripts/budget.mjs`. Search engines: `sitemap.xml` (both languages, with their twins), `robots.txt` (no `/admin`, no `/api/`), a 1200 × 630 preview image, and the organisation's details on the home page. The website has browser tests in CI: every page in Arabic and English on desktop and phone with axe, no sideways scrolling and no script errors. The admin panel's tables that scroll sideways on phones can now be reached by keyboard, and its phone test runs axe on every page.

## Phase 9 — Put it together and remove the old system

**9.1 One Worker, three surfaces**: routing for API, admin and website; security headers per surface (strict script policy everywhere); one CI pipeline that tests and deploys all of it.

Notes from 9.1: `npm run build:site -w @hufra/api` builds the website and the admin panel and assembles them with the old pages' files into `apps/api/site/` (not committed), with a `_headers` file written from `src/lib/security-headers.ts`. The Worker serves those files directly (addresses without a trailing slash, e.g. `/how`), the admin panel at `/admin` (any screen address gets its page), shared reports at `/r/<id>` with preview tags, the website's 404 page for unknown addresses, and sends `/trust` to `/privacy` and `/pothole/<id>` to `/r/<id>`. Security headers per surface: the website and admin panel only allow this site's own files (no inline scripts, no framing); the API allows nothing to run; the old pages keep their own policy until 9.2. A daily job (03:17 UTC) deletes transfer screenshots after the retention period, clears hashed IPs and browser names after 90 days (migration 0020 lets the audit log clear only that), deletes long-expired sessions and closes stale pledges. CI deploys the Worker only from `main` and only after every check passes, then smoke-tests every surface and its headers on the live address. For 9.2: the old service worker (`public/sw.js`) is still installed in returning visitors' browsers; replace it with one that removes itself and its caches, then delete the old pages.

**9.2a Donation pages on the new website** (found while planning 9.2: the app's Donate button opens the donation pages built on the old site in 6.9, and the new website had none): the campaign, how much, the bank transfer with its code, the screenshot, under review, the receipt, cancelling and "My donations", plus sign-in and sign-up, rebuilt in `apps/web` at the same addresses so the old ones can go.

Notes from 9.2a: `/donate/<id>`, `/donations`, `/donations/<id>`, `/sign-in` and `/sign-up`, each also under `/en`. The Worker serves one built page for every id (like `/r/<id>`); the browser fills it from the API with the session in HttpOnly cookies (renewed once on expiry). The app opens the English pages when it is in English (`/en/donate/<id>` through the one-time sign-in link); an old or used link leads to `/sign-in`. They are under the strict website policy, left out of search engines, and the website's browser tests walk the whole donation (sign-up, transfer, screenshot made small in the browser, review, receipt, cancelling, the app's link) with axe on each step. Without the built website (tests, local API) the old pages stay until 9.2b.

**9.2b Remove the old citizen website and Capacitor app**: old pages, scripts and styles, service worker/PWA, the Capacitor shell and its workflow, and their tests. The old Pages project is deleted. Reports and "I saw it too" then need an account on the server too (built and tested in 7.1).
- You: confirm the switch-over date (done: nobody but the owner used the old site or app, so straight after 9.2a). After 9.2b is merged, delete the old Pages project `hufra` (`hufra.pages.dev`) in the Cloudflare dashboard; keep the Worker, the D1 database and the R2 bucket.

Notes from 9.2b: the old server-rendered pages (`apps/api/src/pages`), their files (`apps/api/public`), the Capacitor shell (`ios/`, `www/`, `capacitor.config.ts`, its build scripts and `mobile-build.yml`), the Pages build (`vite.config.ts`, the Pages `wrangler.jsonc`) and the Pages deploy job are gone; the Worker's config is now `apps/api/wrangler.jsonc`, the only one. Old addresses lead to the new pages (`/map` → `/`, `/report` → the app download, `/login` → `/sign-in` keeping where to go, `/register`, `/account`, `/trust`, `/pothole/<id>` → `/r/<id>`). `/sw.js` is now a worker that clears the old offline caches and removes itself from browsers that still have it. The server always requires an account to report or confirm (the switch is removed, not just turned on), and no longer trusts the Capacitor app's origins. The docs (README, architecture, security, accessibility, mobile) describe the current system.

**9.3 Full test pass on your devices**: a written checklist covering every journey, on Android and on iPhone via Sideloadly, in Arabic and English, online and offline.
- You: run the checklist on your Android phone and iPhone, and send me the item numbers that are wrong (with a screenshot and what you expected). I fix them, and you re-check only those items.

Notes from 9.3: the checklist is [DEVICE_TEST_CHECKLIST.md](DEVICE_TEST_CHECKLIST.md): first start, browsing without an account, accounts, reporting online and with no connection (the outbox, including a cut-off upload and a phone restart), confirming, status changes and push, settings, donating (both open modes, confirm, reject, cancel, a reused screenshot), screen readers, shared links, the website on the phone and odd situations, all in Arabic on both phones, then an English pass, and a clean-up at the end. Builds come from the *App build* workflow on `main`. It is also the list to run before each store release.

Found in the first device pass (#42): iPhone photos were refused because the iPhone's JPEG encoder adds a small EXIF block; the server now removes metadata from JPEG photos itself (location can never be stored). The live database, older than this repository, lacked the "I saw it too" parts of migration 0006 (`potholes.upvotes_count`, `pothole_upvotes`), which broke the admin queue, duplicates and the app's report lists while every test passed on a fresh database; migration 0021 repairs it, and `scripts/check-schema.ts` now compares production's structure with the migrations on every pull request (report) and every deploy (blocking, before the Worker goes live).

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
| 13 | Same-bank donors | The account number is shown next to the IBAN so donors at the same bank can make an internal transfer instead of LYPAY. |
| 14 | Partners | Managed by the owner in the admin panel (add, hide, remove later) and showcased on the website and in the app. |
| 15 | Contact details and legal text | Contact email, legal name, address and retention periods entered later by the owner in admin settings. Privacy policy and terms follow Libyan law and are reviewed by a Libyan lawyer before publishing. |
| 16 | Where donating happens | On the **website** (`/donate/<campaign>`), opened from the app in an **in-app browser** (Safari View Controller / Chrome Custom Tabs) and already signed in through a one-time link. Apple guideline 3.2.2(iv) may require Safari instead: a **server switch** in the admin settings moves iPhone (or Android) to the phone's own browser without a new build. It only ever moves towards the stricter option. |
| 17 | Money units | Donors always see **Libyan dinar (د.ل)**. The server stores whole thousandths of a dinar (exact sums; the unit Moamalat uses). |
| 18 | Card payments | **Moamalat** later, on the same website page: our server signs each payment (the secret key never goes in the app) and confirms donations automatically from Moamalat's notification. Needs a merchant contract (MID, TID, key) and test credentials first. |

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
