// apps/mobile/babel.config.js
//
// Babel configuration for the Sidecoin React Native app.
//
// Plugin order matters:
//   1. @react-native/babel-preset — core RN transforms
//   2. module-resolver — path aliases (@/, @sidecoin/shared)
//   3. react-native-reanimated/plugin — MUST be last (it wraps worklets)
//
// Note: the original scaffold carried a NativeWind (Tailwind className)
// preset here. No component in the app uses className, and the
// css-interop runtime it pulled in was the sole trigger of RN's
// "SafeAreaView has been deprecated" warning (its runtime touches
// react-native's SafeAreaView getter). The preset and the nativewind /
// tailwindcss / react-native-css-interop dependencies were removed.

module.exports = function (api) {
  api.cache(true);

  return {
    presets: ["@react-native/babel-preset"],

    plugins: [
      // ────────────────────────────────────────────────
      // module-resolver:
      //   Maps import aliases to filesystem paths so
      //   both Metro bundling and Jest test resolution
      //   understand the same import paths.
      //
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
      //
      "react-native-reanimated/plugin",
    ],
  };
};
