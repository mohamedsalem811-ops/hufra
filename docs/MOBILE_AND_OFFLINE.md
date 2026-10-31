# HUFRA (حفرة) — Unified Web + Mobile (PWA + Capacitor) & Offline Guide

This document explains how the website and the Android/iOS mobile app connect to the same Cloudflare Worker + D1/KV/R2 backend, how offline field reporting and synchronization work, and how to build the native mobile packages.

## 1. Unified Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Shared Frontend (Web Browser + Installed PWA + Capacitor Android/iOS)   │
│  • Server-rendered HTML + RTL/LTR CSS + mobile bottom navigation bar    │
│  • public/sw.js (Service Worker App Shell + API snapshot cache)         │
│  • public/static/js/native-bridge.js (Capacitor Camera, GPS, Push)      │
│  • public/static/js/offline-queue.js (IndexedDB reports + admin queue)  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTPS / CORS (Bearer JWT or Cookie)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Cloudflare Workers / Pages — Hono API (src/index.tsx)                   │
│  • /api/auth/*          Dual Web Cookie + Mobile JSON/Header tokens     │
│  • /api/potholes/*      Idempotent `client_report_uuid` offline sync    │
│  • /api/photos/*        Compressed WebP full + thumb upload to R2       │
│  • /api/notifications/* Unified Citizen + Admin feed & Push Tokens      │
│  • /api/admin/*         Field Admin moderation, duplicates, analytics   │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. Key Features Added for Mobile & Web Integration

### 2.1 Dual Web + Mobile Authentication (`src/routes/auth.ts`, `public/static/js/api.js`)
- **Login (`POST /api/auth/login`)**: Returns `{ access_token, refresh_token, user }` in JSON for mobile apps while continuing to set `HttpOnly` cookies (`hufra_session`, `hufra_refresh`) for web browsers.
- **Token Rotation (`POST /api/auth/refresh`)**: Accepts `refresh_token` from the `X-Refresh-Token` header, `{ refresh_token }` JSON body, or the `hufra_refresh` cookie.
- **Persistent Revocation (`refresh_tokens` D1 table)**: Every issued refresh token is SHA-256 hashed and stored in `refresh_tokens`. Logging out (`POST /api/auth/logout`) or deleting an account (`POST /api/auth/me/delete`) immediately revokes the token in D1.

### 2.2 Offline Field Reporting & Idempotent Sync (`public/static/js/offline-queue.js`, `migrations/0006_mobile_and_push.sql`)
- **Citizen & Guest Offline Reports**:
  - Every report draft generates a unique `client_report_uuid`.
  - Photos are compressed client-side into `full` (≤ 700 KB) and `thumb` (≤ 150 KB) WebP `Blob` objects via `image-compress.js`.
  - If the user has no signal (`navigator.onLine === false`) or the connection drops mid-upload, `HufraOfflineQueue.enqueueReport()` stores the report payload and photo blobs in IndexedDB (`hufra_offline_db -> pending_reports`).
  - As soon as connectivity returns, `HufraOfflineQueue.syncAll()` automatically uploads the report and photos.
  - **Server-side Deduplication**: `POST /api/potholes` checks `client_report_uuid` against the unique index `idx_potholes_client_uuid`. If a flaky mobile connection retries a report that already succeeded, the server returns `200 OK` with `{ id, status, deduplicated: true }` instead of creating a duplicate pothole.

### 2.3 Mobile Field Admin Tools (`public/static/js/admin.js`, `src/pages/admin.ts`)
- **GPS Proximity Sorting ("الأقرب لموقعي / Nearest to me")**: Field crews on phones can tap **Nearest to me (Field mode)** in `/admin` to sort open potholes by exact Haversine distance (`m` / `km`) from their current GPS coordinates.
- **1-Tap Turn-by-Turn Navigation**: Every report modal includes an **Open in Maps (`توجيه عبر الخرائط`)** button linking directly to Google Maps / Apple Maps directions for that pothole's coordinates.
- **Offline Field Admin Queue**: If a field admin transitions a pothole's status (`verified`, `under_repair`, `fixed`) or captures a `before` / `during` / `after` repair proof photo in a dead zone, the action is queued in IndexedDB (`pending_admin_actions`) and synced automatically when online.

### 2.4 App Push Notifications (`src/routes/notifications.ts`, `src/lib/notifications.ts`, `native-bridge.js`)
- **Unified Notifications API (`/api/notifications`)**:
  - `GET /api/notifications`: Returns unread count and recent notifications for both regular citizens (`status_change` on their submitted reports) and municipal admins (`new_report` alerts).
  - `POST /api/notifications/read-all`: Marks notifications as read.
  - `POST /api/notifications/push-token`: Registers an `android`, `ios`, or `web` push token in the `device_push_tokens` table with the user's preferred locale (`ar` or `en`).
  - `DELETE /api/notifications/push-token`: Deactivates the device token on logout or opt-out.
- **Push Delivery**:
  - When `FCM_SERVER_KEY` or `PUSH_WEBHOOK_URL` is configured in Cloudflare Worker secrets, `notifyUser()` and `notifyAdmins()` automatically dispatch localized Arabic/English push payloads to all active `device_push_tokens` for the target user/admin.
  - In addition, active app/PWA sessions deliver OS/Service Worker notifications via `HufraBridge.showLocalNotification()`.

## 3. iOS app for sideloading (testing)

The iOS app is a native Capacitor shell (WKWebView, asphalt/yellow launch screen, haptics,
status bar, camera, geolocation) that loads the **live HUFRA site**. App Store submission and
push notifications are intentionally out of scope for now: the goal is testing on real
iPhones via Sideloadly / AltStore with a free Apple ID.

### 3.1 Get the IPA (no Mac needed)
1. Deploy the web app (Cloudflare Pages) and note its URL, e.g. `https://hufra.pages.dev`.
2. GitHub -> **Actions** -> *Mobile Build* -> **Run workflow**, paste that URL as `server_url`.
3. When finished, download the **HUFRA-iOS-IPA** artifact (`HUFRA-ios-unsigned.ipa`, unzip once).

The IPA is unsigned on purpose; Sideloadly/AltStore sign it with your Apple ID.


### 3.2 Install it
- **Sideloadly** (Windows/macOS): connect the iPhone, drag the `.ipa` in, enter your Apple ID, press *Start*.
- **AltStore**: install AltServer on your computer, then in AltStore *My Apps -> +* and pick the `.ipa`.
- On the iPhone: *Settings -> General -> VPN & Device Management* -> trust your Apple ID.
- Free Apple IDs expire after **7 days** and allow 3 sideloaded apps; just re-install/refresh.

### 3.3 Build locally on a Mac (optional)
```bash
npm install
CAPACITOR_SERVER_URL=https://hufra.pages.dev npx cap sync ios
npm run mobile:ios      # opens Xcode; pick your device and Run
```
Without `CAPACITOR_SERVER_URL` the app shows the offline fallback page from `www/index.html`.

### 3.4 Android (debug APK)
The same workflow also produces `HUFRA-android-debug.apk`.

### 3.5 Installable web app (PWA)
On iOS Safari: Share -> *Add to Home Screen*. The service worker (`public/sw.js`, cache `hufra-v3`)
pre-caches the shell, fonts, icons and the self-hosted Leaflet bundle (no third-party CDNs).
