// packages/api/src/tests/worker.test.ts

import { describe, it, expect, vi } from "vitest";

import worker, { type Env } from "../worker";

async function readJson<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

const ENV: Env = { SUPAQT_BASE_URL: "https://supaqt.test/v1" };

function upstream(
  routes: Record<string, { status: number; body: unknown }>,
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const u = new URL(typeof input === "string" ? input : input.toString());
    const key = u.pathname + (u.search ? `?${u.searchParams}` : "");
    // try exact, then pathname-only
    const hit = routes[key] ?? routes[u.pathname];
    if (!hit) return new Response("", { status: 404 });
    return new Response(
      hit.body === undefined ? "" : JSON.stringify(hit.body),
      { status: hit.status, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

function req(path: string): Request {
  return new Request(`https://sidecoin.app${path}`, { method: "GET" });
}

// Inject upstream fetch via globalThis (worker's UpstreamClient uses global
// fetch by default).
function withFetch(f: typeof fetch, fn: () => Promise<void>) {
  const orig = globalThis.fetch;
  globalThis.fetch = f;
  return fn().finally(() => {
    globalThis.fetch = orig;
  });
}

const ROW = {
  l1_txid: "ab12",
  vout: 0,
  ctip_seq: null,
  address: "ecash:qxyz",
  value_sats: "100000000",
  status: "l2_credited",
  l1_confirmations: 0,
  first_seen_ts: 1717000000,
  l1_confirmed_ts: null,
  l2_credited_ts: 1717000001,
};

describe("health & sidechains", () => {
  it("health responds ok", async () => {
    const res = await worker.fetch(req("/v1/health"), ENV);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("sidecoin-api");
  });

  it("sidechains lists active drivechains with real slots", async () => {
    const res = await worker.fetch(req("/v1/sidechains"), ENV);
    const body = await readJson(res);
    const slots = body.sidechains.map((s: { slot: number }) => s.slot).sort(
      (a: number, b: number) => a - b,
    );
    expect(slots).toEqual([2, 4, 9, 13, 98, 99, 255]);
  });
});

describe("slot resolution", () => {
  it("rejects a non-numeric slot", async () => {
    const res = await worker.fetch(req("/v1/wallet/abc/deposits"), ENV);
    expect(res.status).toBe(400);
    expect((await readJson(res)).error.code).toBe("bad_slot");
  });

  it("404s an unknown slot", async () => {
    const res = await worker.fetch(req("/v1/wallet/7/deposits"), ENV);
    expect(res.status).toBe(404);
    expect((await readJson(res)).error.code).toBe("unknown_slot");
  });

  it("404s a proposed (inactive) slot — riscy at slot 3", async () => {
    const res = await worker.fetch(req("/v1/wallet/3/deposits"), ENV);
    expect(res.status).toBe(404);
    expect((await readJson(res)).error.code).toBe("sidechain_inactive");
  });

  it("404s signet (filtered: absent from our registry)", async () => {
    // signet has no slot in our registry; any numeric slot maps via registry
    // only. There is no slot for signet, so it can never be addressed.
    const res = await worker.fetch(req("/v1/wallet/0/deposits"), ENV);
    expect(res.status).toBe(404);
    expect((await readJson(res)).error.code).toBe("unknown_slot");
  });
});

describe("deposits list", () => {
  it("maps slot 9 to thunder and normalizes rows", async () => {
    const f = upstream({
      "/v1/chains/thunder/deposits?limit=200": {
        status: 200,
        body: { chainId: "thunder", deposits: [ROW], next_cursor: null },
      },
      "/v1/chains/thunder/deposits": {
        status: 200,
        body: { chainId: "thunder", deposits: [ROW], next_cursor: null },
      },
    });
    await withFetch(f, async () => {
      const res = await worker.fetch(req("/v1/wallet/9/deposits"), ENV);
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.chainId).toBe("thunder");
      expect(body.provisioned).toBe(true);
      const d = body.deposits[0];
      expect(d.l1Txid).toBe("ab12");
      expect(d.valueSats).toBe("100000000");
      // l1_confirmations 0 -> confirmations null ("unknown")
      expect(d.confirmations).toBeNull();
    });
  });

  it("treats 'no such table' (400) as provisioned:false", async () => {
    const f = upstream({
      "/v1/chains/bitnames/deposits": {
        status: 400,
        body: { error: "no such table: deposits" },
      },
    });
    await withFetch(f, async () => {
      const res = await worker.fetch(req("/v1/wallet/2/deposits"), ENV);
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.provisioned).toBe(false);
      expect(body.deposits).toEqual([]);
    });
  });
});

describe("single deposit", () => {
  it("returns a normalized deposit", async () => {
    const f = upstream({
      "/v1/chains/thunder/deposits/ab12/0": { status: 200, body: ROW },
    });
    await withFetch(f, async () => {
      const res = await worker.fetch(
        req("/v1/wallet/9/deposits/ab12/0"),
        ENV,
      );
      expect(res.status).toBe(200);
      expect((await readJson(res)).l1Txid).toBe("ab12");
    });
  });

  it("maps a platform 500 (unhandled single route) to 404", async () => {
    const f = upstream({
      "/v1/chains/bitnames/deposits/ab12/0": {
        status: 500,
        body: undefined, // non-JSON platform 500
      },
    });
    await withFetch(f, async () => {
      const res = await worker.fetch(
        req("/v1/wallet/2/deposits/ab12/0"),
        ENV,
      );
      expect(res.status).toBe(404);
      expect((await readJson(res)).error.code).toBe("deposit_not_found");
    });
  });

  it("rejects a bad vout", async () => {
    const res = await worker.fetch(
      req("/v1/wallet/9/deposits/ab12/xx"),
      ENV,
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).error.code).toBe("bad_vout");
  });
});

describe("derived balance", () => {
  it("sums value_sats across pages as BigInt", async () => {
    const big = "9007199254740993"; // 2^53 + 1
    let call = 0;
    const f = vi.fn(async (input: RequestInfo | URL) => {
      const u = new URL(input.toString());
      // The slot balance route now PREFERS the indexed balance endpoint
      // (/chains/:chainId/address/:address/balance) and only falls back to
      // deriving from deposit inflow when that index isn't provisioned.
      // Signal "no such table" (-> not_provisioned) so this test exercises
      // the derived summation path. This call is NOT one of the deposit
      // pages, so it must not advance the page counter.
      if (u.pathname.includes("/address/") && u.pathname.endsWith("/balance")) {
        return new Response(
          JSON.stringify({ error: "no such table: balances" }),
          { status: 500 },
        );
      }
      call++;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            chainId: "thunder",
            deposits: [{ ...ROW, value_sats: big }],
            next_cursor: "ab12:0",
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          chainId: "thunder",
          deposits: [{ ...ROW, value_sats: "1" }],
          next_cursor: null,
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await withFetch(f, async () => {
      const res = await worker.fetch(
        req("/v1/wallet/9/balance?address=ecash:qxyz"),
        ENV,
      );
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.totalSats).toBe((BigInt(big) + 1n).toString());
      expect(body.depositCount).toBe(2);
    });
  });

  it("requires an address", async () => {
    const res = await worker.fetch(req("/v1/wallet/9/balance"), ENV);
    expect(res.status).toBe(400);
    expect((await readJson(res)).error.code).toBe("missing_address");
  });
});
