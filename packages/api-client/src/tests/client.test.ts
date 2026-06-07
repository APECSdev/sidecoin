// packages/api-client/src/__tests__/client.test.ts

import { describe, it, expect, vi } from "vitest";

import {
  SidecoinClient,
  ApiError,
  createPoller,
  newIdempotencyKey,
  EXPECTED_NETWORK,
  isExpectedNetwork,
  DEFAULT_BASE_URL,
} from "../index";

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

const WIRE_DEPOSIT = {
  slot: 9,
  chainId: "thunder",
  l1Txid: "ab12",
  vout: 0,
  ctipSeq: null,
  address: "ecash:qxyz",
  valueSats: "100000000",
  status: "l2_credited",
  confirmations: null,
  firstSeenTs: 1717000000,
  l1ConfirmedTs: null,
  l2CreditedTs: 1717000001,
};

describe("network guard", () => {
  it("recognizes the expected network", () => {
    expect(isExpectedNetwork(EXPECTED_NETWORK)).toBe(true);
    expect(isExpectedNetwork("mainnet")).toBe(false);
  });
});

describe("getDeposits", () => {
  it("coerces valueSats to bigint", async () => {
    const f = mockFetch(200, {
      slot: 9,
      chainId: "thunder",
      provisioned: true,
      deposits: [WIRE_DEPOSIT],
      nextCursor: null,
    });
    const c = new SidecoinClient({ fetchImpl: f });
    const page = await c.getDeposits(9);
    expect(page.deposits[0].valueSats).toBe(100000000n);
    expect(typeof page.deposits[0].valueSats).toBe("bigint");
  });

  it("handles BigInt values beyond 2^53 without precision loss", async () => {
    const big = "9007199254740993"; // 2^53 + 1
    const f = mockFetch(200, {
      slot: 9,
      chainId: "thunder",
      provisioned: true,
      deposits: [{ ...WIRE_DEPOSIT, valueSats: big }],
      nextCursor: null,
    });
    const c = new SidecoinClient({ fetchImpl: f });
    const page = await c.getDeposits(9);
    expect(page.deposits[0].valueSats).toBe(BigInt(big));
  });

  it("rejects a non-integer valueSats", async () => {
    const f = mockFetch(200, {
      slot: 9,
      chainId: "thunder",
      provisioned: true,
      deposits: [{ ...WIRE_DEPOSIT, valueSats: "1.5" }],
      nextCursor: null,
    });
    const c = new SidecoinClient({ fetchImpl: f });
    await expect(c.getDeposits(9)).rejects.toBeInstanceOf(ApiError);
  });

  it("surfaces provisioned:false for unprovisioned chains", async () => {
    const f = mockFetch(200, {
      slot: 2,
      chainId: "bitnames",
      provisioned: false,
      deposits: [],
      nextCursor: null,
    });
    const c = new SidecoinClient({ fetchImpl: f });
    const page = await c.getDeposits(2);
    expect(page.provisioned).toBe(false);
    expect(page.deposits).toHaveLength(0);
  });
});

describe("getDeposit", () => {
  it("maps an adapter error envelope to ApiError", async () => {
    const f = mockFetch(404, {
      error: { code: "deposit_not_found", message: "no deposit ab12:0" },
    });
    const c = new SidecoinClient({ fetchImpl: f });
    await expect(c.getDeposit(9, "ab12", 0)).rejects.toMatchObject({
      code: "deposit_not_found",
      httpStatus: 404,
    });
  });
});

describe("getWalletBalance", () => {
  it("coerces totalSats to bigint", async () => {
    const f = mockFetch(200, {
      slot: 9,
      chainId: "thunder",
      address: "ecash:qxyz",
      provisioned: true,
      totalSats: "250000000",
      depositCount: 3,
      truncated: false,
      note: "derived",
    });
    const c = new SidecoinClient({ fetchImpl: f });
    const bal = await c.getWalletBalance(9, "ecash:qxyz");
    expect(bal.totalSats).toBe(250000000n);
  });
});

describe("transport failures", () => {
  it("wraps a thrown fetch in ApiError network_error", async () => {
    const f = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const c = new SidecoinClient({ fetchImpl: f });
    await expect(c.getSidechains()).rejects.toMatchObject({
      code: "network_error",
      httpStatus: 0,
    });
  });

  it("defaults to the sidecoin.app base url", () => {
    const c = new SidecoinClient();
    // not network-exposed; just assert the constant the client ships with
    expect(DEFAULT_BASE_URL).toBe("https://sidecoin.app/v1");
    expect(c).toBeInstanceOf(SidecoinClient);
  });
});

describe("createPoller", () => {
  it("resolves when done is satisfied, no sleep on success", async () => {
    let n = 0;
    const sleep = vi.fn(async () => {});
    const run = createPoller<number>({
      fetch: async () => ++n,
      done: (v) => v >= 3,
      sleepImpl: sleep,
      randomImpl: () => 0.5,
    });
    await expect(run()).resolves.toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2); // delays between 3 attempts
  });

  it("backoff grows exponentially with jitter bounds", async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    const run = createPoller<number>({
      fetch: async () => 0,
      done: () => false,
      maxAttempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 10000,
      jitter: 0.5,
      sleepImpl: sleep,
      randomImpl: () => 1, // upper bound of jitter
    });
    await expect(run()).rejects.toMatchObject({ code: "poll_timeout" });
    // randomImpl=1 -> delay == raw == base * 2^attempt
    expect(delays).toEqual([100, 200, 400]);
  });

  it("rejects with poll_timeout after maxAttempts", async () => {
    const run = createPoller<number>({
      fetch: async () => 0,
      done: () => false,
      maxAttempts: 2,
      sleepImpl: async () => {},
    });
    await expect(run()).rejects.toBeInstanceOf(ApiError);
  });
});
