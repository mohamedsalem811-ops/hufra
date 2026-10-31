// HUFRA native shell (Capacitor).
//
// Sideload/testing mode: the app loads the live HUFRA site (CAPACITOR_SERVER_URL)
// inside a native WKWebView, so every server-rendered page, cookie and
// /pothole/:id route works exactly like the web version while native plugins
// (camera, geolocation, haptics, status bar) stay available through HufraBridge.
// `www/` only holds an offline fallback page used when no server URL is set.
const serverUrl = process.env.CAPACITOR_SERVER_URL

const config = {
  appId: 'ly.tripoli.hufra',
  appName: 'HUFRA',
  webDir: 'www',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://'),
        allowNavigation: [
          new URL(serverUrl).hostname,
          '*.tile.openstreetmap.org',
          'nominatim.openstreetmap.org',
        ],
      }
    : { androidScheme: 'https' },
  ios: {
    contentInset: 'never',
    backgroundColor: '#15181C',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#15181C',
      showSpinner: false,
    },
    Geolocation: { enableHighAccuracy: true },
  },
}

export default config
