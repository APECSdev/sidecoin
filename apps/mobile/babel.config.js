// apps/mobile/babel.config.js
//
// Babel configuration for the Sidecoin React Native app.
//
// Plugin order matters:
//   1. @react-native/babel-preset — core RN transforms
//   2. nativewind/babel — Tailwind CSS className → style transform (is a preset)
//      SKIPPED in test environment: it injects _ReactNativeCSSInterop
//      references that violate Jest's jest.mock() hoisting rules.
//   3. module-resolver — path aliases (@/, @sidecoin/shared)
//   4. react-native-reanimated/plugin — MUST be last (it wraps worklets)
//
// History: the original scaffold carried the nativewind preset but never
// completed the wiring (no global.css, no withNativeWind in metro), so it
// was removed in 2eb9a668 as dead weight. 26.10.12 reintroduces it FULLY
// wired (metro.config.js + global.css + tailwind.config.js), because
// className is the shared styling language of the other four apps.
//
// SafeAreaView note: css-interop 0.2.7 registers the SafeAreaView from
// react-native-safe-area-context (dist/runtime/components.js:49), NOT RN
// core's deprecated export — so the dev-mode "SafeAreaView has been
// deprecated" badge that motivated the 2eb9a668 removal does NOT return.
// (0.2.1 registered core's SafeAreaView; the 2eb9a668 commit message
// records that trigger. Verified by grepping 0.2.7's dist: the only
// SafeAreaView registration is the safe-area-context one.)

module.exports = function (api) {
  // ────────────────────────────────────────────────────
  // Cache based on NODE_ENV so that the test environment
  // gets a different cached config than development/
  // production. This is required because we conditionally
  // exclude the nativewind/babel preset during tests.
  //
  // api.cache(true) cannot be used here because it locks
  // the config permanently and prevents api.env() from
  // varying the output per environment.
  // ────────────────────────────────────────────────────
  const isTest = api.env("test");
  api.cache.using(() => isTest);

  return {
    presets: [
      // ────────────────────────────────────────────────
      // React Native's default Babel preset.
      // Includes JSX transform, Flow strip, etc.
      // ────────────────────────────────────────────────
      "@react-native/babel-preset",

      // ────────────────────────────────────────────────
      // NativeWind:
      //   Transforms Tailwind className props into
      //   React Native StyleSheet-compatible mappings at build time.
      //   Despite its name, nativewind/babel exports a
      //   preset (returns { plugins: [...] }), not a
      //   single plugin.
      //
      //   Disabled in test environment because it injects
      //   _ReactNativeCSSInterop variable references into
      //   compiled JSX. When that JSX appears inside a
      //   jest.mock() factory (which Jest hoists above all
      //   imports), the injected variable is out-of-scope
      //   and Jest throws:
      //     "Invalid variable access: _ReactNativeCSSInterop"
      //   Covered by src/__tests__/nativewindBabel.test.ts, which
      //   runs the transform directly instead of through Jest.
      // ────────────────────────────────────────────────
      !isTest && "nativewind/babel",
    ].filter(Boolean),

    plugins: [
      // ────────────────────────────────────────────────
      // module-resolver:
      //   Maps import aliases to filesystem paths so
      //   both Metro bundling and Jest test resolution
      //   understand the same import paths.
      //
      //   @/* → ./src/*
      // ────────────────────────────────────────────────
      [
        "module-resolver",
        {
          root: ["./src"],
          extensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
          alias: {
            "@": "./src",
          },
        },
      ],

      // ────────────────────────────────────────────────
      // react-native-reanimated/plugin:
      //   Transforms worklet functions. MUST be listed
      //   last — it rewrites code that earlier plugins
      //   have already processed.
      // ────────────────────────────────────────────────
      "react-native-reanimated/plugin",
    ],
  };
};
