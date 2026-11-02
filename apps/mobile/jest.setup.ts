// Native modules that do not exist under Jest.
// Worklets' own mock runs worklets as plain functions (needed by gesture handler and Reanimated).
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
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

// Query and mutation caches without garbage-collection timers (gcTime Infinity), so Jest can exit after each file.
jest.mock('@/api/query-client', () => {
  const actual = jest.requireActual('@/api/query-client');
  return {
    ...actual,
    createQueryClient: () => {
      const client = actual.createQueryClient();
      client.setDefaultOptions({
        queries: { ...client.getDefaultOptions().queries, gcTime: Infinity, retry: false },
        mutations: { ...client.getDefaultOptions().mutations, gcTime: Infinity, retry: false },
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
jest.mock('expo-file-system', () => ({
  File: jest.fn((...parts: unknown[]) => ({ size: 0, exists: false, uri: parts.map(String).join('/'), copy: jest.fn(async () => {}) })),
  Directory: jest.fn(() => ({ exists: false, create: jest.fn(), delete: jest.fn() })),
  Paths: { document: 'file:///documents' },
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid-0001' }));

// Offline outbox: in-memory store instead of SQLite; network reported as online.
jest.mock('@/features/outbox/store', () => {
  const actual = jest.requireActual('@/features/outbox/store');
  return { ...actual, createSqliteOutbox: () => actual.memoryOutbox() };
});
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
