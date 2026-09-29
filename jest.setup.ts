// In-memory AsyncStorage mock shipped by the library for Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Tests run offline: the app's background sync must never reach a real server.
globalThis.fetch = jest.fn(() => Promise.reject(new Error('offline in tests'))) as unknown as typeof fetch;
