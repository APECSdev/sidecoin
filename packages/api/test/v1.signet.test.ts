// packages/api/test/v1.signet.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { handleV1 } from "../src/routes/v1.js";

const env = { SUPAQT_BASE_URL: "https://supaqt.test/v1" };
const ADDR = "tb1quwvyn529kjsvy5l5hztmletyea4dtue4acdc0j";

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init),
    ),
  );
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body == null ? "" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /v1/chains/:chainId/address/:address/balance", () => {
  it("returns the indexed signet balance (1.337 BTC = 133700000 sats)", async () => {
    stubFetch((url) => {
      expect(url).toBe(
        `https://supaqt.test/v1/chains/signet/address/${ADDR}/balance`,
      );
      return jsonResponse(200, {
        chainId: "signet",
        address: ADDR,
        balance: "133700000",
        updated_at_height: 210123,
      });
    });
    const res = await handleV1(
      new Request(`https://sidecoin.app/v1/chains/signet/address/${ADDR}/balance`),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.source).toBe("indexed");
    expect(body.totalSats).toBe("133700000");
    expect(body.seen).toBe(true);
    expect(body.updatedAtHeight).toBe(210123);
  });

  it("reports seen=false / null height for a never-seen address", async () => {
    stubFetch(() =>
      jsonResponse(200, {
        chainId: "signet",
        address: ADDR,
        balance: "0",
        updated_at_height: -1,
      }),
    );
    const res = await handleV1(
      new Request(`https://sidecoin.app/v1/chains/signet/address/${ADDR}/balance`),
      env,
    );
    const body = (await res.json()) as any;
    expect(body.seen).toBe(false);
    expect(body.updatedAtHeight).toBeNull();
    expect(body.totalSats).toBe("0");
  });

  it("404s an unknown chain", async () => {
    stubFetch(() => jsonResponse(404, { error: "unknown" }));
    const res = await handleV1(
      new Request(`https://sidecoin.app/v1/chains/nope/address/${ADDR}/balance`),
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /v1/chains/:chainId/broadcast", () => {
  it("relays a signed tx and returns the receipt", async () => {
    stubFetch((url, init) => {
      expect(url).toBe("https://supaqt.test/v1/chains/signet/broadcast");
      expect(JSON.parse(String(init?.body))).toEqual({ tx_hex: "deadbeef" });
      return jsonResponse(200, {
        chainId: "signet",
        txid: "abcd",
        accepted: true,
        broadcast_at: 1718000000,
      });
    });
    const req = new Request("https://sidecoin.app/v1/chains/signet/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHex: "deadbeef" }),
    });
    const res = await handleV1(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toEqual({
      chainId: "signet",
      txid: "abcd",
      accepted: true,
      broadcastAt: 1718000000,
    });
  });

  it("rejects malformed txHex locally (400) without calling upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const req = new Request("https://sidecoin.app/v1/chains/signet/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHex: "xyz" }),
    });
    const res = await handleV1(req, env);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a 422 node rejection verbatim", async () => {
    stubFetch(() =>
      jsonResponse(422, { error: "rejected", reason: "min relay fee not met" }),
    );
    const req = new Request("https://sidecoin.app/v1/chains/signet/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHex: "deadbeef" }),
    });
    const res = await handleV1(req, env);
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("rejected");
    expect(body.error.message).toBe("min relay fee not met");
  });

  it("maps an L2 chain to 501 broadcast_unsupported", async () => {
    stubFetch(() => jsonResponse(501, { error: "broadcast_unsupported" }));
    const req = new Request("https://sidecoin.app/v1/chains/thunder/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHex: "deadbeef" }),
    });
    const res = await handleV1(req, env);
    expect(res.status).toBe(501);
  });

  it("propagates Retry-After on 429", async () => {
    stubFetch(() =>
      jsonResponse(
        429,
        { error: "rate_limited", scope: "broadcast" },
        { "retry-after": "60" },
      ),
    );
    const req = new Request("https://sidecoin.app/v1/chains/signet/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHex: "deadbeef" }),
    });
    const res = await handleV1(req, env);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    const body = (await res.json()) as any;
    expect(body.error.details.retryAfter).toBe(60);
  });
});
