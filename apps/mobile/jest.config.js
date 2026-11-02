/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
  moduleNameMapper: {
    // The app bundles lucide's ES module build; Jest runs CommonJS, so use that build in tests.
    '^lucide-react-native$': require.resolve('lucide-react-native'),
  },
};
