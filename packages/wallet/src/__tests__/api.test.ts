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
  getCoinNewsFeeds,
  getCoinNewsPosts,
  getMarketPrice,
  getL1Balance,
  getL1Utxos,
  broadcastTransaction,
  getRawTransaction,
  SUPAQT_BASE_URL,
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


// ---------------------------------------------------------------------------
// SupaQt live data helpers
// ---------------------------------------------------------------------------

describe("SupaQt live data helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should load Coin News feeds from SupaQt", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        feeds: [
          {
            id: "us-weekly",
            name: "US Weekly",
            language: "en",
            enabled: true,
            post_count: 4,
          },
        ],
      }),
    );

    const feeds = await getCoinNewsFeeds();

    expect(fetchSpy).toHaveBeenCalledWith(
      `${SUPAQT_BASE_URL}/coin-news/feeds`,
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
    expect(feeds).toEqual([
      {
        id: "us-weekly",
        name: "US Weekly",
        language: "en",
        enabled: true,
        post_count: 4,
      },
    ]);
  });

  it("should load Coin News posts from SupaQt with query params", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        feed: { id: "us-weekly", name: "US Weekly" },
        posts: [
          {
            id: "post_live",
            title: "Live API wallet post",
            body: null,
            link: null,
            author: null,
            created_at: 1781568001,
            fee_sats: "1108",
            flag: 1,
            txid: "a".repeat(64),
            status: "confirmed",
          },
        ],
        next_cursor: null,
      }),
    );

    const page = await getCoinNewsPosts("us-weekly", {
      limit: 5,
      cursor: "abc",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `${SUPAQT_BASE_URL}/coin-news/feeds/us-weekly/posts?limit=5&cursor=abc`,
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
    expect(page.posts[0].title).toBe("Live API wallet post");
  });

  it("should load the ECX market price from eCash Farm", async () => {
    // The market price now sources from eCash Farm (/v1/markets), not SupaQt.
    // See the "eCash Farm market price" describe block for full coverage.
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonBody({
        ok: true,
        updatedAt: 1787516407,
        projected: { ecxUsd: 106.47 },
      }),
    );
    const price = await getMarketPrice("ecash");
    expect(price.source).toBe("eCash Farm");
    expect(price.price_usd).toBe("106.47");
  });

  it("should throw when eCash Farm returns an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonBody({ error: "service unavailable" }, 503),
    );

    await expect(getMarketPrice("ecash")).rejects.toThrow(/eCash Farm/);
  });
});

// ---------------------------------------------------------------------------
// Public Esplora fallback (L1 balance / UTXOs / broadcast / raw tx)
// ---------------------------------------------------------------------------
// The sidecoin.app/v1 adapter is offline, so L1 reads + broadcast route to
// the public Esplora endpoints (drivechain.dev/config). These tests pin the
// URL shape + the ChainBalance / UtxosResult / BroadcastReceipt coercion.

const ESPLORA_SIGNET = "https://esplora.signet.drivechain.info";
const ESPLORA_ALPHANET = "https://esplora.alpha.ecash.ninja";

