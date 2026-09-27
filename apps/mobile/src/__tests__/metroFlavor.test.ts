// apps/mobile/src/__tests__/metroFlavor.test.ts
//
// Regression tests for the Metro Android-flavor detection that gates the
// proprietary Sentry crash reporter.
//
// WHY THIS FILE EXISTS: the FOSS guarantee for F-Droid depends on the `fdroid`
// bundle NEVER resolving the real @sentry/react-native. That guarantee is one
// regex away from silently regressing — broaden a pattern and an F-Droid APK
// starts shipping code the F-Droid inclusion policy forbids. These tests pin
// the exact task names Gradle uses (createBundle<Flavor><BuildType>JsAndAssets)
// and assert that anything we do not positively recognise is treated as FOSS.
//
// The kept `import` statements document the two behaviours under test: the
// helper is a pure function, and the config it feeds redirects Sentry to the
// local no-op shim for every flavor except playstore.

// Metro's real config loader is ESM-only and cannot be required from Jest, so
// it is stubbed with the minimal surface metro.config.js actually uses.
jest.mock("@react-native/metro-config", () => ({
  getDefaultConfig: () => ({ resolver: { sourceExts: ["js"] } }),
  mergeConfig: (a: unknown, b: unknown) => ({ ...(a as object), ...(b as object) }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const metroConfig = require("../../metro.config.js");
const { detectAndroidFlavor } = metroConfig;

// The exact Gradle task names observed by capturing process.argv from inside a
// probe metro.config.js under :app:createBundleFdroidReleaseJsAndAssets.
const FDROID_TASK = "createBundleFdroidReleaseJsAndAssets";
const PLAYSTORE_TASK = "createBundlePlaystoreReleaseJsAndAssets";

describe("detectAndroidFlavor", () => {
  it("recognises the fdroid release bundle task", () => {
    expect(detectAndroidFlavor(["node", "cli.js", FDROID_TASK])).toBe("fdroid");
  });

  it("recognises the playstore release bundle task", () => {
    expect(
      detectAndroidFlavor(["node", "cli.js", PLAYSTORE_TASK]),
    ).toBe("playstore");
  });

  it("recognises the fdroid debug bundle task", () => {
    expect(
      detectAndroidFlavor(["node", "cli.js", "createBundleFdroidDebugJsAndAssets"]),
    ).toBe("fdroid");
  });

  it("returns null for a bare `react-native start` / bundle invocation", () => {
    expect(detectAndroidFlavor(["node", "cli.js", "bundle"])).toBe(null);
    expect(detectAndroidFlavor(["node", "cli.js", "start"])).toBe(null);
  });

  it("returns null for an empty argv", () => {
    expect(detectAndroidFlavor([])).toBe(null);
  });

  it("does not treat an unrelated task containing 'Bundle' as a flavor", () => {
    expect(
      detectAndroidFlavor(["node", "cli.js", "createDebugBundleJsAndAssets"]),
    ).toBe(null);
  });
});

describe("Sentry resolveRequest gate", () => {
  // Reproduces what Metro does per request: hand resolveRequest a module name
  // and see where it points. The real Metro resolver is replaced by a stub
  // that echoes the second argument, so the assertion is on OUR redirect.
  const makeContext = () => ({
    resolveRequest: (_ctx: unknown, resolved: string) => ({ resolved }),
  });

  // metro.config.js snapshots process.argv into androidFlavor at load time, so
  // exercising a specific flavor means re-requiring it under that argv. The
  // original argv is restored so the other suites are unaffected.
  const loadConfigWithArgv = (argv: string[]) => {
    const originalArgv = process.argv;
    process.argv = [...argv];
    let reloaded: typeof metroConfig;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      reloaded = require("../../metro.config.js");
    });
    process.argv = originalArgv;
    return reloaded!;
  };

  it("redirects @sentry/react-native to the no-op shim when no flavor is detected", () => {
    const result = metroConfig.resolver.resolveRequest(
      makeContext(),
      "@sentry/react-native",
      "android",
    );
    expect(result.resolved).toContain("sentry-noop");
  });

  it("redirects @sentry/react-native to the no-op shim for the fdroid flavor", () => {
    const fdroid = loadConfigWithArgv(["node", "cli.js", FDROID_TASK]);
    const result = fdroid.resolver.resolveRequest(
      makeContext(),
      "@sentry/react-native",
      "android",
    );
    expect(result.resolved).toContain("sentry-noop");
  });

  it("does NOT redirect @sentry/react-native for the playstore flavor", () => {
    const playstore = loadConfigWithArgv(["node", "cli.js", PLAYSTORE_TASK]);
    const result = playstore.resolver.resolveRequest(
      makeContext(),
      "@sentry/react-native",
      "android",
    );
    expect(result.resolved).toBe("@sentry/react-native");
    expect(result.resolved).not.toContain("sentry-noop");
  });

  it("leaves unrelated modules untouched", () => {
    const result = metroConfig.resolver.resolveRequest(
      makeContext(),
      "react-native",
      "android",
    );
    expect(result.resolved).toBe("react-native");
  });
});
