// apps/mobile/src/__tests__/entitlementsApi.test.ts
//
// Tests for the backend-sync half of src/entitlements.ts (added 26.10.23;
// server contract in infra/entitlements/HANDOFF-sidecoin-api.md):
//
//   GET /v1/me/entitlements (Bearer entitlement key)
//     200 + valid payload   -> applied, expiry-checked, cached  ("network")
//     200 + malformed       -> cached state                     ("cache")
//     401                   -> key + cache cleared, re-lock     ("basic")
//     other status / throw  -> cached state, else Basic         ("cache"/"basic")
//
//   F-Droid builds short-circuit to the all-features constant and MUST NOT
//   touch the network at all (fdroiddata!50457 note 4064134145).
//
// Module state (CURRENT_ENTITLEMENTS + the AsyncStorage mock) is per-test:
// jest.resetModules() + re-require, the same seam entitlementsFdroid.test.ts
// uses.

jest.mock("@react-native-async-storage/async-storage", () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
    },
    __resetStore: () => {
      store = {};
    },
  };
});

/* eslint-disable @typescript-eslint/no-var-requires */

const PRO_PAYLOAD = {
  plan: "pro",
  status: "active",
  features: ["l1", "platform:zside", "wallet:coin-control"],
  expiresAt: null,
  checkedAt: null,
};

const EXPIRED_PRO_PAYLOAD = {
  ...PRO_PAYLOAD,
  expiresAt: "2000-01-01T00:00:00.000Z",
};

function mockResponse(init: {
  ok: boolean;
  status: number;
  body?: unknown;
}): typeof globalThis.fetch {
  return (async () => ({
    ok: init.ok,
    status: init.status,
    json: async () => init.body,
  })) as unknown as typeof globalThis.fetch;
}

function throwingFetch(): typeof globalThis.fetch {
  return (async () => {
    throw new Error("network unreachable");
  }) as unknown as typeof globalThis.fetch;
}

function load(fdroid = false) {
  jest.resetModules();
  if (fdroid) {
    jest.doMock("../buildFlavor", () => ({ IS_FDROID_BUILD: true }));
  }
  const ent = require("../entitlements");
  const storage = require("@react-native-async-storage/async-storage");
  return { ent, storage };
}

async function primeCache(ent: Record<string, any>, storage: Record<string, any>) {
  await storage.default.setItem(
    ent.ENTITLEMENTS_CACHE_STORAGE_KEY,
    JSON.stringify({ ...PRO_PAYLOAD, checkedAt: "2026-10-23T00:00:00.000Z" }),
  );
}

afterEach(() => {
  jest.dontMock("../buildFlavor");
});

describe("refreshEntitlements", () => {
  it("defaults to Basic and never fetches when no key is stored", async () => {
    const { ent } = load();
    const fetchMock = jest.fn();

    const result = await ent.refreshEntitlements(fetchMock);

    expect(result.source).toBe("basic");
    expect(result.state.plan).toBe("basic");
    expect(ent.CURRENT_ENTITLEMENTS.plan).toBe("basic");
    expect(ent.isProPlan()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("applies a valid PRO state from the backend and caches it", async () => {
    const { ent, storage } = load();
    await ent.setEntitlementKey("key-abc");

    const result = await ent.refreshEntitlements(mockResponse({
      ok: true,
      status: 200,
      body: PRO_PAYLOAD,
    }));

    expect(result.source).toBe("network");
    expect(result.state.plan).toBe("pro");
    expect(result.state.checkedAt).not.toBeNull();
    expect(ent.isProPlan()).toBe(true);
    expect(ent.canAccessPlatform("zside")).toBe(true);
    expect(ent.canAccessFeature(ent.COIN_CONTROL_FEATURE_ID)).toBe(true);

    const cached = await storage.default.getItem(ent.ENTITLEMENTS_CACHE_STORAGE_KEY);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached as string).plan).toBe("pro");
  });

  it("re-locks when the backend state is expired", async () => {
    const { ent } = load();
    await ent.setEntitlementKey("key-abc");

    const result = await ent.refreshEntitlements(mockResponse({
      ok: true,
      status: 200,
      body: EXPIRED_PRO_PAYLOAD,
    }));

    expect(result.source).toBe("network");
    expect(result.state.status).toBe("inactive");
    expect(ent.isProPlan()).toBe(false);
    expect(ent.canAccessPlatform("zside")).toBe(false);
    expect(ent.canAccessFeature(ent.COIN_CONTROL_FEATURE_ID)).toBe(false);
  });

  it("clears key + cache and re-locks on 401", async () => {
    const { ent, storage } = load();
    await ent.setEntitlementKey("key-revoked");
    await primeCache(ent, storage);

    const result = await ent.refreshEntitlements(mockResponse({
      ok: false,
      status: 401,
    }));

    expect(result.source).toBe("basic");
    expect(result.state.plan).toBe("basic");
    expect(await ent.getEntitlementKey()).toBeNull();
    expect(
      await storage.default.getItem(ent.ENTITLEMENTS_CACHE_STORAGE_KEY),
    ).toBeNull();
    expect(ent.isProPlan()).toBe(false);
  });

  it("falls back to the cached state when the network throws", async () => {
    const { ent, storage } = load();
    await ent.setEntitlementKey("key-abc");
    await primeCache(ent, storage);

    const result = await ent.refreshEntitlements(throwingFetch());

    expect(result.source).toBe("cache");
    expect(result.state.plan).toBe("pro");
    expect(ent.isProPlan()).toBe(true);
  });

  it("falls back to Basic when the network throws and nothing is cached", async () => {
    const { ent } = load();
    await ent.setEntitlementKey("key-abc");

    const result = await ent.refreshEntitlements(throwingFetch());

    expect(result.source).toBe("basic");
    expect(ent.CURRENT_ENTITLEMENTS.plan).toBe("basic");
    expect(ent.isProPlan()).toBe(false);
  });

  it("falls back to the cached state on a malformed payload", async () => {
    const { ent, storage } = load();
    await ent.setEntitlementKey("key-abc");
    await primeCache(ent, storage);

    const result = await ent.refreshEntitlements(mockResponse({
      ok: true,
      status: 200,
      body: { plan: "enterprise", status: "active", features: [] },
    }));

    expect(result.source).toBe("cache");
    expect(result.state.plan).toBe("pro");
    expect(ent.isProPlan()).toBe(true);
  });

  it("falls back to cache on a non-401 error status (route undeployed)", async () => {
    const { ent, storage } = load();
    await ent.setEntitlementKey("key-abc");
    await primeCache(ent, storage);

    const result = await ent.refreshEntitlements(mockResponse({
      ok: false,
      status: 404,
    }));

    expect(result.source).toBe("cache");
    // The key is kept: 404 means the route is not deployed yet, not that
    // the key is invalid (only 401 clears it).
    expect(await ent.getEntitlementKey()).toBe("key-abc");
    expect(ent.isProPlan()).toBe(true);
  });

  it("enforces expiry on the cached state too", async () => {
    const { ent, storage } = load();
    await ent.setEntitlementKey("key-abc");
    await storage.default.setItem(
      ent.ENTITLEMENTS_CACHE_STORAGE_KEY,
      JSON.stringify(EXPIRED_PRO_PAYLOAD),
    );

    const result = await ent.refreshEntitlements(throwingFetch());

    expect(result.source).toBe("cache");
    expect(result.state.status).toBe("inactive");
    expect(ent.isProPlan()).toBe(false);
    // Expiry collapses the feature list to the Basic set.
    expect(ent.canAccessPlatform("zside")).toBe(false);
    expect(ent.canAccessFeature(ent.COIN_CONTROL_FEATURE_ID)).toBe(false);
  });

  it("F-Droid builds never call the network and unlock everything", async () => {
    const { ent } = load(true);
    const fetchMock = jest.fn();
    await ent.setEntitlementKey("key-abc");

    const result = await ent.refreshEntitlements(fetchMock);

    expect(result.source).toBe("fdroid");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ent.isProPlan()).toBe(true);
    for (const id of ent.PRO_PLATFORM_IDS) {
      expect(ent.canAccessPlatform(id)).toBe(true);
    }
  });
});