function jsonBody(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

function textBody(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as Response;
}

describe("Esplora fallback — getL1Balance", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hits the signet Esplora /address/:addr endpoint by default", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonBody({
          address: "tb1qexample",
          chain_stats: { funded_txo_count: 1, funded_txo_sum: 5250000, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 1 },
          mempool_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 },
        }),
      )
      .mockResolvedValueOnce(textBody("10808")); // /blocks/tip/height

    const bal = await getL1Balance("tb1qexample");

    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${ESPLORA_SIGNET}/address/tb1qexample`,
    );
    expect(bal.chainId).toBe("signet");
    expect(bal.source).toBe("indexed");
    expect(bal.totalSats).toBe(5250000n);
    expect(bal.seen).toBe(true);
    expect(bal.updatedAtHeight).toBe(10808);
  });

  it("hits the alphanet Esplora endpoint when network=alphanet", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonBody({
          address: "bc1qexample",
          chain_stats: { funded_txo_count: 2, funded_txo_sum: 10000000, spent_txo_count: 1, spent_txo_sum: 4000000, tx_count: 2 },
          mempool_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 },
        }),
      )
      .mockResolvedValueOnce(textBody("987875"));

    const bal = await getL1Balance("bc1qexample", "alphanet");

    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${ESPLORA_ALPHANET}/address/bc1qexample`,
    );
    expect(bal.chainId).toBe("alphanet");
    expect(bal.totalSats).toBe(6000000n); // 10_000_000 - 4_000_000
    expect(bal.seen).toBe(true);
  });

  it("reports seen=false and totalSats 0n for an address with no history", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonBody({
        address: "tb1qnew",
        chain_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 },
        mempool_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 },
      }),
    );

    const bal = await getL1Balance("tb1qnew");
    expect(bal.totalSats).toBe(0n);
    expect(bal.seen).toBe(false);
    expect(bal.updatedAtHeight).toBeNull();
  });

  it("throws on a non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonBody({ error: "bad" }, 500),
    );
    await expect(getL1Balance("tb1qexample")).rejects.toThrow(/Esplora balance/);
  });
});

describe("Esplora fallback — getL1Utxos", () => {
  afterEach(() => vi.restoreAllMocks());

  it("maps the /utxo response to UtxosResult with a derived scriptPubKey", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonBody([
        {
          txid: "a".repeat(64),
          vout: 0,
          value: 5250000,
          status: { confirmed: true, block_height: 10800, block_time: 1700000000 },
        },
        {
          txid: "b".repeat(64),
          vout: 1,
          value: 100000,
          status: { confirmed: false },
        },
      ]),
    );

    // Use a real signet P2WPKH address so scriptPubKeyFromAddress works.
    const addr = "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl";
    const res = await getL1Utxos(addr, {}, "signet");

    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${ESPLORA_SIGNET}/address/${addr}/utxo`,
    );
    expect(res.chainId).toBe("signet");
    expect(res.address).toBe(addr);
    expect(res.truncated).toBe(false);
    expect(res.utxos).toHaveLength(2);
    expect(res.utxos[0].valueSats).toBe(5250000n);
    expect(res.utxos[0].txid).toBe("a".repeat(64));
    expect(res.utxos[0].vout).toBe(0);
    expect(res.utxos[0].scriptPubKey).toMatch(/^0014[0-9a-f]{40}$/);
    expect(res.utxos[0].blockHeight).toBe(10800);
    expect(res.utxos[1].blockHeight).toBe(-1); // unconfirmed
  });

  it("applies the minConfirmations floor (drops mempool UTXOs)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonBody([
        { txid: "a".repeat(64), vout: 0, value: 1000, status: { confirmed: true, block_height: 1 } },
        { txid: "b".repeat(64), vout: 1, value: 2000, status: { confirmed: false } },
      ]),
    );
    const res = await getL1Utxos("tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl", {
      minConfirmations: 1,
    });
    expect(res.utxos).toHaveLength(1);
    expect(res.utxos[0].txid).toBe("a".repeat(64));
  });

  it("hits the alphanet Esplora endpoint when network=alphanet", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonBody([]),
    );
    await getL1Utxos("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu", {}, "alphanet");
    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${ESPLORA_ALPHANET}/address/bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu/utxo`,
    );
  });
});

