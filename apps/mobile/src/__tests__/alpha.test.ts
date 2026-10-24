// apps/mobile/src/__tests__/alpha.test.ts
//
// Tests for the Alpha meter engine (src/alpha.ts, added 26.10.24):
//
//   - 100 Alpha start, drain 100/h while a PRO screen is foregrounded,
//     regen 8/h while idle (never the other way around, never for
//     unlimited plans or the F-Droid flavor).
//   - Every PRO action declares a cost; in-flight actions are never
//     hard-blocked (spend floors at 0), only starting at 0 is gated.
//   - Earn-back grants are one-time, on-chain-evidence-gated (the caller
//     verifies; the engine records), and capped per UTC day.
//   - canUseProFeature/Platform: plan-unlimited OR (metered AND balance > 0).
//
// Time is controlled with a mocked Date.now; module state is per-test via
// jest.resetModules() + re-require (same seam as entitlementsApi.test.ts).

// The store lives OUTSIDE the factory so it survives jest.resetModules()
// re-instantiation — that is what makes the "next launch" persistence test
// possible. (Jest allows factory references only to mock-prefixed names.)
const mockStore: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete mockStore[key];
    }),
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */

// Module marker: without it this file is a global script and its `load()`
// collides with the identically-named helper in entitlementsApi.test.ts.
export {};

const MINUTE = 60_000;
const T0 = 1_761_100_000_000; // fixed arbitrary epoch ms

let now = T0;

function load(opts: { fdroid?: boolean; proPlan?: boolean } = {}) {
  jest.resetModules();
  if (opts.fdroid) {
    jest.doMock("../buildFlavor", () => ({ IS_FDROID_BUILD: true }));
  }
  if (opts.proPlan) {
    jest.doMock("../entitlements", () => ({
      ...jest.requireActual("../entitlements"),
      isProPlan: () => true,
    }));
  }
  const alpha = require("../alpha");
  const ent = require("../entitlements");
  const storage = require("@react-native-async-storage/async-storage");
  return { alpha, ent, storage };
}

beforeEach(() => {
  now = T0;
  for (const key of Object.keys(mockStore)) delete mockStore[key];
  jest.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  (Date.now as jest.Mock).mockRestore();
  jest.dontMock("../buildFlavor");
  jest.dontMock("../entitlements");
});

describe("settleAlphaState (pure)", () => {
  it("regens 8 Alpha per hour while idle, clamped at the cap", () => {
    const { alpha } = load();
    const base = {
      balance: 50,
      updatedAt: T0,
      session: null,
      claimedGrants: [],
      grantDay: "2026-10-24",
      grantDayTotal: 0,
    };
    const settled = alpha.settleAlphaState(base, T0 + 60 * MINUTE, true);
    expect(settled.balance).toBeCloseTo(58, 5);
    expect(settled.updatedAt).toBe(T0 + 60 * MINUTE);

    const topped = alpha.settleAlphaState(
      { ...base, balance: 99 },
      T0 + 600 * MINUTE,
      true,
    );
    expect(topped.balance).toBe(100);
  });

  it("drains 100 Alpha per hour during a metered foreground session", () => {
    const { alpha } = load();
    const base = {
      balance: 100,
      updatedAt: T0,
      session: { featureId: "platform:zside", startedAt: T0 },
      claimedGrants: [],
      grantDay: "2026-10-24",
      grantDayTotal: 0,
    };
    const settled = alpha.settleAlphaState(base, T0 + 30 * MINUTE, true);
    expect(settled.balance).toBeCloseTo(50, 5);
  });

  it("never drains for unlimited plans, even with an active session", () => {
    const { alpha } = load();
    const base = {
      balance: 100,
      updatedAt: T0,
      session: { featureId: "platform:zside", startedAt: T0 },
      claimedGrants: [],
      grantDay: "2026-10-24",
      grantDayTotal: 0,
    };
    const settled = alpha.settleAlphaState(base, T0 + 30 * MINUTE, false);
    expect(settled.balance).toBe(100);
  });

  it("floors the balance at 0", () => {
    const { alpha } = load();
    const base = {
      balance: 10,
      updatedAt: T0,
      session: { featureId: "platform:zside", startedAt: T0 },
      claimedGrants: [],
      grantDay: "2026-10-24",
      grantDayTotal: 0,
    };
    const settled = alpha.settleAlphaState(base, T0 + 600 * MINUTE, true);
    expect(settled.balance).toBe(0);
  });
});

