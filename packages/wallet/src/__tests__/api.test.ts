// packages/wallet/src/__tests__/api.test.ts
//
// Tests for the wallet API layer, which wraps the frozen @sidecoin/api-client.
// Covers client configuration, the delegated data calls, bigint coercion of
// satoshi amounts, and the normalized ApiError envelope.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSidechains,
  getDeposits,
  getWalletBalance,
  setApiBaseUrl,
  getApiBaseUrl,
  getClient,
  ApiError,
} from "../api";
import { DEFAULT_BASE_URL, SidecoinClient } from "@sidecoin/api-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetApiState() {
  setApiBaseUrl("");
}

/** Build a Response-like stub for the injected fetch. */
function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  const status = init?.status ?? 200;
  const ok = init?.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
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

  it("should default to an empty configured base URL", () => {
    expect(getApiBaseUrl()).toBe("");
  });

  it("should expose a SidecoinClient instance", () => {
    expect(getClient()).toBeInstanceOf(SidecoinClient);
  });

  it("should set and get the API base URL", () => {
    setApiBaseUrl("http://127.0.0.1:8332/v1");
    expect(getApiBaseUrl()).toBe("http://127.0.0.1:8332/v1");
  });

  it("should strip trailing slashes from the base URL", () => {
    setApiBaseUrl("http://127.0.0.1:8332/v1///");
    expect(getApiBaseUrl()).toBe("http://127.0.0.1:8332/v1");
  });

  it("should rebuild the client when the URL changes", () => {
    const before = getClient();
    setApiBaseUrl("http://127.0.0.1:8332/v1");
    const after = getClient();
    expect(after).not.toBe(before);
    expect(after).toBeInstanceOf(SidecoinClient);
  });

  it("should log the base URL change", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setApiBaseUrl("http://localhost:9000/v1");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[api] Base URL set to:",
      "http://localhost:9000/v1",
    );
    consoleSpy.mockRestore();
  });

  it("should log '(default)' when the URL is cleared", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setApiBaseUrl("");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[api] Base URL set to:",
      "(default)",
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getSidechains
// ---------------------------------------------------------------------------

describe("getSidechains", () => {
  beforeEach(() => {
    resetApiState();
  });

  afterEach(() => {
    resetApiState();
    vi.restoreAllMocks();
  });

  it("should hit the default base URL when none is configured", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ sidechains: [] }));

    await getSidechains();

    expect(fetchSpy).toHaveBeenCalledWith(
      `${DEFAULT_BASE_URL}/sidechains`,
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
  });

  it("should unwrap the { sidechains } envelope", async () => {
    const summaries = [
      {
        slot: 0,
        id: "thunder",
        displayName: "Thunder Network",
        description: "Payment channels",
        status: "active",
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ sidechains: summaries }),
    );

    const result = await getSidechains();
    expect(result).toEqual(summaries);
  });

  it("should hit the configured base URL", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ sidechains: [] }));

    setApiBaseUrl("http://127.0.0.1:8332/v1");
    await getSidechains();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:8332/v1/sidechains",
      expect.anything(),
    );
  });

  it("should throw ApiError on a normalized error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        { error: { code: "unavailable", message: "service down" } },
        { ok: false, status: 503 },
      ),
    );

    await expect(getSidechains()).rejects.toMatchObject({
      name: "ApiError",
      code: "unavailable",
      httpStatus: 503,
    });
  });

  it("should throw ApiError 'network_error' on transport failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));

    const err = await getSidechains().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("network_error");
    expect(err.httpStatus).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getDeposits
// ---------------------------------------------------------------------------

describe("getDeposits", () => {
  beforeEach(() => {
    resetApiState();
  });

  afterEach(() => {
    resetApiState();
    vi.restoreAllMocks();
  });

  function wireDeposit(valueSats: string) {
    return {
      slot: 3,
      chainId: "bitassets",
      l1Txid: "a".repeat(64),
      vout: 0,
      ctipSeq: 1,
      address: "tb1qexample",
      valueSats,
      status: "credited",
      confirmations: 6,
      firstSeenTs: 1787320000,
      l1ConfirmedTs: 1787320600,
      l2CreditedTs: 1787321200,
    };
  }

  it("should request the per-slot deposits path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        slot: 3,
        chainId: "bitassets",
        provisioned: true,
        deposits: [],
        nextCursor: null,
      }),
    );

    await getDeposits(3);

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe(`${DEFAULT_BASE_URL}/wallet/3/deposits`);
  });

  it("should forward query params (address, status, limit, cursor)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        slot: 3,
        chainId: "bitassets",
        provisioned: true,
        deposits: [],
        nextCursor: null,
      }),
    );

    await getDeposits(3, {
      address: "tb1qexample",
      status: "credited",
      limit: 25,
      cursor: "abc",
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("address=tb1qexample");
    expect(calledUrl).toContain("status=credited");
    expect(calledUrl).toContain("limit=25");
    expect(calledUrl).toContain("cursor=abc");
  });

  it("should coerce valueSats decimal strings to bigint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        slot: 3,
        chainId: "bitassets",
        provisioned: true,
        deposits: [wireDeposit("100000000")],
        nextCursor: null,
      }),
    );

    const page = await getDeposits(3);
    expect(page.deposits[0].valueSats).toBe(100000000n);
    expect(typeof page.deposits[0].valueSats).toBe("bigint");
  });

  it("should safely handle amounts exceeding 2^53", async () => {
    const huge = "90071992547409910"; // > Number.MAX_SAFE_INTEGER
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        slot: 3,
        chainId: "bitassets",
        provisioned: true,
        deposits: [wireDeposit(huge)],
        nextCursor: null,
      }),
    );

    const page = await getDeposits(3);
    expect(page.deposits[0].valueSats).toBe(BigInt(huge));
  });

  it("should reject non-integer valueSats with ApiError 'bad_amount'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        slot: 3,
        chainId: "bitassets",
        provisioned: true,
        deposits: [wireDeposit("1.5")],
        nextCursor: null,
      }),
    );

    const err = await getDeposits(3).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("bad_amount");
  });
});

