# HUFRA mobile app · تطبيق حفرة

The citizen app for iOS and Android, built with **Expo SDK 58** (React Native 0.88, React 19, Expo Router, TypeScript strict).
Plan: `docs/EXECUTION_PLAN.md`, Phase 5 and 6. Designs: the "App screens (4.2)" page of the design canvas.

| | |
|---|---|
| App id | `ly.tripoli.hufra` (iOS bundle id and Android package) |
| Name on the phone | حفرة (native projects are named `HUFRA`; see `plugins/with-display-name.js`) |
| Deep-link scheme | `hufra://` |
| Brand | colours, type scale and spacing from `@hufra/brand`; icons and splash from `packages/brand/assets/app` |
| API contracts | `@hufra/contracts` (shared zod schemas) |

## Layout

```
src/
  app/          Expo Router routes only: _layout.tsx boots the app; onboarding/ (first run); (tabs)/ (Home, Map, Report, My reports, Account)
  app-shell/    boot (saved language/theme/first-run flag, layout direction), onboarding state, provider stack
  permissions/  location and notification prompts (asked only after our own explanation screen)
  features/     feature modules: map/ (MapLibre map, clustering, filters, preview), report/ (report flow, photo compression, submit), outbox/ (offline queue), auth/ (session, sign-in, sign-up), reports/ (status, badges, formatting)
  screens/      screen bodies rendered by routes, with colocated tests
  components/   shared UI (AppText, Button, TabBar, ErrorView)
  api/          typed API client (zod contracts, single-flight token refresh), query cache, token store
  i18n/         Arabic/English text and right-to-left handling
  theme/        brand colours (light/dark/system), Readex Pro fonts
  config/       API address per build (EXPO_PUBLIC_API_URL, default: the live Worker)
  storage/      Keychain/Keystore key-value store
```

**Language and direction.** Arabic is the default on every phone. The native layout direction is fixed when the app starts, so the app reloads once (behind the splash screen) when the direction has to change, and right after the person switches language.

**Map.** MapLibre with OpenStreetMap raster tiles from our own edge-cached `/tiles` proxy (no key, no cost). Reports in the visible area come from the public list endpoint (bbox, padded and rounded so small pans reuse the cache). Pins are grouped on the phone with `supercluster` and drawn as React views, so every status has its own glyph (never colour alone) and counts need no map fonts.

**Reporting.** Account required (signed-out people see why, then come back to the report). Location: the map moves under a fixed pin, street suggested by the phone's geocoder. Photos: camera (permission asked at that moment) or gallery, up to 3, each re-encoded on the phone to the server limits (≤1280 px ≤400 KB plus a ≤320 px ≤64 KB thumbnail) so EXIF/GPS never leaves the phone. Submit creates the report once (a device id makes re-sends return the same report) and uploads photos with the returned permit; a failed photo upload retries from that photo.

**Offline.** A report that cannot be sent (no signal, connection dropped, server busy) is kept in SQLite on the phone with copies of its photos in the app's own folder, shown as "waiting to send" in My reports, and sent automatically on start, when the connection returns and when the app comes back to the foreground (signed in only). The device id makes every re-send land on the same report; an expired photo permit is renewed; a report the server refuses is kept with the reason so the person can delete it.

**Sessions.** Access and refresh tokens live in the Keychain/Keystore. On a 401 the client refreshes once, even when several requests fail at the same time (the server treats a reused refresh token as theft), stores the rotated pair and retries. A rejected refresh clears the session; a refresh that fails because the phone is offline keeps it.

## Commands

Run from the repository root (`npm ci` installs every workspace):

```bash
npm run app:start        # Metro dev server
npm run test:mobile      # typecheck + lint + unit tests
```

Or inside `apps/mobile`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run doctor`.
Add native packages with `npx expo install <pkg>` so versions match the SDK (set `EXPO_OFFLINE=1` if expo.dev is unreachable).

CI (`.github/workflows/ci.yml`, job "Mobile app") runs typecheck, lint, tests and an Android + iOS JavaScript bundle on every push and pull request.
## Installable builds (owner testing)

Pull requests that change the app build both automatically. Otherwise: GitHub → **Actions → "App build (Expo · Android APK & iPhone IPA)" → Run workflow** (or push a tag `app-v1.0.0`).
After about 15–30 minutes, download the artifacts from the run page:

- **HUFRA-Android-APK**: unzip and open the `.apk` on the phone (allow "install unknown apps"). New APKs install over old ones.
- **HUFRA-iOS-IPA**: unzip, then install the `.ipa` with **Sideloadly** using your Apple ID. A free Apple ID build lasts 7 days; re-install to renew. Push notifications and shared links need a paid Apple account (Phase 10).
