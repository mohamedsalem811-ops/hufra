# HUFRA (حفرة): the app, offline reports and builds

The citizen app is `apps/mobile` (Expo, React Native, iPhone and Android). It
talks to the same Cloudflare Worker as the website and the admin panel
(`apps/api`). (Until plan 9.2 there was also an older Capacitor app and a
server-rendered citizen website with an offline service worker; both were
removed.)

## 1. How the app talks to the server

- **Sign-in:** `POST /api/auth/login` returns `{ access_token, refresh_token, user }`
  to the app (it sends no `Origin` header); web pages get HttpOnly cookies only.
  `POST /api/auth/refresh` rotates the refresh token (each works once; reuse
  signs every session of that account out). Tokens are kept in the phone's
  secure storage.
- **An account is needed** to report and to confirm a pothole ("I saw it too").
- **Donating** happens on the website: the app opens `/donate/<id>` (or
  `/en/donate/<id>`) already signed in through a one-time link
  (`POST /api/auth/web-handoff`, 60 seconds, single use), in an in-app browser
  or the phone's browser as the team sets in the admin panel.
- **Shared links** `https://<site>/r/<id>` open the report in the app on
  Android (App Links, `/.well-known/assetlinks.json`); otherwise the website shows it.
- Every endpoint: `GET /api/openapi.json`, built from `packages/contracts`.

## 2. Offline reports (the outbox)

- Photos are made small on the phone before upload
  (`src/features/report/photo-compress.ts`: a full image and a thumbnail within
  `PHOTO_LIMITS`); the server re-checks each file's real format, size and
  pixels, and refuses location data.
- Every report gets a `client_report_uuid`. If there is no signal or the upload
  is cut, the report and its photos wait in the outbox
  (`src/features/outbox`: photos copied to the app's documents folder) and are
  sent when the connection returns.
- The server deduplicates on `client_report_uuid`: a retried report that
  already arrived answers `200` with `deduplicated: true` and a fresh upload
  permit for the missing photos, instead of creating a second pothole.

## 3. Push notifications

With the secret `FCM_SERVICE_ACCOUNT` set on the Worker, status changes on a
person's reports (and new reports, for admins) are sent through Firebase Cloud
Messaging HTTP v1 to their Android phones (`src/lib/fcm.ts`,
`src/lib/notifications.ts` in `apps/api`). Delivery runs after the response,
tokens of uninstalled apps are switched off automatically, and a Google outage
never fails the request.

### Setting up Android push (one time)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project (or use an existing one).
2. **Add an Android app** with package name `ly.tripoli.hufra`. Download `google-services.json`.
3. In GitHub, go to repo **Settings -> Secrets and variables -> Actions -> New repository secret**. Name it `GOOGLE_SERVICES_JSON` and paste the whole file. The **App build** workflow (`.github/workflows/app-build.yml`) writes it to `apps/mobile/google-services.json`, and `apps/mobile/app.config.js` adds it to the build. The file is never committed.
4. In Firebase, open **Project settings -> Service accounts -> Generate new private key**. Add the whole JSON file as the repository secret `FCM_SERVICE_ACCOUNT`; CI copies it to the Worker on every deploy (it is checked and never printed). Treat it like a password.
5. Run **App build** again and install the new APK. Allow notifications when the app asks. While signed in, the app registers the phone; tapping a notification opens the report.

Without these secrets the app still builds and works, just without push.

### iPhone push

Apple only delivers push to apps signed with a paid Apple Developer account,
so the sideloaded test builds cannot receive it. It comes with the store
release (plan 10.2).

## 4. Builds for testing

- **App build** (`.github/workflows/app-build.yml`; Actions -> App build -> Run
  workflow, a tag `app-v*`, or any pull request that changes the app): a release
  APK for Android and an unsigned `.ipa` for iPhone.
- **Android:** download the APK artifact and install it (allow installing from
  this source). Test APKs are signed with the public template debug key, so each
  new one installs over the last.
- **iPhone:** install the `.ipa` with Sideloadly or AltStore and your Apple ID;
  then on the phone trust it in Settings -> General -> VPN & Device Management.
  A free Apple ID build lasts 7 days; re-install to refresh.
- **End-to-end journeys** (`.github/workflows/app-e2e.yml`): a test APK runs
  the main journeys with Maestro on an Android emulator against a seeded local
  API. See [TESTING.md](TESTING.md).

Store signing and releases come in plan Phase 10.
