// packages/mobile/babel.config.js
//
// Babel configuration for the Sidecoin React Native app.
//
// Plugin order matters:
//   1. @react-native/babel-preset — core RN transforms
//   2. nativewind/babel — Tailwind CSS className → style transform (is a preset)
//   3. module-resolver — path aliases (@/, @sidecoin/shared)
//   4. react-native-reanimated/plugin — MUST be last (it wraps worklets)

module.exports = function (api) {
  api.cache(true);

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
      //   React Native StyleSheet objects at build time.
      //   Despite its name, nativewind/babel exports a
      //   preset (returns { plugins: [...] }), not a
      //   single plugin.
      // ────────────────────────────────────────────────
      "nativewind/babel",
    ],

    plugins: [
      // ────────────────────────────────────────────────
      // module-resolver:
      //   Maps import aliases to filesystem paths so
      //   both Metro bundling and Jest test resolution
      //   understand the same import paths.
      //
      //   @/* → ./src/*
      //   @sidecoin/shared → ../shared/src
      // ────────────────────────────────────────────────
      [
        "module-resolver",
        {
          root: ["./src"],
          extensions: [
            ".ios.ts",
            ".android.ts",
            ".ts",
            ".ios.tsx",
            ".android.tsx",
            ".tsx",
            ".js",
            ".jsx",
            ".json",
          ],
          alias: {
            "@": "./src",
            "@sidecoin/shared": "../shared/src",
          },
        },
      ],

      // ────────────────────────────────────────────────
      // Reanimated:
      //   MUST be the last plugin in the list.
      //   It instruments worklet functions and must see
      //   the final transformed AST.
      // ────────────────────────────────────────────────
      "react-native-reanimated/plugin",
    ],
  };
};
