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
  // Coverage: every source file except route shells (thin wrappers around screens).
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/app/**'],
  coverageReporters: ['text-summary', 'lcov'],
  // Floors, not goals: CI fails if tested logic loses its tests (plan 6.10).
  // Screens are also covered by the end-to-end journeys (.maestro, app-e2e.yml).
  coverageThreshold: {
    global: { statements: 64, branches: 63, functions: 58, lines: 66 },
    './src/api/': { statements: 85, branches: 80, lines: 95 },
    './src/features/outbox/processor.ts': { statements: 95, lines: 95 },
    './src/features/report/photo-compress.ts': { statements: 74, lines: 72 }, // the native encoder runs only on devices (e2e)
    './src/features/report/submit.ts': { statements: 95, lines: 95 },
    './src/features/report/draft.ts': { statements: 95, lines: 95 },
  },
  moduleNameMapper: {
    // The app bundles lucide's ES module build; Jest runs CommonJS, so use that build in tests.
    '^lucide-react-native$': require.resolve('lucide-react-native'),
  },
};
