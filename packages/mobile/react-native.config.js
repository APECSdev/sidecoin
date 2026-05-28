// packages/mobile/react-native.config.js
//
// Configuration for the React Native CLI.
//
// This file tells the CLI where to find the native
// Android and iOS projects, and configures auto-linking
// for native modules.

module.exports = {
  // ────────────────────────────────────────────────────
  // project:
  //   Explicit paths to native projects. Required when
  //   the RN project isn't at the repo root (monorepo).
  // ────────────────────────────────────────────────────
  project: {
    android: {
      sourceDir: "./android",
      appName: "app",
    },
    ios: {
      sourceDir: "./ios",
    },
  },

  // ────────────────────────────────────────────────────
  // assets:
  //   Directories containing custom fonts and static
  //   assets to be linked into native projects via
  //   `npx react-native-asset`.
  // ────────────────────────────────────────────────────
  assets: [
    "./src/assets/fonts/",
  ],

  // ────────────────────────────────────────────────────
  // dependencies:
  //   Override auto-linking behavior for specific
  //   libraries if needed. Empty for now — all native
  //   modules auto-link via their own config.
  // ────────────────────────────────────────────────────
  dependencies: {},
};
