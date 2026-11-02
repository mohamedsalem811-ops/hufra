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
