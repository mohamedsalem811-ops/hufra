// Native modules that do not exist under Jest.
jest.mock('expo-secure-store', () => {
  const data = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => data.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      data.delete(key);
    }),
  };
});

// Safe-area insets: the library's own Jest mock (renders children with fixed insets).
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Permission prompts: granted by default; tests override per case.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));

// Query cache without garbage-collection timers (gcTime Infinity), so Jest can exit after each file.
jest.mock('@/api/query-client', () => {
  const actual = jest.requireActual('@/api/query-client');
  return {
    ...actual,
    createQueryClient: () => {
      const client = actual.createQueryClient();
      client.setDefaultOptions({
        queries: { ...client.getDefaultOptions().queries, gcTime: Infinity, retry: false },
      });
      return client;
    },
  };
});

// Camera, image processing and ids: native modules replaced for unit tests.
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-file-system', () => ({ File: jest.fn(() => ({ size: 0 })) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid-0001' }));
