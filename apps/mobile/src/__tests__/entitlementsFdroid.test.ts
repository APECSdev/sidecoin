// apps/mobile/src/__tests__/entitlementsFdroid.test.ts
//
// Pins the F-Droid entitlement posture (v26.10.22, fdroiddata!50457 note
// 4064134145): when metro.config.js bundles the `fdroid` flavor it resolves
// "./buildFlavor" to buildFlavor.fdroid.ts, and every PRO-gated platform and
// feature must then unlock — no paid tier, no upgrade CTA, no PRO mention in
// the UI. Jest never goes through Metro's resolveRequest, so the fdroid path
// is exercised by mocking the same one-module seam the real bundle uses.

import { IS_FDROID_BUILD as baseFlag } from "../buildFlavor";
import { IS_FDROID_BUILD as fdroidFlag } from "../buildFlavor.fdroid";

describe("buildFlavor flag modules", () => {
  it("base module ships IS_FDROID_BUILD=false (playstore / dev / Jest)", () => {
    expect(baseFlag).toBe(false);
  });

  it("fdroid module ships IS_FDROID_BUILD=true", () => {
    expect(fdroidFlag).toBe(true);
  });
});

describe("fdroid entitlements via the buildFlavor seam", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.dontMock("../buildFlavor");
  });

  it("unlocks every PRO platform and coin control when the flag is true", () => {
    jest.doMock("../buildFlavor", () => ({ IS_FDROID_BUILD: true }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ent = require("../entitlements");

    expect(ent.isProPlan()).toBe(true);
    for (const id of ent.PRO_PLATFORM_IDS) {
      expect(ent.canAccessPlatform(id)).toBe(true);
    }
    expect(ent.canAccessFeature(ent.COIN_CONTROL_FEATURE_ID)).toBe(true);
    expect(ent.CURRENT_ENTITLEMENTS.features).toEqual(
      expect.arrayContaining([...ent.BASIC_FEATURES, ...ent.PRO_FEATURES]),
    );
  });

  it("keeps the hardcoded Basic plan when the flag is false", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ent = require("../entitlements");

    expect(ent.isProPlan()).toBe(false);
    expect(ent.CURRENT_ENTITLEMENTS.plan).toBe("basic");
    for (const id of ent.PRO_PLATFORM_IDS) {
      expect(ent.canAccessPlatform(id)).toBe(false);
    }
    expect(ent.canAccessFeature(ent.COIN_CONTROL_FEATURE_ID)).toBe(false);
  });
});