describe("setEntitlementKey", () => {
  it("re-locks immediately and notifies subscribers when cleared", async () => {
    const { ent, storage } = load();
    await ent.setEntitlementKey("key-abc");
    await ent.refreshEntitlements(mockResponse({
      ok: true,
      status: 200,
      body: PRO_PAYLOAD,
    }));
    expect(ent.isProPlan()).toBe(true);

    const seen: string[] = [];
    const unsubscribe = ent.subscribeEntitlements(
      (state: { plan: string }) => seen.push(state.plan),
    );

    await ent.setEntitlementKey(null);

    expect(seen).toEqual(["basic"]);
    expect(ent.CURRENT_ENTITLEMENTS.plan).toBe("basic");
    expect(ent.canAccessPlatform("zside")).toBe(false);
    expect(
      await storage.default.getItem(ent.ENTITLEMENT_KEY_STORAGE_KEY),
    ).toBeNull();

    unsubscribe();
  });

  it("treats blank input as a clear", async () => {
    const { ent } = load();
    await ent.setEntitlementKey("key-abc");
    expect(await ent.getEntitlementKey()).toBe("key-abc");

    await ent.setEntitlementKey("   ");

    expect(await ent.getEntitlementKey()).toBeNull();
  });
});

describe("subscribeEntitlements", () => {
  it("notifies on refresh and stops after unsubscribe", async () => {
    const { ent } = load();
    await ent.setEntitlementKey("key-abc");

    const seen: string[] = [];
    const unsubscribe = ent.subscribeEntitlements(
      (state: { plan: string }) => seen.push(state.plan),
    );

    await ent.refreshEntitlements(mockResponse({
      ok: true,
      status: 200,
      body: PRO_PAYLOAD,
    }));
    expect(seen).toEqual(["pro"]);

    unsubscribe();
    await ent.refreshEntitlements(mockResponse({
      ok: true,
      status: 200,
      body: PRO_PAYLOAD,
    }));
    expect(seen).toEqual(["pro"]);
  });
});

describe("parseEntitlementState", () => {
  it("accepts the documented contract shape", () => {
    const { ent } = load();
    expect(ent.parseEntitlementState(PRO_PAYLOAD)).toEqual(PRO_PAYLOAD);
  });

  it("rejects malformed payloads", () => {
    const { ent } = load();
    expect(ent.parseEntitlementState(null)).toBeNull();
    expect(ent.parseEntitlementState("pro")).toBeNull();
    expect(ent.parseEntitlementState({ ...PRO_PAYLOAD, plan: "enterprise" })).toBeNull();
    expect(ent.parseEntitlementState({ ...PRO_PAYLOAD, status: "trial" })).toBeNull();
    expect(ent.parseEntitlementState({ ...PRO_PAYLOAD, features: "all" })).toBeNull();
    expect(ent.parseEntitlementState({ ...PRO_PAYLOAD, expiresAt: 7 })).toBeNull();
  });
});
