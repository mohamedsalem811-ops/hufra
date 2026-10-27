const serverUrl = process.env.CAPACITOR_SERVER_URL

const config = {
  appId: 'ly.tripoli.hufra',
  appName: 'HUFRA حفرة',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://'),
        allowNavigation: ['*.pages.dev', '*.tile.openstreetmap.org'],
      }
    : {
        androidScheme: 'https',
        iosScheme: 'capacitor',
      },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Geolocation: {
      enableHighAccuracy: true,
    },
  },
}

export default config