// ---------------------------------------------------------------------------
// getWalletBalance
// ---------------------------------------------------------------------------

describe("getWalletBalance", () => {
  beforeEach(() => {
    resetApiState();
  });

  afterEach(() => {
    resetApiState();
    vi.restoreAllMocks();
  });

  function wireBalance(totalSats: string) {
    return {
      slot: 0,
      chainId: "thunder",
      address: "tb1qexample",
      provisioned: true,
      totalSats,
      depositCount: 2,
      truncated: false,
      note: "derived inflow",
    };
  }

  it("should request the balance path with the address query", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(wireBalance("0")));

    await getWalletBalance(0, "tb1qexample");

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain(`${DEFAULT_BASE_URL}/wallet/0/balance`);
    expect(calledUrl).toContain("address=tb1qexample");
  });

  it("should coerce totalSats to bigint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(wireBalance("150000000")),
    );

    const balance = await getWalletBalance(0, "tb1qexample");
    expect(balance.totalSats).toBe(150000000n);
    expect(typeof balance.totalSats).toBe("bigint");
  });

  it("should preserve the remaining balance fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(wireBalance("42")),
    );

    const balance = await getWalletBalance(0, "tb1qexample");
    expect(balance).toMatchObject({
      slot: 0,
      chainId: "thunder",
      address: "tb1qexample",
      provisioned: true,
      depositCount: 2,
      truncated: false,
      note: "derived inflow",
    });
  });

  it("should reject a non-integer totalSats with ApiError 'bad_amount'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(wireBalance("not-a-number")),
    );

    const err = await getWalletBalance(0, "tb1qexample").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("bad_amount");
  });
});
