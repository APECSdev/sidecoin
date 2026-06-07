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
  SIDECHAIN_RISCY,
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
  it("has 8 known sidechains (7 active drivechains + 1 proposed)", () => {
    expect(LAUNCH_SIDECHAINS).toHaveLength(8);
  });

  it("slots are unique and match the authoritative BIP-300 assignments", () => {
    const slots = LAUNCH_SIDECHAINS.map((sc) => sc.slot);
    const uniqueSlots = new Set(slots);
    expect(uniqueSlots.size).toBe(slots.length);
    // Authoritative slots (dev.txt ports table), sorted ascending:
    expect([...slots].sort((a, b) => a - b)).toEqual([2, 3, 4, 9, 13, 98, 99, 255]);
  });

  it("slots are NOT sequential (sparse BIP-300 assignment)", () => {
    const slots = LAUNCH_SIDECHAINS.map((sc) => sc.slot);
    expect(slots).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("IDs are unique", () => {
    const ids = LAUNCH_SIDECHAINS.map((sc) => sc.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("all sidechains support BMM", () => {
    LAUNCH_SIDECHAINS.forEach((sc) => {
      expect(sc.supportsBmm).toBe(true);
    });
  });

  it("all sidechains have non-empty display names", () => {
    LAUNCH_SIDECHAINS.forEach((sc) => {
      expect(sc.displayName.length).toBeGreaterThan(0);
    });
  });

  it("all sidechains have non-empty descriptions", () => {
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
  it("Thunder is slot 9", () => {
    expect(SIDECHAIN_THUNDER.slot).toBe(9);
    expect(SIDECHAIN_THUNDER.id).toBe("thunder");
  });

  it("zSide is slot 98", () => {
    expect(SIDECHAIN_ZSIDE.slot).toBe(98);
    expect(SIDECHAIN_ZSIDE.id).toBe("zside");
  });

  it("BitNames is slot 2", () => {
    expect(SIDECHAIN_BITNAMES.slot).toBe(2);
    expect(SIDECHAIN_BITNAMES.id).toBe("bitnames");
  });

  it("BitAssets is slot 4", () => {
    expect(SIDECHAIN_BITASSETS.slot).toBe(4);
    expect(SIDECHAIN_BITASSETS.id).toBe("bitassets");
  });

  it("Photon is slot 99", () => {
    expect(SIDECHAIN_PHOTON.slot).toBe(99);
    expect(SIDECHAIN_PHOTON.id).toBe("photon");
  });

  it("Truthcoin is slot 13", () => {
    expect(SIDECHAIN_TRUTHCOIN.slot).toBe(13);
    expect(SIDECHAIN_TRUTHCOIN.id).toBe("truthcoin");
  });

  it("CoinShift is slot 255", () => {
    expect(SIDECHAIN_COINSHIFT.slot).toBe(255);
    expect(SIDECHAIN_COINSHIFT.id).toBe("coinshift");
  });

  it("RISCy is slot 3 and proposed", () => {
    expect(SIDECHAIN_RISCY.slot).toBe(3);
    expect(SIDECHAIN_RISCY.id).toBe("riscy");
    expect(SIDECHAIN_RISCY.status).toBe("proposed");
  });
});

// ---------------------------------------------------------------------------
// Lookup Functions
// ---------------------------------------------------------------------------

describe("Sidechain Lookups", () => {
  it("getSidechainBySlot finds registered slots", () => {
    expect(getSidechainBySlot(9)).toBe(SIDECHAIN_THUNDER);
    expect(getSidechainBySlot(13)).toBe(SIDECHAIN_TRUTHCOIN);
    expect(getSidechainBySlot(255)).toBe(SIDECHAIN_COINSHIFT);
    expect(getSidechainBySlot(3)).toBe(SIDECHAIN_RISCY);
  });

  it("getSidechainBySlot returns undefined for unregistered slots", () => {
    expect(getSidechainBySlot(0)).toBeUndefined();
    expect(getSidechainBySlot(1)).toBeUndefined();
    expect(getSidechainBySlot(5)).toBeUndefined();
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
    expect(getSidechainBySlotOrThrow(9)).toBe(SIDECHAIN_THUNDER);
  });

  it("getSidechainBySlotOrThrow throws for invalid slot", () => {
    expect(() => getSidechainBySlotOrThrow(0)).toThrow("Unknown sidechain slot 0");
  });

  it("getActiveSidechains returns 7 active sidechains (riscy is proposed)", () => {
    const active = getActiveSidechains();
    expect(active).toHaveLength(7);
    active.forEach((sc) => {
      expect(sc.status).toBe("active");
    });
  });

  it("getActiveSidechains does not include the proposed riscy chain", () => {
    const active = getActiveSidechains();
    const ids = active.map((sc) => sc.id);
    expect(ids).not.toContain("riscy");
  });
});
