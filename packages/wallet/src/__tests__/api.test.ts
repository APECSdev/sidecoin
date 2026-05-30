// packages/wallet/src/__tests__/api.test.ts
//
// Comprehensive tests for the wallet API abstraction layer.
// Covers mock mode, live mode (fetch), configuration, and error handling.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getBalance,
  getLatestBlock,
  getSidechains,
  getReceiveAddress,
  setApiBaseUrl,
  getApiBaseUrl,
  isMockMode,
} from "../api";
import type { WalletBalance, BlockInfo, Sidechain } from "../api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetApiState() {
  setApiBaseUrl("");
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe("API Configuration", () => {
  beforeEach(() => {
    resetApiState();
  });

  afterEach(() => {
    resetApiState();
  });

  it("should start in mock mode with empty base URL", () => {
    expect(isMockMode()).toBe(true);
    expect(getApiBaseUrl()).toBe("");
  });

  it("should set and get the API base URL", () => {
    setApiBaseUrl("http://127.0.0.1:8332");
    expect(getApiBaseUrl()).toBe("http://127.0.0.1:8332");
    expect(isMockMode()).toBe(false);
  });

  it("should strip trailing slashes from the base URL", () => {
    setApiBaseUrl("http://127.0.0.1:8332///");
    expect(getApiBaseUrl()).toBe("http://127.0.0.1:8332");
  });

  it("should return to mock mode when URL is set to empty string", () => {
    setApiBaseUrl("http://127.0.0.1:8332");
    expect(isMockMode()).toBe(false);
    setApiBaseUrl("");
    expect(isMockMode()).toBe(true);
  });

  it("should log the base URL change", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setApiBaseUrl("http://localhost:9000");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[api] Base URL set to:",
      "http://localhost:9000"
    );
    consoleSpy.mockRestore();
  });

  it("should log '(mock mode)' when URL is cleared", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setApiBaseUrl("");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[api] Base URL set to:",
      "(mock mode)"
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Mock Mode — getBalance
// ---------------------------------------------------------------------------

describe("getBalance", () => {
  beforeEach(() => {
    resetApiState();
  });

  afterEach(() => {
    resetApiState();
    vi.restoreAllMocks();
  });

  it("should return mock balance when in mock mode", async () => {
    const balance = await getBalance();
    expect(balance).toEqual({
      confirmed: 0,
      unconfirmed: 0,
      total: 0,
    });
  });

  it("should return all balance fields as numbers", async () => {
    const balance = await getBalance();
    expect(typeof balance.confirmed).toBe("number");
    expect(typeof balance.unconfirmed).toBe("number");
    expect(typeof balance.total).toBe("number");
  });

  it("should fetch balance from API when not in mock mode", async () => {
    const mockBalance: WalletBalance = {
      confirmed: 100000000,
      unconfirmed: 50000000,
      total: 150000000,
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBalance),
    } as Response);

    setApiBaseUrl("http://127.0.0.1:8332");
    const balance = await getBalance();

    expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:8332/api/balance");
    expect(balance).toEqual(mockBalance);
  });

  it("should throw on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    setApiBaseUrl("http://127.0.0.1:8332");
    await expect(getBalance()).rejects.toThrow("Failed to fetch balance: 500");
  });

  it("should throw on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    setApiBaseUrl("http://127.0.0.1:8332");
    await expect(getBalance()).rejects.toThrow("Network error");
  });
});

// ---------------------------------------------------------------------------
// Mock Mode — getLatestBlock
// ---------------------------------------------------------------------------

describe("getLatestBlock", () => {
  beforeEach(() => {
    resetApiState();
  });

  afterEach(() => {
    resetApiState();
    vi.restoreAllMocks();
  });

  it("should return mock block when in mock mode", async () => {
    const block = await getLatestBlock();
    expect(block).toEqual({
      height: 0,
      hash: "0000000000000000000000000000000000000000000000000000000000000000",
      timestamp: 0,
    });
  });

  it("should return block with correct field types", async () => {
    const block = await getLatestBlock();
    expect(typeof block.height).toBe("number");
    expect(typeof block.hash).toBe("string");
    expect(typeof block.timestamp).toBe("number");
  });

  it("should have a 64-character hex hash in mock mode", async () => {
    const block = await getLatestBlock();
    expect(block.hash).toHaveLength(64);
    expect(block.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should fetch block from API when not in mock mode", async () => {
    const mockBlock: BlockInfo = {
      height: 964001,
      hash: "000000000000000000abcdef1234567890abcdef1234567890abcdef12345678",
      timestamp: 1787320800,
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBlock),
    } as Response);

    setApiBaseUrl("http://127.0.0.1:8332");
    const block = await getLatestBlock();

    expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:8332/api/block/latest");
    expect(block).toEqual(mockBlock);
  });

  it("should throw on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    setApiBaseUrl("http://127.0.0.1:8332");
    await expect(getLatestBlock()).rejects.toThrow("Failed to fetch block: 404");
  });
});

