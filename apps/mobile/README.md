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
  app/          Expo Router routes only (every file is a screen); _layout.tsx boots the app
  app-shell/    boot (saved language/theme, layout direction) and the provider stack
  screens/      screen bodies rendered by routes, with colocated tests
  components/   shared UI (AppText, ErrorView)
  api/          typed API client (zod contracts, single-flight token refresh), query cache, token store
  i18n/         Arabic/English text and right-to-left handling
  theme/        brand colours (light/dark/system), Readex Pro fonts
  config/       API address per build (EXPO_PUBLIC_API_URL, default: the live Worker)
  storage/      Keychain/Keystore key-value store
```

**Language and direction.** Arabic is the default on every phone. The native layout direction is fixed when the app starts, so the app reloads once (behind the splash screen) when the direction has to change, and right after the person switches language.

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

GitHub → **Actions → "App build (Expo · Android APK & iPhone IPA)" → Run workflow** (or push a tag `app-v1.0.0`).
After about 15–30 minutes, download the artifacts from the run page:

- **HUFRA-Android-APK**: unzip and open the `.apk` on the phone (allow "install unknown apps"). New APKs install over old ones.
- **HUFRA-iOS-IPA**: unzip, then install the `.ipa` with **Sideloadly** using your Apple ID. A free Apple ID build lasts 7 days; re-install to renew. Push notifications and shared links need a paid Apple account (Phase 10).
