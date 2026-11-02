# HUFRA mobile app · تطبيق حفرة

The citizen app for iOS and Android, built with **Expo SDK 58** (React Native 0.88, React 19, Expo Router, TypeScript strict).
Plan: `docs/EXECUTION_PLAN.md`, Phase 5 and 6. Designs: the "App screens (4.2)" page of the design canvas.

| | |
|---|---|
| App id | `ly.tripoli.hufra` (iOS bundle id and Android package) |
| Name on the phone | حفرة |
| Deep-link scheme | `hufra://` |
| Brand | colours, type scale and spacing from `@hufra/brand`; icons and splash from `packages/brand/assets/app` |
| API contracts | `@hufra/contracts` (shared zod schemas) |

## Layout

```
src/
  app/        Expo Router routes only (every file is a screen)
  screens/    screen bodies rendered by routes, with colocated tests
  hooks/      reusable hooks (use-theme)
```

Native `ios/` and `android/` folders are **generated** (`npx expo prebuild`) and never committed; native settings live in `app.json` and config plugins.

## Commands

Run from the repository root (`npm ci` installs every workspace):

```bash
npm run app:start        # Metro dev server
npm run test:mobile      # typecheck + lint + unit tests
```

Or inside `apps/mobile`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run doctor`.
Add native packages with `npx expo install <pkg>` so versions match the SDK (set `EXPO_OFFLINE=1` if expo.dev is unreachable).

CI (`.github/workflows/ci.yml`, job "Mobile app") runs typecheck, lint, tests and an Android + iOS JavaScript bundle on every push and pull request.
Installable builds (APK, unsigned IPA for Sideloadly) arrive in Phase 5.2.
