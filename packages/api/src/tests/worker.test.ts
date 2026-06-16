// packages/api/src/tests/worker.test.ts

import { describe, it, expect, vi } from "vitest";

import worker, { type Env } from "../worker";

async function readJson<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

const ENV: Env = {
  SUPAQT_BASE_URL: "https://supaqt.test/v1",
  // Payment/founder routes are not exercised by these upstream-adapter tests;
  // a stub satisfies the widened Env without pulling in a D1 mock.
  DB: {} as unknown as D1Database,
};

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

describe("chain explorer endpoints", () => {
  it("lists L1 blocks through the signet upstream alias", async () => {
    const f = upstream({
      "/v1/chains/signet/blocks?limit=2": {
        status: 200,
        body: {
          chain_id: "signet",
          tip_height: 101,
          blocks: [
            {
              height: 101,
              hash: "a".repeat(64),
              previous_hash: "b".repeat(64),
              timestamp: 1781619601,
              confirmations: 1,
              transaction_count: 2,
              size: 1234,
              weight: 4567,
            },
          ],
          next_cursor: "101",
        },
      },
    });

    await withFetch(f, async () => {
      const res = await worker.fetch(req("/v1/chains/l1/blocks?limit=2"), ENV);
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.chainId).toBe("l1");
      expect(body.upstreamChainId).toBe("signet");
      expect(body.tipHeight).toBe(101);
      expect(body.nextCursor).toBe("101");
      expect(body.blocks[0]).toMatchObject({
        chainId: "l1",
        upstreamChainId: "signet",
        height: 101,
        hash: "a".repeat(64),
        previousHash: "b".repeat(64),
        transactionCount: 2,
        size: 1234,
        weight: 4567,
      });
    });
  });

  it("returns a normalized BitNames transaction detail", async () => {
    const txid = "95488f2ed8a822404091bb1d71da8512745a9ee86e3497c3e6f1527ec1782716";
    const f = upstream({
      [`/v1/chains/bitnames/transactions/${txid}`]: {
        status: 200,
        body: {
          chain_id: "bitnames",
          txid,
          status: "confirmed",
          coinbase: false,
          block_height: 284,
          block_hash: "4ad956acc5ebf314a124a4b7b6826bb86987e4375098cc3e6286aad84f4ea51f",
          confirmations: 31,
          timestamp: 1781373601,
          size: null,
          vsize: null,
          weight: null,
          version: null,
          locktime: null,
          total_output_sats: "90000000",
          fee_sats: null,
          fee_rate: null,
          inputs: [
            {
              previous_txid: "de12441ff4e1d7b6e5feb588353319eb929b842f1c9bebb6fba53acd6deed195",
              vout: 0,
              address: null,
              value_sats: null,
            },
          ],
          outputs: [
            {
              vout: 0,
              address: "3HK1xdAp97bvC5jxLzkuRYivN6fe",
              value_sats: "90000000",
              script_pubkey: null,
              spent: false,
            },
          ],
        },
      },
    });

    await withFetch(f, async () => {
      const res = await worker.fetch(
        req(`/v1/chains/bitnames/transactions/${txid}`),
        ENV,
      );
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.chainId).toBe("bitnames");
      expect(body.upstreamChainId).toBe("bitnames");
      expect(body.transaction).toMatchObject({
        chainId: "bitnames",
        upstreamChainId: "bitnames",
        txid,
        status: "confirmed",
        blockHeight: 284,
        totalOutputSats: "90000000",
      });
      expect(body.transaction.inputs[0]).toMatchObject({
        previousTxid: "de12441ff4e1d7b6e5feb588353319eb929b842f1c9bebb6fba53acd6deed195",
        vout: 0,
        valueSats: null,
      });
      expect(body.transaction.outputs[0]).toMatchObject({
        vout: 0,
        address: "3HK1xdAp97bvC5jxLzkuRYivN6fe",
        valueSats: "90000000",
        spent: false,
      });
    });
  });

  it("preserves existing chain address balance route ownership", async () => {
    const f = upstream({
      "/v1/chains/signet/address/tb1qabc/balance": {
        status: 200,
        body: {
          chainId: "signet",
          address: "tb1qabc",
          balance: "0",
          updated_at_height: -1,
        },
      },
    });

    await withFetch(f, async () => {
      const res = await worker.fetch(
        req("/v1/chains/signet/address/tb1qabc/balance"),
        ENV,
      );
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.source).toBe("indexed");
      expect(body.totalSats).toBe("0");
    });
  });
});

describe("chain explorer numeric metadata", () => {
  it("preserves numeric L1 transaction feeRate", async () => {
    const txid = "f5f1c645c942909161604d3046ffb39a88e1dd740c884161b87b28f23ef7c82a";
    const f = upstream({
      [`/v1/chains/signet/transactions/${txid}`]: {
        status: 200,
        body: {
          chain_id: "signet",
          txid,
          status: "confirmed",
          coinbase: false,
          block_height: 1061,
          block_hash: "00000001c45b142dcf3ff0c0b44560e1dd5c9a4cd083034677624ce7a8034059",
          confirmations: 10,
          timestamp: 1781622601,
          size: 222,
          vsize: 141,
          weight: 561,
          version: 2,
          locktime: 1060,
          total_output_sats: "710659222",
          fee_sats: "3018",
          fee_rate: 21.4,
          inputs: [],
          outputs: [],
        },
      },
    });

    await withFetch(f, async () => {
      const res = await worker.fetch(
        req(`/v1/chains/l1/transactions/${txid}`),
        ENV,
      );
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.transaction.feeRate).toBe(21.4);
    });
  });

  it("preserves numeric L1 block difficulty", async () => {
    const f = upstream({
      "/v1/chains/signet/blocks/1061": {
        status: 200,
        body: {
          chain_id: "signet",
          height: 1061,
          hash: "00000001c45b142dcf3ff0c0b44560e1dd5c9a4cd083034677624ce7a8034059",
          previous_hash: "0000029c24574913673f8d9f9c2ebd230ecc993e1120aeb2e2bfc7774ce8bec2",
          next_hash: "000003402583b574f357bffb5a78043a58ff4bdb5a3b937246cb05ac7e6073fa",
          timestamp: 1781622601,
          confirmations: 10,
          merkle_root: "6a4ca33e9ccd17090915b5d6ea8174adf84d0a9faf1d453215b34e76dc762fe5",
          transaction_count: 48,
          size: 12737,
          weight: 31940,
          version: 536870912,
          nonce: 2796412,
          bits: "1e0377ae",
          difficulty: 0.001126515290698186,
          transactions: [],
        },
      },
    });

    await withFetch(f, async () => {
      const res = await worker.fetch(req("/v1/chains/l1/blocks/1061"), ENV);
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.block.difficulty).toBe(0.001126515290698186);
    });
  });
});
