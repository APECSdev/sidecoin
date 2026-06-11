// packages/api-client/test/broadcast-balance.test.ts
import { describe, it, expect } from "vitest";
import { SidecoinClient, ApiError } from "../src/index.js";

type Handler = (url: string, init?: RequestInit) => Response;

function makeClient(handler: Handler): SidecoinClient {
  return new SidecoinClient({
    baseUrl: "https://sidecoin.test/v1",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init)) as typeof fetch,
  });
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const ADDR = "tb1quwvyn529kjsvy5l5hztmletyea4dtue4acdc0j";

describe("SidecoinClient.getChainBalance", () => {
  it("coerces totalSats to bigint", async () => {
    const c = makeClient((url) => {
      expect(url).toBe(
        `https://sidecoin.test/v1/chains/signet/address/${ADDR}/balance`,
      );
      return jsonResponse(200, {
        chainId: "signet",
        address: ADDR,
        source: "indexed",
        totalSats: "133700000",
        seen: true,
        updatedAtHeight: 210123,
        note: "x",
      });
    });
    const bal = await c.getChainBalance("signet", ADDR);
    expect(bal.totalSats).toBe(133700000n);
    expect(bal.seen).toBe(true);
    expect(bal.source).toBe("indexed");
  });

  it("rejects an unsafe totalSats", async () => {
    const c = makeClient(() =>
      jsonResponse(200, {
        chainId: "signet",
        address: ADDR,
        source: "indexed",
        totalSats: "1.5",
        seen: true,
        updatedAtHeight: 1,
        note: "x",
      }),
    );
    await expect(c.getChainBalance("signet", ADDR)).rejects.toMatchObject({
      code: "bad_amount",
    });
  });
});

describe("SidecoinClient.broadcast", () => {
  it("returns the receipt on success", async () => {
    const c = makeClient((url, init) => {
      expect(url).toBe("https://sidecoin.test/v1/chains/signet/broadcast");
      expect(JSON.parse(String(init?.body))).toEqual({ txHex: "deadbeef" });
      return jsonResponse(200, {
        chainId: "signet",
        txid: "abcd",
        accepted: true,
        broadcastAt: 1718000000,
      });
    });
    const r = await c.broadcast("signet", "deadbeef");
    expect(r.txid).toBe("abcd");
  });

  it("throws ApiError(rejected, 422) with the node reason", async () => {
    const c = makeClient(() =>
      jsonResponse(422, {
        error: { code: "rejected", message: "min relay fee not met" },
      }),
    );
    await expect(c.broadcast("signet", "deadbeef")).rejects.toMatchObject({
      code: "rejected",
      httpStatus: 422,
      message: "min relay fee not met",
    });
  });

  it("throws ApiError(rate_limited, 429) carrying retryAfter", async () => {
    const c = makeClient(() =>
      jsonResponse(
        429,
        {
          error: {
            code: "rate_limited",
            message: "slow down",
            details: { scope: "broadcast", retryAfter: 60 },
          },
        },
        { "retry-after": "60" },
      ),
    );
    try {
      await c.broadcast("signet", "deadbeef");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.code).toBe("rate_limited");
      expect((err.details as { retryAfter: number }).retryAfter).toBe(60);
    }
  });
});
