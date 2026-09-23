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
  SIDECHAIN_SNOWSIDE,
  SIDECHAIN_RISCY,
  SIDECHAIN_FREEBANK,
  SIDECHAIN_ELEMENTS_PLUS,
  getSidechainBySlot,
  getSidechainById,
  getSidechainBySlotOrThrow,
  getActiveSidechains,
  getActiveSidechainCount,
  getSidechainCount,
} from "../sidechains/registry";

// ---------------------------------------------------------------------------
// Registry Completeness
// ---------------------------------------------------------------------------

describe("Sidechain Registry", () => {
  it("has 11 known sidechains (10 active drivechains + Elements Plus, coming soon)", () => {
    expect(LAUNCH_SIDECHAINS).toHaveLength(11);
  });

  it("slots are unique and match the authoritative BIP-300 assignments", () => {
    const slots = LAUNCH_SIDECHAINS
      .map((sc) => sc.slot)
      .filter((slot): slot is number => slot != null);
    const uniqueSlots = new Set(slots);
    expect(uniqueSlots.size).toBe(slots.length);
    // Authoritative assigned slots (dev.txt ports table) + Snowside slot 88
    // and FreeBank slot 130, sorted ascending.
    expect([...slots].sort((a, b) => a - b)).toEqual([2, 3, 4, 9, 13, 88, 98, 99, 130, 255]);
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

  it("getSidechainCount returns 11", () => {
    expect(getSidechainCount()).toBe(11);
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

  it("Snowside is slot 88 and active", () => {
    expect(SIDECHAIN_SNOWSIDE.slot).toBe(88);
    expect(SIDECHAIN_SNOWSIDE.id).toBe("snowside");
    expect(SIDECHAIN_SNOWSIDE.status).toBe("active");
  });

  it("RISCy is slot 3 and active", () => {
    expect(SIDECHAIN_RISCY.slot).toBe(3);
    expect(SIDECHAIN_RISCY.id).toBe("riscy");
    expect(SIDECHAIN_RISCY.status).toBe("active");
  });

  it("FreeBank is slot 130 and active", () => {
    expect(SIDECHAIN_FREEBANK.slot).toBe(130);
    expect(SIDECHAIN_FREEBANK.id).toBe("freebank");
    expect(SIDECHAIN_FREEBANK.status).toBe("active");
    expect(SIDECHAIN_FREEBANK.infoUrl).toBe("https://github.com/mbdrivechains/freebank");
  });

  it("Elements Plus has no assigned slot yet and is coming soon", () => {
    expect(SIDECHAIN_ELEMENTS_PLUS.slot).toBeNull();
    expect(SIDECHAIN_ELEMENTS_PLUS.id).toBe("elementsplus");
    expect(SIDECHAIN_ELEMENTS_PLUS.shortName).toBe("Elements+");
    expect(SIDECHAIN_ELEMENTS_PLUS.status).toBe("coming soon");
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
    expect(getSidechainBySlot(88)).toBe(SIDECHAIN_SNOWSIDE);
    expect(getSidechainBySlot(130)).toBe(SIDECHAIN_FREEBANK);
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

  it("getActiveSidechains returns 10 active sidechains (only elementsplus is coming soon)", () => {
    const active = getActiveSidechains();
    expect(active).toHaveLength(10);
    active.forEach((sc) => {
      expect(sc.status).toBe("active");
    });
  });

  it("getActiveSidechainCount matches getActiveSidechains().length", () => {
    expect(getActiveSidechainCount()).toBe(getActiveSidechains().length);
    expect(getActiveSidechainCount()).toBe(10);
  });

  it("getActiveSidechains does not include the coming-soon chain", () => {
    const active = getActiveSidechains();
    const ids = active.map((sc) => sc.id);
    expect(ids).toContain("riscy");
    expect(ids).toContain("snowside");
    expect(ids).toContain("freebank");
    expect(ids).not.toContain("elementsplus");
  });
});
