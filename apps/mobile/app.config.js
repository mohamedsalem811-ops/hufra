// Extends app.json. Android push and crash reports need the Firebase config of
// the HUFRA project (google-services.json). CI writes it from the
// GOOGLE_SERVICES_JSON repository secret; it is never committed. Without it the
// app still builds, just without push and crash reports.
const fs = require('node:fs');
const path = require('node:path');

// Must match DEFAULT_API_URL in src/config/env.ts (a test checks it).
const DEFAULT_SITE = 'https://hufra.mohamedsalem811.workers.dev';

/** Android App Links (plan 8.5): shared report links open the app directly. */
function sharedLinkFilters(siteUrl) {
  const url = new URL(siteUrl);
  if (url.protocol !== 'https:') return [];
  return [
    {
      action: 'VIEW',
      autoVerify: true,
      data: ['/r/', '/en/r/'].map((pathPrefix) => ({ scheme: 'https', host: url.host, pathPrefix })),
      category: ['BROWSABLE', 'DEFAULT'],
    },
  ];
}

module.exports = ({ config }) => {
  config.android = { ...config.android, intentFilters: sharedLinkFilters(process.env.EXPO_PUBLIC_API_URL || DEFAULT_SITE) };
  const file = './google-services.json';
  if (fs.existsSync(path.join(__dirname, file))) {
    config.android = { ...config.android, googleServicesFile: file };
    // Firebase app + Crashlytics Gradle setup (Android only: see react-native.config.js).
    config.plugins = [...(config.plugins ?? []), '@react-native-firebase/app', '@react-native-firebase/crashlytics'];
  }
  // End-to-end test build (CI only): allows plain HTTP to the local test API.
  if (process.env.HUFRA_E2E === '1') {
    config.plugins = [...(config.plugins ?? []), './plugins/with-e2e-cleartext'];
  }
  return config;
};

module.exports.DEFAULT_SITE = DEFAULT_SITE;
module.exports.sharedLinkFilters = sharedLinkFilters;
