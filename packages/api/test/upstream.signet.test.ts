// packages/api/test/upstream.signet.test.ts
import { describe, it, expect } from "vitest";
import { UpstreamClient } from "../src/upstream.js";

type Handler = (url: string, init?: RequestInit) => Response;

function makeClient(handler: Handler, apiKey?: string): UpstreamClient {
  return new UpstreamClient({
    baseUrl: "https://supaqt.test/v1",
    apiKey,
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init)) as typeof fetch,
  });
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

const ADDR = "tb1quwvyn529kjsvy5l5hztmletyea4dtue4acdc0j";

describe("UpstreamClient.getBalance (signet/L1)", () => {
  it("returns ok with a seen balance", async () => {
    const c = makeClient((url) => {
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
    const out = await c.getBalance("signet", ADDR);
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") {
      expect(out.data.balance).toBe("133700000");
      expect(out.data.updated_at_height).toBe(210123);
    }
  });

  it("maps updated_at_height -1 (never seen) as ok", async () => {
    const c = makeClient(() =>
      jsonResponse(200, {
        chainId: "signet",
        address: ADDR,
        balance: "0",
        updated_at_height: -1,
      }),
    );
    const out = await c.getBalance("signet", ADDR);
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(out.data.updated_at_height).toBe(-1);
  });

  it("maps 404 to unknown_chain", async () => {
    const c = makeClient(() => jsonResponse(404, { error: "unknown" }));
    expect((await c.getBalance("nope", "a")).kind).toBe("unknown_chain");
  });

  it("maps 500 / no such table to not_provisioned", async () => {
    const c = makeClient(() =>
      jsonResponse(500, { error: "no such table: balances" }),
    );
    expect((await c.getBalance("signet", "a")).kind).toBe("not_provisioned");
  });
});

describe("UpstreamClient.broadcast", () => {
  it("posts tx_hex and returns ok", async () => {
    const c = makeClient((url, init) => {
      expect(url).toBe("https://supaqt.test/v1/chains/signet/broadcast");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ tx_hex: "deadbeef" });
      return jsonResponse(200, {
        chainId: "signet",
        txid: "abcd",
        accepted: true,
        broadcast_at: 1718000000,
      });
    });
    const out = await c.broadcast("signet", "deadbeef");
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(out.data.txid).toBe("abcd");
  });

  it("maps 400 to malformed with message", async () => {
    const c = makeClient(() =>
      jsonResponse(400, { error: "malformed_tx", message: "bad hex" }),
    );
    const out = await c.broadcast("signet", "zz");
    expect(out.kind).toBe("malformed");
    if (out.kind === "malformed") expect(out.message).toBe("bad hex");
  });

  it("maps 422 to rejected with the verbatim node reason", async () => {
    const c = makeClient(() =>
      jsonResponse(422, {
        error: "rejected",
        reason: "TX decode failed. Make sure the tx has at least one input.",
      }),
    );
    const out = await c.broadcast("signet", "deadbeef");
    expect(out.kind).toBe("rejected");
    if (out.kind === "rejected") {
      expect(out.message).toContain("at least one input");
    }
  });

  it("maps 429 to rate_limited honoring Retry-After", async () => {
    const c = makeClient(() =>
      jsonResponse(
        429,
        { error: "rate_limited", scope: "broadcast" },
        { "retry-after": "60" },
      ),
    );
    const out = await c.broadcast("signet", "deadbeef");
    expect(out.kind).toBe("rate_limited");
    if (out.kind === "rate_limited") expect(out.retryAfter).toBe(60);
  });

  it("maps 501 to unsupported (L2 today)", async () => {
    const c = makeClient(() =>
      jsonResponse(501, { error: "broadcast_unsupported" }),
    );
    expect((await c.broadcast("thunder", "deadbeef")).kind).toBe(
      "unsupported",
    );
  });

  it("maps 502 to relay_error", async () => {
    const c = makeClient(() => jsonResponse(502, { error: "relay down" }));
    expect((await c.broadcast("signet", "deadbeef")).kind).toBe(
      "relay_error",
    );
  });

  it("maps 503 to unavailable", async () => {
    const c = makeClient(() =>
      jsonResponse(503, { error: "broadcast_unavailable" }),
    );
    expect((await c.broadcast("signet", "deadbeef")).kind).toBe("unavailable");
  });

  it("maps 404 to unknown_chain", async () => {
    const c = makeClient(() =>
      jsonResponse(404, { chainId: "x", known: false }),
    );
    expect((await c.broadcast("x", "deadbeef")).kind).toBe("unknown_chain");
  });

  it("sends Authorization: Bearer when an apiKey is configured", async () => {
    let seen: Headers | undefined;
    const c = makeClient((_url, init) => {
      seen = new Headers(init?.headers as HeadersInit);
      return jsonResponse(200, {
        chainId: "signet",
        txid: "a",
        accepted: true,
        broadcast_at: 1,
      });
    }, "secret-key");
    await c.broadcast("signet", "deadbeef");
    expect(seen?.get("authorization")).toBe("Bearer secret-key");
  });
});