describe("Esplora fallback — broadcastTransaction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("POSTs raw hex to /tx and returns the txid receipt", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      textBody("abcdef0123456789".repeat(4)), // 64 hex chars
    );
    const receipt = await broadcastTransaction("signet", "deadbeef", "signet");
    expect(fetchSpy.mock.calls[0][0]).toBe(`${ESPLORA_SIGNET}/tx`);
    expect(receipt.txid).toBe("abcdef0123456789".repeat(4));
    expect(receipt.accepted).toBe(true);
    expect(receipt.chainId).toBe("signet");
    expect(typeof receipt.broadcastAt).toBe("number");
  });

  it("POSTs to the alphanet endpoint when network=alphanet", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      textBody("0".repeat(64)),
    );
    await broadcastTransaction("signet", "deadbeef", "alphanet");
    expect(fetchSpy.mock.calls[0][0]).toBe(`${ESPLORA_ALPHANET}/tx`);
  });

  it("throws when the endpoint returns an RPC error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      textBody(`sendrawtransaction RPC error: {"code":-22,"message":"TX decode failed."}`, 400),
    );
    await expect(broadcastTransaction("signet", "bad", "signet")).rejects.toThrow(
      /Esplora broadcast/,
    );
  });
});

describe("Esplora fallback — getRawTransaction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fetches raw hex from the signet Esplora /tx/:txid/hex endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      textBody("deadbeef"),
    );
    const hex = await getRawTransaction("a".repeat(64), "signet");
    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${ESPLORA_SIGNET}/tx/${"a".repeat(64)}/hex`,
    );
    expect(hex).toBe("deadbeef");
  });

  it("fetches from the alphanet endpoint when network=alphanet", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      textBody("deadbeef"),
    );
    await getRawTransaction("b".repeat(64), "alphanet");
    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${ESPLORA_ALPHANET}/tx/${"b".repeat(64)}/hex`,
    );
  });

  it("throws on a non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(textBody("not found", 404));
    await expect(getRawTransaction("a".repeat(64), "signet")).rejects.toThrow(
      /Failed to fetch raw tx/,
    );
  });
});

// ---------------------------------------------------------------------------
// eCash Farm market price (ECX/USD projection)
// ---------------------------------------------------------------------------

const ECASHFARM_MARKETS = "https://ecashfarm.com/v1/markets";

describe("getMarketPrice — eCash Farm /v1/markets", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sources the ECX/USD projection from eCash Farm", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonBody({
        ok: true,
        updatedAt: 1787516407,
        projected: { ecxUsd: 106.47006023873226 },
      }),
    );

    const price = await getMarketPrice("ecash");

    expect(fetchSpy.mock.calls[0][0]).toBe(ECASHFARM_MARKETS);
    expect(price.asset).toBe("ecash");
    expect(price.name).toBe("eCash");
    expect(price.price_usd).toBe("106.47");
    expect(price.source).toBe("eCash Farm");
    // updatedAt epoch seconds → ISO string.
    expect(price.as_of).toBe(new Date(1787516407 * 1000).toISOString());
  });

  it("coerces a non-ECX asset alias to \"ecash\"", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonBody({
        ok: true,
        updatedAt: 1787516407,
        projected: { ecxUsd: 30 },
      }),
    );

    const price = await getMarketPrice("ECX");
    expect(price.asset).toBe("ecash");
    expect(price.price_usd).toBe("30.00");
  });

  it("rounds the price to 2 decimal places", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonBody({
        ok: true,
        updatedAt: 1787516407,
        projected: { ecxUsd: 106.47006023873226 },
      }),
    );
    const price = await getMarketPrice("ecash");
    expect(price.price_usd).toBe("106.47");
  });

  it("throws when the upstream returns a non-OK status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonBody({ error: "down" }, 503),
    );
    await expect(getMarketPrice("ecash")).rejects.toThrow(/eCash Farm/);
  });

  it("throws when projected.ecxUsd is missing or non-numeric", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonBody({ ok: true, updatedAt: 1, projected: {} }),
    );
    await expect(getMarketPrice("ecash")).rejects.toThrow(/projected.ecxUsd/);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonBody({ ok: true, updatedAt: 1, projected: { ecxUsd: NaN } }),
    );
    await expect(getMarketPrice("ecash")).rejects.toThrow(/projected.ecxUsd/);
  });
});
