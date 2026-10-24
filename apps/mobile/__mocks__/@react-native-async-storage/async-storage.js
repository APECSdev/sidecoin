// apps/mobile/__mocks__/@react-native-async-storage/async-storage.js
//
// In-memory AsyncStorage mock (node_modules manual mock — Jest substitutes it
// automatically in every suite; a suite can still override it with an
// explicit jest.mock factory, e.g. entitlementsApi.test.ts). Needed because
// src/entitlements.ts imports AsyncStorage at module top, so ANY suite that
// (transitively) renders a screen reading entitlements would otherwise die
// with "NativeModule: AsyncStorage is null".

let store = {};

module.exports = {
  __esModule: true,
  default: {
    getItem: async (key) => (key in store ? store[key] : null),
    setItem: async (key, value) => {
      store[key] = String(value);
    },
    removeItem: async (key) => {
      delete store[key];
    },
    clear: async () => {
      store = {};
    },
    getAllKeys: async () => Object.keys(store),
    multiGet: async (keys) =>
      keys.map((key) => [key, key in store ? store[key] : null]),
    multiSet: async (pairs) => {
      for (const [key, value] of pairs) store[key] = String(value);
    },
    multiRemove: async (keys) => {
      for (const key of keys) delete store[key];
    },
  },
};