describe("live state", () => {
  it("starts at 100 Alpha on a fresh install", async () => {
    const { alpha } = load();
    await alpha.loadAlphaState;
    expect(alpha.getAlphaBalance()).toBe(100);
    expect(alpha.getAlphaState().session).toBeNull();
  });

  it("drains while a PRO session is open and regens after it ends", async () => {
    const { alpha } = load();
    await alpha.loadAlphaState;

    alpha.beginProSession("platform:zside");
    expect(alpha.getAlphaState().session?.featureId).toBe("platform:zside");

    now += 30 * MINUTE; // 30 minutes foregrounded → −50
    expect(alpha.getAlphaBalance()).toBeCloseTo(50, 5);

    alpha.endProSession();
    expect(alpha.getAlphaState().session).toBeNull();

    now += 60 * MINUTE; // 1 hour idle → +8
    expect(alpha.getAlphaBalance()).toBeCloseTo(58, 5);
  });

  it("is not metered for pro plans or the F-Droid flavor", async () => {
    const pro = load({ proPlan: true });
    await pro.alpha.loadAlphaState;
    expect(pro.alpha.isAlphaMetered(pro.ent.CURRENT_ENTITLEMENTS)).toBe(false);
    pro.alpha.beginProSession("platform:zside");
    expect(pro.alpha.getAlphaState().session).toBeNull();

    const fdroid = load({ fdroid: true });
    await fdroid.alpha.loadAlphaState;
    expect(fdroid.alpha.isAlphaMetered(fdroid.ent.CURRENT_ENTITLEMENTS)).toBe(
      false,
    );
    fdroid.alpha.beginProSession("platform:zside");
    expect(fdroid.alpha.getAlphaState().session).toBeNull();
  });

  it("persists the balance and restores it on the next launch", async () => {
    const first = load();
    await first.alpha.loadAlphaState;
    first.alpha.beginProSession("platform:zside");
    now += 30 * MINUTE;
    first.alpha.endProSession(); // settles −50 and persists

    const second = load();
    await second.alpha.loadAlphaState;
    expect(second.alpha.getAlphaBalance()).toBeCloseTo(50, 5);
  });
});

describe("action costs", () => {
  it("declares a cost for every PRO action", () => {
    const { alpha } = load();
    expect(alpha.alphaCostFor("wallet:coin-control:send")).toBe(15);
    expect(alpha.alphaCostFor("platform:workflow-run")).toBe(10);
  });

  it("spends the declared cost and floors in-flight actions at 0", async () => {
    const { alpha } = load();
    await alpha.loadAlphaState;

    expect(alpha.spendAlpha("wallet:coin-control:send")).toBe(true);
    expect(alpha.getAlphaBalance()).toBeCloseTo(85, 5);

    // Drain to 10, then a 15-cost action still completes (no hard block).
    alpha.beginProSession("platform:zside");
    now += 45 * MINUTE; // −75 → 10
    alpha.endProSession();
    expect(alpha.getAlphaBalance()).toBeCloseTo(10, 5);
    expect(alpha.spendAlpha("wallet:coin-control:send")).toBe(true);
    expect(alpha.getAlphaBalance()).toBe(0);
  });

  it("refuses to START an action at 0 Alpha but never charges unlimited plans", async () => {
    const { alpha } = load();
    await alpha.loadAlphaState;
    alpha.beginProSession("platform:zside");
    now += 600 * MINUTE; // fully drained
    alpha.endProSession();
    expect(alpha.getAlphaBalance()).toBe(0);
    expect(alpha.canAffordAction("wallet:coin-control:send")).toBe(false);
    expect(alpha.spendAlpha("wallet:coin-control:send")).toBe(false);

    const pro = load({ proPlan: true });
    await pro.alpha.loadAlphaState;
    // Storage is shared across loads, so the pro plan inherits the drained
    // tank — and is STILL never gated or charged.
    expect(pro.alpha.canAffordAction("wallet:coin-control:send")).toBe(true);
    const before = pro.alpha.getAlphaBalance();
    expect(pro.alpha.spendAlpha("wallet:coin-control:send")).toBe(true);
    expect(pro.alpha.getAlphaBalance()).toBe(before);
  });

  it("gates on the displayed integer, not the raw fraction", async () => {
    const { alpha } = load();
    await alpha.loadAlphaState;
    alpha.beginProSession("platform:zside");
    now += 60 * MINUTE; // exactly 100 drained → exactly 0
    alpha.endProSession();
    now += MINUTE; // 1 idle minute → 0.133… regen residue, displays "0"
    expect(alpha.getAlphaBalance()).toBeGreaterThan(0);
    expect(alpha.formatAlphaBalance(alpha.getAlphaBalance())).toBe("0");
    expect(alpha.canUseProFeature("platform:zside")).toBe(false);
    expect(alpha.canAffordAction("wallet:coin-control:send")).toBe(false);
  });
});

