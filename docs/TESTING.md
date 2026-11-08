# Testing HUFRA

| What | Where | Runs |
|---|---|---|
| API unit + integration tests (real routes on an in-memory database), coverage floor 70 % | `apps/api/tests` | CI on every PR (`npm test -w @hufra/api`) |
| Shared packages: contracts, brand (WCAG contrast) | `packages/*/tests` | CI on every PR (`npm run test:packages`) |
| App unit + component tests (Jest), coverage floors in `apps/mobile/jest.config.js` | `apps/mobile/src/**/*.test.ts(x)` | CI on every PR (`npm test -w @hufra/mobile -- --coverage`) |
| App end-to-end journeys on an Android 14 emulator (Maestro) | `apps/mobile/.maestro` | `.github/workflows/app-e2e.yml`: PRs touching the app, the API or packages, and on demand |
| Website browser tests (Playwright): every page in both languages with axe, and the whole donation journey (sign-up, transfer, screenshot, review, receipt, cancelling, the app's sign-in link) | `apps/web/e2e` | CI on every PR (`npm run e2e -w @hufra/web`) |
| By a person on real phones (Android and iPhone, Arabic and English, online and offline) before a release | [DEVICE_TEST_CHECKLIST.md](DEVICE_TEST_CHECKLIST.md) | By hand, plan 9.3 and before each store release |

## The seeded test API

`apps/api/tests/e2e/server.ts` runs the real API on a fresh in-memory database
and serves the website's static files. It creates:

- `owner@e2e.ly` (super admin) and `donor@e2e.ly` (`سالم`), password `Str0ngP@ssw0rd!`
- report #1 on شارع الجمهورية with a photo, reported by the donor
- donations switched on with test bank details, and campaign #1 (1,200 د.ل)

It prints the ids and tokens as JSON on its first line. Nothing touches production.

The website's browser tests start it themselves (`apps/web/playwright.config.ts`). By hand:

```bash
npx tsx apps/api/tests/e2e/server.ts 8788
```

## The app journeys (Maestro)

The workflow builds a **test APK** (`HUFRA_E2E=1`, `EXPO_PUBLIC_API_URL=http://10.0.2.2:8788`):
the only difference from a real build is that plain HTTP to the local test API is
allowed (`plugins/with-e2e-cleartext.js`). Flows, in order:

1. first run: welcome, location and notification permissions
2. sign in from the Account tab
3. Home: greeting and city numbers
4. a report opened from a link (`hufra://pothole/1`): details, timeline, repair campaign
5. My reports and its filters
6. Settings: text size and appearance
7. a new report: GPS location, a gallery photo, severity, review, sent

Screenshots, Maestro's debug output and the API log are uploaded as the
`HUFRA-e2e-results` artifact of every run.
