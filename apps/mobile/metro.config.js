// apps/mobile/metro.config.js
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
const apiClientPackage = path.resolve(monorepoRoot, "packages/api-client");

// ──────────────────────────────────────────────────────
// Android build flavor detection
// ──────────────────────────────────────────────────────
//
// Metro is invoked by Gradle's per-variant bundle task
// `createBundle<Flavor><BuildType>JsAndAssets`, so the flavor is visible in
// process.argv as the task name and inside the --bundle-output path. React
// Native exposes the flavor no other way: there is no env var and no runtime
// flag (verified by capturing process.argv/process.env from inside a probe
// metro.config.js run under :app:createBundleFdroidReleaseJsAndAssets).
//
// Only the `playstore` flavor bundles the real @sentry/react-native. Every
// other invocation — the `fdroid` flavor, `react-native start`, Jest, and any
// unknown context — is treated as FOSS and gets the no-op shim, so an APK we
// hand to F-Droid can never carry the proprietary crash reporter.
function detectAndroidFlavor(argv) {
  const commandLine = argv.join(" ");
  if (/createBundlePlaystore[A-Za-z]*JsAndAssets/.test(commandLine)) {
    return "playstore";
  }
  if (/createBundleFdroid[A-Za-z]*JsAndAssets/.test(commandLine)) {
    return "fdroid";
  }
  return null;
}

const androidFlavor = detectAndroidFlavor(process.argv);

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
  //     - The monorepo root node_modules (for hoisted deps)
  //     - The shared package (for live-reload during dev)
  //
  //   NOTE: We intentionally do NOT watch the entire
  //   monorepo root — that would index 150K+ files and
  //   cause Metro to hang on startup.
  // ────────────────────────────────────────────────────
  watchFolders: [
    sharedPackage,
    apiClientPackage,
    path.resolve(monorepoRoot, "node_modules"),
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
    // blockList:
    //   Exclude heavy non-JS directories from Metro's
    //   file watcher to prevent startup hangs. These
    //   directories contain native build artifacts that
    //   Metro never needs to process.
    // ──────────────────────────────────────────────────
    blockList: [
      /android\/app\/build\/.*/,
      /android\/\.gradle\/.*/,
      /android\/app\/\.cxx\/.*/,
      /\.cxx\/.*/,
      /ios\/build\/.*/,
      /ios\/Pods\/.*/,
    ],

    // ──────────────────────────────────────────────────
    // resolveRequest:
    //   Redirect @sentry/react-native to a local no-op
    //   module unless we are bundling the playstore
    //   flavor. Sentry is an optionalDependency and is
    //   absent from F-Droid builds; without this alias
    //   Metro would fail to resolve the import there.
    //
    //   The flavor gate is what keeps the FOSS
    //   guarantee: only `playstore` resolves the real
    //   package (see detectAndroidFlavor above).
    // ──────────────────────────────────────────────────
    resolveRequest: (context, moduleName, platform) => {
      if (
        moduleName === "@sentry/react-native" &&
        androidFlavor !== "playstore"
      ) {
        return context.resolveRequest(
          context,
          path.resolve(projectRoot, "src/lib/sentry-noop.ts"),
          platform,
        );
      }
      return context.resolveRequest(context, moduleName, platform);
    },

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
      // NOTE: no `crypto` mapping. The Node crypto builtin used to be shimmed
      // to react-native-quick-crypto (the library's documented integration
      // pattern) for Node-crypto-dependent deps like the npm `bip39` package.
      // The wallet stack is now all @noble/@scure pure JS (which reads
      // globalThis.crypto via react-native-get-random-values), nothing in the
      // bundle imports `crypto`, and quick-crypto is removed.
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

// detectAndroidFlavor is exported for the regression test in
// src/__tests__/metroFlavor.test.ts. It is a plain property on the config
// object, which Metro ignores.
module.exports = mergeConfig(defaultConfig, config);
module.exports.detectAndroidFlavor = detectAndroidFlavor;