describe("combined gating", () => {
  it("opens PRO features to metered users while the tank is non-empty", async () => {
    const { alpha } = load();
    await alpha.loadAlphaState;
    // basic plan: zside is NOT in the free feature list…
    expect(alpha.canUseProFeature("platform:zside")).toBe(true); // …but 100 Alpha
    expect(alpha.canUseProPlatform("zside")).toBe(true);

    alpha.beginProSession("platform:zside");
    now += 600 * MINUTE;
    alpha.endProSession();
    expect(alpha.canUseProFeature("platform:zside")).toBe(false);
    expect(alpha.canUseProPlatform("zside")).toBe(false);
  });

  it("keeps Basic features free regardless of the balance", async () => {
    const { alpha } = load();
    await alpha.loadAlphaState;
    alpha.beginProSession("platform:zside");
    now += 600 * MINUTE;
    alpha.endProSession();
    expect(alpha.getAlphaBalance()).toBe(0);
    expect(alpha.canUseProFeature("l1")).toBe(true); // free forever
    expect(alpha.canUseProPlatform("thunder")).toBe(true); // basic platform
  });

  it("is fully unlocked on the F-Droid flavor with no metering", async () => {
    const { alpha } = load({ fdroid: true });
    await alpha.loadAlphaState;
    expect(alpha.canUseProPlatform("zside")).toBe(true);
    expect(alpha.canUseProFeature("wallet:coin-control")).toBe(true);
  });
});

describe("earn-back grants", () => {
  it("claims each grant once and clamps at the cap", async () => {
    const { alpha } = load();
    await alpha.loadAlphaState;

    // Drain to 50 so the +25 is observable below the cap.
    alpha.beginProSession("platform:zside");
    now += 30 * MINUTE;
    alpha.endProSession();

    const first = alpha.claimAlphaGrant("grant:first-l1-deposit");
    expect(first).toEqual({ claimed: true, amount: 25 });
    expect(alpha.getAlphaBalance()).toBeCloseTo(75, 5);

    const again = alpha.claimAlphaGrant("grant:first-l1-deposit");
    expect(again.claimed).toBe(false);
    expect(again.reason).toBe("already-claimed");
    expect(alpha.getAlphaBalance()).toBeCloseTo(75, 5);

    const unknown = alpha.claimAlphaGrant("grant:does-not-exist");
    expect(unknown.claimed).toBe(false);
    expect(unknown.reason).toBe("unknown");
  });

  it("enforces the daily grant cap and resets it on the next UTC day", async () => {
    const { alpha } = load();
    await alpha.loadAlphaState;
    alpha.beginProSession("platform:zside");
    now += 30 * MINUTE; // 50 balance
    alpha.endProSession();

    expect(alpha.claimAlphaGrant("grant:first-l1-deposit").claimed).toBe(true); // day total 25
    expect(alpha.claimAlphaGrant("grant:first-broadcast").claimed).toBe(true); // 45
    const capped = alpha.claimAlphaGrant("grant:first-platform-deposit"); // 45+15 > 50
    expect(capped.claimed).toBe(false);
    expect(capped.reason).toBe("daily-cap");

    now += 24 * 60 * MINUTE; // next UTC day (balance regens to cap meanwhile)
    const nextDay = alpha.claimAlphaGrant("grant:first-platform-deposit");
    expect(nextDay).toEqual({ claimed: true, amount: 15 });
    expect(alpha.getAlphaBalance()).toBe(100); // clamped at the cap
  });
});

describe("UX helpers", () => {
  it("reports the regen ETA only while idle and below the cap", async () => {
    const { alpha } = load();
    await alpha.loadAlphaState;
    expect(alpha.alphaRegenEtaMinutes()).toBeNull(); // full

    alpha.beginProSession("platform:zside");
    now += 30 * MINUTE; // 50
    expect(alpha.alphaRegenEtaMinutes()).toBeNull(); // draining → no ETA
    alpha.endProSession();
    // (100 − 50) / (8/60) = 375 minutes
    expect(alpha.alphaRegenEtaMinutes()).toBe(375);
  });

  it("classifies low and critical balances at the thresholds", () => {
    const { alpha } = load();
    expect(alpha.alphaBalanceWarning(100)).toBeNull();
    expect(alpha.alphaBalanceWarning(26)).toBeNull();
    expect(alpha.alphaBalanceWarning(25)).toBe("low");
    expect(alpha.alphaBalanceWarning(11)).toBe("low");
    expect(alpha.alphaBalanceWarning(10)).toBe("critical");
    expect(alpha.alphaBalanceWarning(0)).toBe("critical");
  });

  it("formats the balance as an integer floor", () => {
    const { alpha } = load();
    expect(alpha.formatAlphaBalance(87.9)).toBe("87");
    expect(alpha.formatAlphaBalance(0)).toBe("0");
  });

  it("notifies subscribers on spends and stops after unsubscribe", async () => {
    const { alpha } = load();
    await alpha.loadAlphaState;
    const seen: number[] = [];
    const unsubscribe = alpha.subscribeAlpha((s: { balance: number }) =>
      seen.push(s.balance),
    );
    alpha.spendAlpha("wallet:coin-control:send");
    unsubscribe();
    alpha.spendAlpha("wallet:coin-control:send");
    expect(seen.length).toBe(1);
    expect(seen[0]).toBeCloseTo(85, 5);
  });
});
