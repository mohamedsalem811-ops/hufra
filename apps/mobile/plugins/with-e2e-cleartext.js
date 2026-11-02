// Test builds only (HUFRA_E2E=1, see app.config.js): the Android emulator talks
// to the seeded local API at http://10.0.2.2, and Android blocks plain HTTP by
// default. Real builds never include this.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withE2eCleartext(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });
};
