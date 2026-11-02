/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['react-native-gesture-handler/jestSetup', '<rootDir>/jest.setup.ts'],
  // Reanimated's own resolver swaps its native parts for the JavaScript ones under Jest.
  resolver: 'react-native-reanimated/jest/resolver',
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
