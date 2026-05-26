// packages/shared/src/__tests__/sidechains.test.ts
//
// Unit tests for the sidechain registry.

import { describe, it, expect } from "vitest";

import {
  LAUNCH_SIDECHAINS,
  SIDECHAIN_THUNDER,
  SIDECHAIN_ZSIDE,
  SIDECHAIN_BITNAMES,
  SIDECHAIN_BITASSETS,
  SIDECHAIN_PHOTON,
  SIDECHAIN_TRUTHCOIN,
  SIDECHAIN_COINSHIFT,
  SIDECHAIN_RESERVED_7,
  getSidechainBySlot,
  getSidechainById,
  getSidechainBySlotOrThrow,
  getActiveSidechains,
  getSidechainCount,
} from "../sidechains/registry";

// ---------------------------------------------------------------------------
// Registry Completeness
// ---------------------------------------------------------------------------

describe("Sidechain Registry", () => {
  it("has exactly 8 sidechains at launch", () => {
    expect(LAUNCH_SIDECHAINS).toHaveLength(8);
  });

  it("slots are unique and sequential 0-7", () => {
    const slots = LAUNCH_SIDECHAINS.map((sc) => sc.slot);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("IDs are unique", () => {
    const ids = LAUNCH_SIDECHAINS.map((sc) => sc.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("all launch sidechains support BMM", () => {
    LAUNCH_SIDECHAINS.forEach((sc) => {
      expect(sc.supportsBmm).toBe(true);
    });
  });

  it("all launch sidechains have non-empty display names", () => {
    LAUNCH_SIDECHAINS.forEach((sc) => {
      expect(sc.displayName.length).toBeGreaterThan(0);
    });
  });

  it("all launch sidechains have non-empty descriptions", () => {
    LAUNCH_SIDECHAINS.forEach((sc) => {
      expect(sc.description.length).toBeGreaterThan(0);
    });
  });

  it("getSidechainCount returns 8", () => {
    expect(getSidechainCount()).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Individual Sidechains
// ---------------------------------------------------------------------------

describe("Individual Sidechains", () => {
  it("Thunder is slot 0", () => {
    expect(SIDECHAIN_THUNDER.slot).toBe(0);
    expect(SIDECHAIN_THUNDER.id).toBe("thunder");
  });

  it("zSide is slot 1", () => {
    expect(SIDECHAIN_ZSIDE.slot).toBe(1);
    expect(SIDECHAIN_ZSIDE.id).toBe("zside");
  });

  it("BitNames is slot 2", () => {
    expect(SIDECHAIN_BITNAMES.slot).toBe(2);
    expect(SIDECHAIN_BITNAMES.id).toBe("bitnames");
  });

  it("BitAssets is slot 3", () => {
    expect(SIDECHAIN_BITASSETS.slot).toBe(3);
    expect(SIDECHAIN_BITASSETS.id).toBe("bitassets");
  });

  it("Photon is slot 4", () => {
    expect(SIDECHAIN_PHOTON.slot).toBe(4);
    expect(SIDECHAIN_PHOTON.id).toBe("photon");
  });

  it("Truthcoin is slot 5", () => {
    expect(SIDECHAIN_TRUTHCOIN.slot).toBe(5);
    expect(SIDECHAIN_TRUTHCOIN.id).toBe("truthcoin");
  });

  it("CoinShift is slot 6", () => {
    expect(SIDECHAIN_COINSHIFT.slot).toBe(6);
    expect(SIDECHAIN_COINSHIFT.id).toBe("coinshift");
  });

  it("Reserved slot 7 is proposed", () => {
    expect(SIDECHAIN_RESERVED_7.slot).toBe(7);
    expect(SIDECHAIN_RESERVED_7.status).toBe("proposed");
  });
});

// ---------------------------------------------------------------------------
// Lookup Functions
// ---------------------------------------------------------------------------

describe("Sidechain Lookups", () => {
  it("getSidechainBySlot finds registered slots", () => {
    expect(getSidechainBySlot(0)).toBe(SIDECHAIN_THUNDER);
    expect(getSidechainBySlot(5)).toBe(SIDECHAIN_TRUTHCOIN);
    expect(getSidechainBySlot(7)).toBe(SIDECHAIN_RESERVED_7);
  });

  it("getSidechainBySlot returns undefined for unregistered slots", () => {
    expect(getSidechainBySlot(8)).toBeUndefined();
    expect(getSidechainBySlot(255)).toBeUndefined();
    expect(getSidechainBySlot(-1)).toBeUndefined();
  });

  it("getSidechainById finds by ID string", () => {
    expect(getSidechainById("thunder")).toBe(SIDECHAIN_THUNDER);
    expect(getSidechainById("zside")).toBe(SIDECHAIN_ZSIDE);
    expect(getSidechainById("coinshift")).toBe(SIDECHAIN_COINSHIFT);
  });

  it("getSidechainById returns undefined for unknown IDs", () => {
    expect(getSidechainById("nonexistent")).toBeUndefined();
    expect(getSidechainById("")).toBeUndefined();
  });

  it("getSidechainBySlotOrThrow returns for valid slot", () => {
    expect(getSidechainBySlotOrThrow(0)).toBe(SIDECHAIN_THUNDER);
  });

  it("getSidechainBySlotOrThrow throws for invalid slot", () => {
    expect(() => getSidechainBySlotOrThrow(99)).toThrow("Unknown sidechain slot 99");
  });

  it("getActiveSidechains returns 7 active sidechains (slot 7 is proposed)", () => {
    const active = getActiveSidechains();
    expect(active).toHaveLength(7);
    active.forEach((sc) => {
      expect(sc.status).toBe("active");
    });
  });

  it("getActiveSidechains does not include the reserved slot", () => {
    const active = getActiveSidechains();
    const ids = active.map((sc) => sc.id);
    expect(ids).not.toContain("reserved-7");
  });
});
