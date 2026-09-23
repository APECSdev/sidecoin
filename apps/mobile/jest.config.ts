// apps/mobile/jest.config.ts
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
  // globals:
  //   React Native's bundler defines __DEV__ at build
  //   time. Jest doesn't, so we set it here to match
  //   the development environment.
  // ────────────────────────────────────────────────────
  globals: {
    __DEV__: true,
  },

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
    "^.+\\.jsx?$": "babel-jest",
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
    // The mobile app lives in apps/mobile, a sibling of packages/shared and
    // packages/api-client, so the workspace libs are two levels up then into
    // packages/.
    "^@sidecoin/shared(.*)$": "<rootDir>/../../packages/shared/src$1",
    "^@sidecoin/api-client(.*)$": "<rootDir>/../../packages/api-client/src$1",
  },

  // ────────────────────────────────────────────────────
  // transformIgnorePatterns:
  //   React Native and many RN libraries ship untranspiled
  //   ES modules. We need to tell Jest to transform them.
  //   This regex whitelists the known packages that need it.
  //
  //   pnpm hoists packages into a .pnpm directory with a
  //   nested node_modules path, e.g.:
  //     node_modules/.pnpm/react-native@x.y.z/node_modules/react-native/...
  //   The pattern must account for both standard and pnpm
  //   resolved paths by optionally matching the .pnpm
  //   intermediate segment.
  // ────────────────────────────────────────────────────
  transformIgnorePatterns: [
    "node_modules/(?!(\\.pnpm/.*node_modules/)?("
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
      // react-native-webview ships untranspiled ESM (index.js uses `import`),
      // and ExploreScreen imports it at module scope, so the tab shell pulls
      // it in transitively.
      + "|react-native-webview"
      + "|react-native-css-interop"
      + "|nativewind"
      + "|@shopify/react-native-skia"
      + "|victory-native"
      + "|@sidecoin/shared"
      + "|@sidecoin/api-client"
      // @sidecoin/shared imports these ESM-only crypto libraries at runtime
      // (derivation/signing), so Jest must transform them too.
      + "|@noble"
      + "|@scure"
      + "|micro-key-producer"
      + "|micro-packed"
    + ")/)",
  ],

  // ────────────────────────────────────────────────────
  // setupFiles:
  //   Load polyfills before any test runs.
  //
  //   We use test-setup.ts instead of polyfills.ts
  //   because react-native-get-random-values declares
  //   `let module` which collides with Jest's CommonJS
  //   `module` global. Jest's jsdom already provides
  //   crypto.getRandomValues so the polyfill is skipped.
  // ────────────────────────────────────────────────────
  setupFiles: [
    "./src/test-setup.ts",
  ],

  // ────────────────────────────────────────────────────
  // setupFilesAfterFramework → not available in Jest 29.
  //
  // @testing-library/jest-native/extend-expect adds
  // matchers like toBeVisible(), toHaveStyle(), etc.
  // It calls expect.extend() at import time and needs
  // the test framework to be initialized first.
  // It is loaded via test-setup.ts using a deferred
  // require() that waits until `expect` is defined.
  //
  // The current tests only use standard Jest matchers
  // (toBeTruthy, toBeNull) so this is a safety net for
  // future tests that use jest-native matchers.
  // ────────────────────────────────────────────────────

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
