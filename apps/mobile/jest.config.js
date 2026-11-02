/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
  // Expo's recommended list, plus the ESM-only clustering packages used by the map.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|@maplibre/.*|supercluster|kdbush)',
  ],
  moduleNameMapper: {
    // The app bundles lucide's ES module build; Jest runs CommonJS, so use that build in tests.
    '^lucide-react-native$': require.resolve('lucide-react-native'),
  },
};
