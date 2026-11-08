# HUFRA admin panel (`apps/admin`)

React + Vite + TypeScript, Tailwind CSS 4 with the brand tokens (`packages/brand`), TanStack Router and Query, and the shared schemas (`packages/contracts`) for every API answer. Arabic (right to left) by default, English on request.

It is served at **`/admin`** on the same domain as the API. Sign-in uses the API's HttpOnly cookies (`hufra_session`, `hufra_refresh`); page scripts never see a token. Only `admin` and `super_admin` accounts get in; a citizen account is refused and its session ended.

## Run it locally

```bash
npm run dev:worker          # the API on http://localhost:3000 (or the seeded test API, below)
npm run dev -w @hufra/admin # http://localhost:5174/admin/
```

With the seeded test API instead (super admin `owner@e2e.ly`, password in `apps/api/tests/e2e/server.ts`):

```bash
npx tsx apps/api/tests/e2e/server.ts 8788
HUFRA_API=http://localhost:8788 npm run dev -w @hufra/admin
```

## Checks

```bash
npm run typecheck -w @hufra/admin
npm run test:coverage -w @hufra/admin
npm run build -w @hufra/admin
```

Browser tests (Playwright, `e2e/`): they start the seeded test API on port 8788 and the panel on 5184 themselves, so stop a local API on 8788 first. The first time, install Chromium with `npx playwright install chromium`.

```bash
npm run e2e -w @hufra/admin
```

They sign in, verify a report and export it as CSV, confirm a donation, add and suspend an admin, merge a duplicate, check every page for accessibility problems (axe, WCAG 2.1 AA) in Arabic and English, and check a phone-sized screen. CI runs them on every pull request.

Serving the built panel from the Worker at `/admin` is part of plan step 9.1; until then the old admin page stays at `/admin` in production.
