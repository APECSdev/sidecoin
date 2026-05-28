// packages/mobile/jest.config.ts
//
// Jest configuration for the Sidecoin React Native app.

import type { Config } from "jest";

const config: Config = {
  // ────────────────────────────────────────────────────
  // preset:
  //   react-native preset configures the transformer,
  //   module file extensions, and platform-specific
  //   module resolution.
  // ────────────────────────────────────────────────────
  preset: "react-native",

  // ────────────────────────────────────────────────────
  // transform:
  //   Use ts-jest for TypeScript files.
  //   babel-jest handles JS/JSX (inherited from preset).
  // ────────────────────────────────────────────────────
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        babelConfig: true,
      },
    ],
  },

  // ────────────────────────────────────────────────────
  // moduleFileExtensions:
  //   Order matters — platform-specific extensions first.
  // ────────────────────────────────────────────────────
  moduleFileExtensions: [
    "ts",
    "tsx",
    "js",
    "jsx",
    "json",
    "node",
  ],

  // ────────────────────────────────────────────────────
  // moduleNameMapper:
  //   Mirror the path aliases from tsconfig.json and
  //   babel.config.js so Jest resolves imports the same
  //   way Metro does.
  // ────────────────────────────────────────────────────
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@sidecoin/shared(.*)$": "<rootDir>/../shared/src$1",
  },

  // ────────────────────────────────────────────────────
  // transformIgnorePatterns:
  //   React Native and many RN libraries ship untranspiled
  //   ES modules. We need to tell Jest to transform them.
  //   This regex whitelists the known packages that need it.
  // ────────────────────────────────────────────────────
  transformIgnorePatterns: [
    "node_modules/(?!("
      + "react-native"
      + "|@react-native"
      + "|@react-native-community"
      + "|@react-navigation"
      + "|react-native-reanimated"
      + "|react-native-gesture-handler"
      + "|react-native-screens"
      + "|react-native-safe-area-context"
      + "|react-native-vector-icons"
      + "|react-native-svg"
      + "|react-native-qrcode-svg"
      + "|react-native-css-interop"
      + "|nativewind"
      + "|@shopify/react-native-skia"
      + "|victory-native"
      + "|@sidecoin/shared"
    + ")/)",
  ],

  // ────────────────────────────────────────────────────
  // setupFiles:
  //   Load polyfills and test-library matchers before
  //   any test runs.
  //   The polyfills file injects Buffer, process, and
  //   crypto.getRandomValues globally.
  //   jest-native matchers add toBeVisible, toHaveStyle, etc.
  // ────────────────────────────────────────────────────
  setupFiles: [
    "./src/polyfills.ts",
    "@testing-library/jest-native/extend-expect",
  ],

  // ────────────────────────────────────────────────────
  // testMatch:
  //   Find test files in __tests__ directories or
  //   co-located *.test.ts(x) files.
  // ────────────────────────────────────────────────────
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.{ts,tsx}",
    "<rootDir>/src/**/*.test.{ts,tsx}",
  ],

  // ────────────────────────────────────────────────────
  // coveragePathIgnorePatterns:
  //   Exclude non-logic files from coverage reports.
  // ────────────────────────────────────────────────────
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/src/polyfills\\.ts$",
    "/src/assets/",
    "\\.d\\.ts$",
  ],

  // ────────────────────────────────────────────────────
  // testEnvironment:
  //   Use the default (jsdom-like) environment from the
  //   react-native preset.
  // ────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────
  // verbose:
  //   Print individual test results with the test suite
  //   hierarchy. Useful during initial development.
  // ────────────────────────────────────────────────────
  verbose: true,
};

export default config;