// ---------------------------------------------------------------------------
// Mock Mode — getSidechains
// ---------------------------------------------------------------------------

describe("getSidechains", () => {
  beforeEach(() => {
    resetApiState();
  });

  afterEach(() => {
    resetApiState();
    vi.restoreAllMocks();
  });

  it("should return mock sidechains when in mock mode", async () => {
    const sidechains = await getSidechains();
    expect(sidechains).toHaveLength(8);
  });

  it("should have correct structure for each sidechain", async () => {
    const sidechains = await getSidechains();
    for (const sc of sidechains) {
      expect(sc).toHaveProperty("slot");
      expect(sc).toHaveProperty("name");
      expect(sc).toHaveProperty("description");
      expect(sc).toHaveProperty("active");
      expect(typeof sc.slot).toBe("number");
      expect(typeof sc.name).toBe("string");
      expect(typeof sc.description).toBe("string");
      expect(typeof sc.active).toBe("boolean");
    }
  });

  it("should have sequential slot numbers 0-7", async () => {
    const sidechains = await getSidechains();
    const slots = sidechains.map((sc) => sc.slot);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("should have 7 active sidechains and 1 inactive", async () => {
    const sidechains = await getSidechains();
    const active = sidechains.filter((sc) => sc.active);
    const inactive = sidechains.filter((sc) => !sc.active);
    expect(active).toHaveLength(7);
    expect(inactive).toHaveLength(1);
    expect(inactive[0].slot).toBe(7);
  });

  it("should include Thunder Network as slot 0", async () => {
    const sidechains = await getSidechains();
    expect(sidechains[0].name).toBe("Thunder Network");
    expect(sidechains[0].slot).toBe(0);
    expect(sidechains[0].active).toBe(true);
  });

  it("should include all named sidechains", async () => {
    const sidechains = await getSidechains();
    const names = sidechains.map((sc) => sc.name);
    expect(names).toContain("Thunder Network");
    expect(names).toContain("zSide");
    expect(names).toContain("BitNames");
    expect(names).toContain("BitAssets");
    expect(names).toContain("Photon");
    expect(names).toContain("Truthcoin");
    expect(names).toContain("CoinShift");
  });

  it("should fetch sidechains from API when not in mock mode", async () => {
    const mockSidechains: Sidechain[] = [
      { slot: 0, name: "Thunder", description: "Test", active: true },
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSidechains),
    } as Response);

    setApiBaseUrl("http://127.0.0.1:8332");
    const sidechains = await getSidechains();

    expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:8332/api/sidechains");
    expect(sidechains).toEqual(mockSidechains);
  });

  it("should throw on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    setApiBaseUrl("http://127.0.0.1:8332");
    await expect(getSidechains()).rejects.toThrow("Failed to fetch sidechains: 503");
  });
});

// ---------------------------------------------------------------------------
// Mock Mode — getReceiveAddress
// ---------------------------------------------------------------------------

describe("getReceiveAddress", () => {
  beforeEach(() => {
    resetApiState();
  });

  afterEach(() => {
    resetApiState();
    vi.restoreAllMocks();
  });

  it("should return mock address when in mock mode", async () => {
    const address = await getReceiveAddress();
    expect(address).toBe("bc1q0000000000000000000000000000000000000000");
  });

  it("should return a string starting with 'bc1q'", async () => {
    const address = await getReceiveAddress();
    expect(address.startsWith("bc1q")).toBe(true);
  });

  it("should fetch address from API when not in mock mode", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("bc1qrealaddress123456"),
    } as Response);

    setApiBaseUrl("http://127.0.0.1:8332");
    const address = await getReceiveAddress();

    expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:8332/api/address/new");
    expect(address).toBe("bc1qrealaddress123456");
  });

  it("should throw on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    setApiBaseUrl("http://127.0.0.1:8332");
    await expect(getReceiveAddress()).rejects.toThrow("Failed to get address: 401");
  });
});
