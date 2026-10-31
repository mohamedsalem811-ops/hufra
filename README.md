# HUFRA / حفرة

A bilingual (Arabic/English), community-driven pothole-reporting platform for
Greater Tripoli, Libya. Citizens report potholes with photos and GPS location;
municipal admins triage, verify, and track repairs to completion — all on a
transparent, publicly-visible map and dashboard.

**اقرأ هذا الملف بالعربية:** [الانتقال إلى النسخة العربية ⬇️](#حفرة--hufra-بالعربية)

---

## 1. Overview

| | |
|---|---|
| **Name** | HUFRA (حفرة — Arabic for "pothole") |
| **Purpose** | Let residents of Greater Tripoli report road potholes with photos + GPS, and let city admins verify, schedule repair, and mark them fixed — with the whole lifecycle publicly visible for accountability. |
| **Audience** | General public (guest + registered reporters), municipal `admin` staff, `super_admin` (system owners) |
| **Languages** | Arabic (RTL, default) and English (LTR), fully switchable at runtime, no page reload |
| **Stack** | Hono (TypeScript) on Cloudflare Workers/Pages, Cloudflare D1 (SQLite), Cloudflare KV, Cloudflare R2, vanilla JS + Leaflet on the frontend (no client framework/build step) |

## 2. Key Features

- **Guest or authenticated reporting** — anyone can submit a report; registered
  users additionally get a "My Reports" history and account page.
- **Photo evidence** — up to 3 client-compressed photos per report (WebP,
  ≤2 photos before submit typical, server-enforced ceiling), served from R2
  with immutable long-lived cache headers.
- **Interactive public map** (Leaflet + marker clustering) with status/region/
  severity filters and a "near me" geolocation search.
- **Automatic duplicate detection** — any new report within ~50 m of an
  existing *open* (non-fixed) report is flagged for admin review, never
  auto-merged or auto-rejected.
- **Full lifecycle tracking** — `reported → verified → under_repair → fixed`,
  with an immutable, append-only `status_history` audit trail per report
  (see [Architecture](docs/ARCHITECTURE.md) for how immutability is enforced
  at the SQLite trigger level, not just in application code).
- **Admin login is email + password** — mandatory TOTP 2FA was evaluated and
  then intentionally cancelled per product decision (see
  [docs/SECURITY.md](docs/SECURITY.md) for the rationale and what's kept
  dormant for cheap future reinstatement).
- **Role-based access control** — `user` / `admin` / `super_admin`, enforced
  server-side on every route (never trusted from client-supplied claims).
- **Public transparency dashboard** — aggregate counters, by-region/by-status/
  by-severity/by-month breakdowns, average fix time — cached briefly in KV so
  the public homepage stays fast under load.
- **Immutable audit log** — every state-changing admin action
  (`pothole.status_change`, `region.create`, `user.promote`, …) is recorded
  with before/after JSON snapshots in an append-only `audit_logs` table.
- **Rate limiting** — per-IP and per-account limits on report submission,
  login attempts, and photo uploads, backed by Cloudflare KV fixed windows.
- **GDPR-style self-service** — any user can export their own data
  (`GET /api/auth/me/export`) or soft-delete their account
  (`POST /api/auth/me/delete`), with anonymized email retained for referential
  integrity of past reports.
- **Accessibility-first, low-bandwidth-first** — server-rendered HTML + vanilla
  JS (no SPA framework/bundle), 44px minimum tap targets, dark mode, adjustable
  text size, full keyboard navigation, WCAG 2.2 AA color-contrast targets. See
  the [Accessibility Audit](docs/ACCESSIBILITY.md) for exact results and the
  handful of items still open.
- **Top Donor / Top Reporter homepage highlight** — a manually admin-entered
  donor ledger (name + amount in Libyan Dinar, no payment gateway/Stripe/
  PayPal integration — donations happen off-platform, e.g. bank transfer, and
  are simply recorded by an admin) plus an automatically computed "top
  reporter" (the registered user with the most submitted reports), both shown
  at the end of the public homepage.

## 3. Architecture at a Glance

```
Browser (server-rendered HTML + vanilla JS, RTL/LTR, Leaflet map)
        │  fetch() → /api/*
        ▼
Hono app on Cloudflare Workers (src/index.tsx)
        │
        ├── src/routes/auth.ts       — register/login/refresh/2FA/GDPR self-service
        ├── src/routes/potholes.ts   — public CRUD + lifecycle status transitions
        ├── src/routes/photos.ts     — multipart photo upload → R2
        ├── src/routes/media.ts      — binary photo streaming from R2
        ├── src/routes/regions.ts    — Greater Tripoli region CRUD (admin)
        ├── src/routes/donors.ts     — manual donor ledger (public top-donor read, admin CRUD)
        └── src/routes/admin.ts      — notifications, duplicates, analytics, audit log, admin management
        │
        ├── Cloudflare D1 (SQLite)  — relational data + triggers (see docs/ARCHITECTURE.md)
        ├── Cloudflare KV           — rate-limit counters + short-lived counter cache
        └── Cloudflare R2           — original + thumbnail photo objects
```

Full details — including the ER diagram, the reasoning behind the
`pending_status_change` staging-table pattern, and every design assumption —
are in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## 4. API Summary

All routes are mounted under `/api/*`. Full request/response shapes are in
the route source files (`src/routes/*.ts`); this is the entry-point index.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | none | Create a `user` account |
| POST | `/api/auth/login` | none | Login (email + password only, any role) |
| POST | `/api/auth/refresh` | refresh cookie | Rotate access token |
| POST | `/api/auth/logout` | none | Clear session cookies |
| POST | `/api/auth/change-password` | access token | Change own password (rate-limited, revokes refresh tokens) |
| GET | `/api/auth/me` | access token | Current user profile |
| GET | `/api/auth/me/export` | access token | Export own account + reports (GDPR) |
| POST | `/api/auth/me/delete` | access token | Soft-delete own account (GDPR) |
| GET | `/api/potholes` | none | List/filter reports (`status`, `region_id`, `severity`, `bbox`, `near_lat`/`near_lng`/`radius_m`) |
| GET | `/api/potholes/counters` | none | Public aggregate totals (KV-cached 60s) |
| GET | `/api/potholes/:id` | none | Report detail + photos + status history |
| POST | `/api/potholes` | none (optional) | Submit a report (guest or authenticated) |
| PATCH | `/api/potholes/:id/status` | admin/super_admin | Transition report status |
| GET | `/api/potholes/mine/list` | access token | Reports submitted by the current user |
| GET | `/api/potholes/top-reporter` | none | Registered user with the most reports (KV-cached 60s) |
| GET | `/api/potholes/showcase` | none | Home-page photo showcase: `{fixed, in_progress}` (before/during/after thumbs, KV-cached 60s) |
| DELETE | `/api/potholes/:id` | admin/super_admin | Soft-delete a report and its photos |
| POST | `/api/photos/:potholeId` | none (optional) | Upload a photo (multipart `full`+`thumb`) |
| DELETE | `/api/photos/:photoId` | admin/super_admin | Soft-delete a photo |
| GET | `/media/:key` | none | Stream a photo/thumbnail from R2 |
| GET | `/api/regions` | none | List active regions (`?all=1` includes inactive) |
| POST | `/api/regions` | admin/super_admin | Create a region |
| PATCH | `/api/regions/:id` | admin/super_admin | Update a region |
| DELETE | `/api/regions/:id` | admin/super_admin | Delete a region (409 if any report references it) |
| GET | `/api/donors/top` | none | Highest-amount donor (name + amount in LYD), or `null` |
| GET | `/api/donors` | admin/super_admin | Full donor list, ordered by amount |
| POST | `/api/donors` | admin/super_admin | Record a new donor entry (name, amount_lyd, optional note) |
| PATCH | `/api/donors/:id` | admin/super_admin | Update a donor entry |
| DELETE | `/api/donors/:id` | admin/super_admin | Soft-delete a donor entry |
| GET | `/api/admin/notifications` | admin/super_admin | Dashboard bell/badge feed |
| POST | `/api/admin/notifications/read-all` | admin/super_admin | Mark all read |
| GET | `/api/admin/duplicates` | admin/super_admin | Pending duplicate-flag queue |
| PATCH | `/api/admin/duplicates/:id` | admin/super_admin | Confirm (soft-deletes report) or reject a duplicate flag |
| GET | `/api/admin/analytics` | admin/super_admin | By-status/region/severity/month aggregates |
| GET | `/api/admin/reports` | admin/super_admin | Full moderation queue, filterable by `status` |
| GET | `/api/admin/audit-logs` | super_admin | Immutable audit trail viewer |
| GET | `/api/admin/admins` | super_admin | List admin/super_admin accounts |
| POST | `/api/admin/admins/promote` | super_admin | Promote a user to `admin`/`super_admin` |
| POST | `/api/admin/admins/demote` | super_admin | Remove admin rights (not yourself, not the last super admin) |

Public pages: `/`, `/map`, `/report`, `/transparency`, `/trust`,
`/pothole/:id`, `/login`, `/register`, `/account`, `/admin`.

## 5. Data Model & Storage

- **Cloudflare D1 (SQLite)** — `users`, `regions`, `potholes`,
  `pothole_photos`, `status_history` (immutable), `duplicate_flags`,
  `notifications`, `audit_logs` (immutable), `rate_limit_events`,
  `refresh_tokens`, `donors` (manually admin-entered, amount in Libyan Dinar,
  no payment gateway involved), plus small helper tables (`user_code_seq`,
  `pending_status_change`). Schema + triggers live in `migrations/*.sql`;
  full ER diagram in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Cloudflare KV** — fixed-window rate-limit counters (`rl:*`) and the
  60-second public counters cache (`counters:v1`).
- **Cloudflare R2** — original + thumbnail photo binaries, keyed by
  unguessable UUID-based paths (`photos/…`, `thumbs/…`).

No data is ever stored in memory or on the Workers filesystem — everything
persists in one of the three Cloudflare services above, per the platform's
architectural constraints.

## 6. User Guide

**Reporting a pothole (no account needed):**
1. Go to `/report`, drag the map pin to the exact location (or tap "Locate
   me").
2. Add up to 3 photos.
3. Fill in a description and pick a severity (minor/medium/severe).
4. Review and submit. You'll get a report ID immediately; track it on `/map`
   or `/pothole/:id`.

**Tracking reports:** the public map (`/map`) and transparency dashboard
(`/transparency`) show every report and citywide statistics — no login
required.

**For municipal admins:** log in at `/login` with email + password to reach
the admin dashboard (`/admin`) directly — no 2FA step. From the dashboard:
review incoming reports, resolve flagged duplicates, transition report
status, and (for `super_admin`) manage other admins and view the immutable
audit log.

**Default login (testing):** the first super admin is created by migration
`0006` and auto-repaired on login:

| | |
|---|---|
| Email | `admin@hufra.ly` |
| Password | `Hufra@Admin2026!` |
| Role | `super_admin` (login at `/login`, dashboard at `/admin`) |

This credential is public in the repository. Change it right away from
`/account` -> *Change password*, and always set a strong `JWT_SECRET`
(`wrangler pages secret put JWT_SECRET`; locally put it in `.dev.vars`).

**Admin delete controls** (every delete asks for confirmation and is audited):
reports (card and detail), individual photos, regions (blocked while reports
use them), donors, and admin rights.

**Home page showcase:** the homepage keeps photos of reports that are
*under repair* (before + during) and *fixed* (before + after).

**iOS app (sideload for testing):** see
[docs/MOBILE_AND_OFFLINE.md](docs/MOBILE_AND_OFFLINE.md) - build the unsigned
IPA with the *Mobile Build* GitHub Action and install via Sideloadly/AltStore.
The app bundles its own interface (instant tabs, works offline); only data is fetched.

**Speed:** tabs use a client-side router (map stays alive), assets are versioned and cached
immutably, and map tiles go through the edge-cached `/tiles` proxy (`TILE_UPSTREAM` to change provider).

## 7. Development

```bash
npm install
npm run build          # Vite build → dist/_worker.js
npm run dev:sandbox     # wrangler pages dev dist --ip 0.0.0.0 --port 3000 (or via PM2, see ecosystem.config.cjs)

# Database (local D1, SQLite file under .wrangler/state/v3/d1)
npm run db:migrate:local
npm run db:seed         # re-applies the region seed data

# Tests
npm test                # vitest run — 171 tests
npm run test:coverage   # + v8 coverage report (text/html/lcov/json-summary)
```

CI (`.github/workflows/ci.yml`) runs `tsc --noEmit` → `npm run build` →
`npm run test:coverage` on every push/PR to `main`, and fails the build if
statement coverage drops below 70%.

See also:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, ER diagram,
  and the four real bugs found + fixed during integration testing.
- [docs/SECURITY.md](docs/SECURITY.md) — security checklist (auth, RBAC,
  rate limiting, secrets, data protection).
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) — WCAG 2.2 AA audit results.

## 8. Deployment

Target platform: Cloudflare Pages (Workers). `wrangler.jsonc` declares the
`DB` (D1), `KV`, and `PHOTOS` (R2) bindings; the placeholder
`database_id`/`kv id` values must be replaced with real Cloudflare resource
IDs before deploying. Deployment has not yet been executed for this project —
see the repository's task history for the two supported deploy paths
(bring-your-own Cloudflare account vs. Genspark-hosted).

## 9. Known Gaps / Next Steps

- `src/routes/photos.ts` and `src/routes/media.ts` have low automated test
  coverage (5.9% / 15.4%) — both involve binary file upload/streaming that
  is harder to exercise without a real R2-compatible multipart request; a
  future pass could add integration tests using synthetic `File`/multipart
  bodies against the fake R2 bucket.
- No CI job currently deploys automatically on merge to `main` — deployment
  is a manual, explicit step by design (per the project's Cloudflare
  deployment workflow) until a deploy target/account is confirmed.
- Accessibility audit found a small number of open items (see
  [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) §5) — none are blocking,
  all are tracked with concrete fixes.

---

# حفرة (HUFRA) بالعربية

## 1. نظرة عامة

منصة **حفرة** هي تطبيق ويب مجتمعي ثنائي اللغة (عربي/إنجليزي) للإبلاغ عن حفريات
الطرق في طرابلس الكبرى، ليبيا. يمكن للمواطنين الإبلاغ عن الحفريات بالصور
وتحديد الموقع الجغرافي، ويقوم موظفو البلدية بمراجعة البلاغات والتحقق منها
وتتبع أعمال الإصلاح حتى الانتهاء — وكل ذلك مرئي للعامة على خريطة ولوحة بيانات
شفافة لتعزيز المساءلة.

| | |
|---|---|
| **الاسم** | حفرة (HUFRA) |
| **الهدف** | تمكين سكان طرابلس الكبرى من الإبلاغ عن حفريات الطرق بالصور والموقع، وتمكين موظفي البلدية من التحقق وجدولة الإصلاح وتأكيد الانتهاء — مع إظهار كامل دورة حياة البلاغ للعامة. |
| **الفئة المستهدفة** | عامة الجمهور (زائر أو مستخدم مسجّل)، موظفو البلدية (`admin`)، مسؤول النظام (`super_admin`) |
| **اللغات** | العربية (من اليمين لليسار، الافتراضية) والإنجليزية (من اليسار لليمين)، قابلة للتبديل فورًا دون إعادة تحميل الصفحة |
| **التقنيات** | Hono (بلغة TypeScript) على Cloudflare Workers/Pages، وقاعدة بيانات Cloudflare D1 (SQLite)، وCloudflare KV، وCloudflare R2، وواجهة أمامية بجافاسكريبت خام + خريطة Leaflet (بدون إطار عمل أو خطوة بناء في المتصفح) |

## 2. أهم المزايا

- **الإبلاغ كزائر أو كمستخدم مسجّل** — يمكن لأي شخص إرسال بلاغ؛ ويحصل
  المستخدمون المسجّلون إضافيًا على سجل "بلاغاتي" وصفحة حساب شخصي.
- **إثبات بالصور** — حتى 3 صور مضغوطة من جهة المتصفح لكل بلاغ (بصيغة WebP)،
  تُخزَّن في R2 وتُعرض بترويسات تخزين مؤقت طويلة الأمد وثابتة.
- **خريطة تفاعلية عامة** (Leaflet مع تجميع العلامات) مع فلاتر للحالة والمنطقة
  ودرجة الخطورة، وبحث "قريب مني" باستخدام الموقع الجغرافي.
- **رصد تلقائي للتكرار** — أي بلاغ جديد يقع ضمن نحو 50 مترًا من بلاغ مفتوح
  (غير مصلَّح) قائم يتم وضع علامة عليه لمراجعة الإدارة، دون دمج أو رفض تلقائي.
- **تتبع كامل لدورة الحياة** — `تم الإبلاغ ← تم التحقق ← قيد الإصلاح ← تم الإصلاح`،
  مع سجل تاريخي ثابت لا يمكن تعديله (`status_history`) لكل بلاغ (راجع
  [وثيقة الهيكلة](docs/ARCHITECTURE.md) لمعرفة كيفية فرض هذا الثبات على مستوى
  قاعدة البيانات نفسها، وليس فقط في كود التطبيق).
- **تسجيل دخول الإدارة بالبريد الإلكتروني وكلمة المرور فقط** — تم تقييم خيار
  التحقق الثنائي الإلزامي (TOTP) ثم إلغاؤه عمدًا بقرار من المشروع (راجع
  [docs/SECURITY.md](docs/SECURITY.md) للأسباب وما تم الاحتفاظ به معطّلاً
  لإعادة التفعيل بسهولة لاحقًا).
- **صلاحيات مبنية على الأدوار** — `مستخدم`/`إدارة`/`مسؤول عام`، تُفرض من جهة
  الخادم على كل مسار (لا يُعتمد أبدًا على أي ادعاء دور يرسله المتصفح).
- **لوحة شفافية عامة** — إحصائيات مجمّعة حسب المنطقة/الحالة/درجة الخطورة/الشهر،
  ومتوسط زمن الإصلاح — مع تخزين مؤقت قصير في KV لضمان سرعة الصفحة الرئيسية.
- **سجل تدقيق ثابت** — كل إجراء إداري مغيّر للحالة (تغيير حالة بلاغ، إنشاء
  منطقة، ترقية مستخدم...) يُسجَّل مع لقطة "قبل/بعد" في جدول تدقيق لا يمكن
  تعديله أو حذفه.
- **تحديد لمعدل الطلبات** — حدود لكل عنوان IP وكل حساب على إرسال البلاغات
  ومحاولات تسجيل الدخول ورفع الصور، عبر نوافذ ثابتة في Cloudflare KV.
- **خدمة ذاتية بمعايير GDPR** — يمكن لأي مستخدم تصدير بياناته الخاصة
  (`GET /api/auth/me/export`) أو حذف حسابه بشكل مبطّن (`POST /api/auth/me/delete`)
  مع الاحتفاظ ببريد إلكتروني مموّه للحفاظ على تكامل البلاغات السابقة.
- **إمكانية الوصول أولًا، والاتصال منخفض السرعة أولًا** — صفحات مُصيَّرة من
  جهة الخادم + جافاسكريبت خام (بدون إطار SPA)، أهداف لمس بحد أدنى 44 بكسل،
  وضع مظلم، حجم نص قابل للتعديل، تنقّل كامل بلوحة المفاتيح، وأهداف تباين ألوان
  متوافقة مع WCAG 2.2 AA. راجع
  [تقرير تدقيق إمكانية الوصول](docs/ACCESSIBILITY.md) للنتائج التفصيلية
  والنقاط القليلة المتبقية.
- **قسم "أبرز المساهمين" في الصفحة الرئيسية** — سجل داعمين يُدخله المسؤول
  يدويًا (الاسم والمبلغ بالدينار الليبي، دون أي بوابة دفع أو تكامل مع Stripe
  أو PayPal — تتم عملية التبرع خارج المنصة مثل التحويل البنكي ويكتفي المسؤول
  بتسجيلها) بالإضافة إلى "الأكثر مساهمة في البلاغات" الذي يُحسب تلقائيًا
  (المستخدم المسجّل الذي قدّم أكبر عدد من البلاغات)، ويظهران في نهاية الصفحة
  الرئيسية العامة.

## 3. لمحة عن الهيكلة

راجع [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (بالإنجليزية، مع مخطط ER
كامل) للتفاصيل الكاملة عن تصميم النظام والأخطاء الأربعة الحقيقية التي اكتُشفت
وأُصلحت أثناء اختبارات التكامل.

## 4. ملخص واجهة البرمجة (API)

راجع الجدول الكامل بالإنجليزية أعلاه (القسم 4) — جميع المسارات مُوثّقة هناك
مع تحديد من يحتاج تسجيل دخول ومن هو الدور المطلوب.

## 5. نموذج البيانات والتخزين

- **Cloudflare D1 (SQLite)**: `users`، `regions`، `potholes`،
  `pothole_photos`، `status_history` (ثابت)، `duplicate_flags`،
  `notifications`، `audit_logs` (ثابت)، `rate_limit_events`، `refresh_tokens`،
  `donors` (سجل داعمين يُدخله المسؤول يدويًا بالدينار الليبي، دون بوابة دفع)،
  وجداول مساعدة صغيرة. المخطط والمُحرِّكات (triggers) في `migrations/*.sql`؛
  ومخطط ER الكامل في [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Cloudflare KV**: عدّادات تحديد معدل الطلبات، وذاكرة تخزين مؤقت للعدّادات
  العامة لمدة 60 ثانية.
- **Cloudflare R2**: ملفات الصور الأصلية والمصغّرة، بمفاتيح غير قابلة للتخمين.

## 6. دليل الاستخدام

**للإبلاغ عن حفرة (بدون حساب):**
١. اذهب إلى `/report`، واسحب الدبوس على الخريطة لتحديد الموقع بدقة (أو اضغط
   "حدد موقعي الحالي").
٢. أضف حتى 3 صور.
٣. اكتب وصفًا واختر درجة الخطورة (خفيفة/متوسطة/خطيرة).
٤. راجع البيانات وأرسل البلاغ. ستحصل على رقم بلاغ فورًا، ويمكنك تتبعه من
   خلال `/map` أو `/pothole/:id`.

**لتتبع البلاغات:** الخريطة العامة (`/map`) ولوحة الشفافية (`/transparency`)
تعرضان كل البلاغات وإحصائيات المدينة — دون الحاجة لتسجيل الدخول.

**لموظفي البلدية:** سجّل الدخول من `/login` بالبريد الإلكتروني وكلمة المرور
للوصول مباشرة إلى لوحة الإدارة (`/admin`) — دون أي خطوة تحقق ثنائي.

## 7. التطوير

راجع القسم 7 بالإنجليزية أعلاه لأوامر التشغيل والاختبار الكاملة
(`npm install`، `npm run build`، `npm test`، إلخ).

## 8. النشر

المنصة المستهدفة هي Cloudflare Pages (Workers). لم يُنفَّذ النشر الفعلي بعد
لهذا المشروع.

## 9. الفجوات المعروفة والخطوات التالية

راجع القسم 9 بالإنجليزية أعلاه.
