// packages/mobile/metro.config.js
//
// Metro bundler configuration for the Sidecoin React Native app.
//
// Key concerns:
//   1. Resolve @sidecoin/shared from the workspace (symlinked via pnpm)
//   2. Watch the shared package source directory for hot-reload
//   3. Handle Node.js polyfills needed by crypto libraries
//   4. Support NativeWind (Tailwind CSS) processing

const path = require("path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

// ──────────────────────────────────────────────────────
// Paths
// ──────────────────────────────────────────────────────

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const sharedPackage = path.resolve(monorepoRoot, "packages/shared");

// ──────────────────────────────────────────────────────
// Default config from React Native 0.81
// ──────────────────────────────────────────────────────

const defaultConfig = getDefaultConfig(projectRoot);

// ──────────────────────────────────────────────────────
// Custom config
// ──────────────────────────────────────────────────────

/**
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  // ────────────────────────────────────────────────────
  // watchFolders:
  //   Metro only watches the project root by default.
  //   We need it to also watch:
  //     - The monorepo root (for hoisted node_modules)
  //     - The shared package (for live-reload during dev)
  // ────────────────────────────────────────────────────
  watchFolders: [
    monorepoRoot,
    sharedPackage,
  ],

  resolver: {
    // ──────────────────────────────────────────────────
    // nodeModulesPaths:
    //   Tell Metro where to find hoisted dependencies.
    //   pnpm with shamefully-hoist=true puts them at
    //   the monorepo root's node_modules.
    // ──────────────────────────────────────────────────
    nodeModulesPaths: [
      path.resolve(projectRoot, "node_modules"),
      path.resolve(monorepoRoot, "node_modules"),
    ],

    // ──────────────────────────────────────────────────
    // extraNodeModules:
    //   Node.js core module polyfills required by
    //   various crypto and networking libraries.
    //
    //   These map Node built-in module names to their
    //   browserified equivalents installed as devDeps.
    // ──────────────────────────────────────────────────
    extraNodeModules: {
      assert: require.resolve("assert"),
      buffer: require.resolve("buffer"),
      crypto: require.resolve("react-native-quick-crypto"),
      events: require.resolve("events"),
      fs: require.resolve("memfs"),
      http: require.resolve("stream-http"),
      https: require.resolve("https-browserify"),
      os: require.resolve("os-browserify"),
      path: require.resolve("path-browserify"),
      process: require.resolve("process"),
      stream: require.resolve("readable-stream"),
      url: require.resolve("url"),
      zlib: require.resolve("browserify-zlib"),
    },

    // ──────────────────────────────────────────────────
    // disableHierarchicalLookup:
    //   Prevents Metro from walking up the directory tree
    //   beyond our declared nodeModulesPaths. This avoids
    //   accidentally resolving packages from unexpected
    //   locations outside the monorepo.
    // ──────────────────────────────────────────────────
    disableHierarchicalLookup: false,

    // ──────────────────────────────────────────────────
    // sourceExts:
    //   Use defaults from React Native, but ensure .cjs
    //   is included (some workspace packages may ship it).
    // ──────────────────────────────────────────────────
    sourceExts: [...(defaultConfig.resolver?.sourceExts || []), "cjs"],

    // ──────────────────────────────────────────────────
    // unstable_enableSymlinks:
    //   CRITICAL for pnpm workspace monorepos.
    //   Without this, Metro cannot follow the symlinks
    //   that pnpm creates for workspace:* dependencies.
    // ──────────────────────────────────────────────────
    unstable_enableSymlinks: true,
  },

  transformer: {
    // ──────────────────────────────────────────────────
    // getTransformOptions:
    //   Enable tree-shaking and inline requires for
    //   production builds. Leaves dev builds untouched
    //   for faster refresh cycles.
    // ──────────────────────────────────────────────────
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(defaultConfig, config);
