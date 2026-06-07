// packages/api/src/worker.ts
//
// Sidecoin adapter Worker. Exposes a STABLE, slot-addressed, camelCase
// surface to the wallet client and translates to SupaQt's chainId-addressed,
// snake_case, bare-string-error read API.
//
// Public routes (all GET; /v1 prefix optional):
//   /v1/health
//   /v1/sidechains
//   /v1/wallet/:slot/deposits           ?address &status &limit &cursor
//   /v1/wallet/:slot/deposits/:l1Txid/:vout
//   /v1/wallet/:slot/balance            ?address   (DERIVED — see note)
//
// Error envelope (normalized): { error: { code, message, details? } }

import {
  getSidechainBySlot,
  getActiveSidechains,
} from "@sidecoin/shared/sidechains";

import {
  UpstreamClient,
  type UpstreamDepositRecord,
} from "./upstream.js";

export interface Env {
  SUPAQT_BASE_URL?: string;
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
};

// Upstream caps list at 200/page; we page balance with the max page size.
const MAX_PAGE = 200;
const MAX_BALANCE_PAGES = 100; // safety bound for the derived sum

function json(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...extra },
  });
}

function err(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): Response {
  return json(
    { error: { code, message, ...(details != null ? { details } : {}) } },
    status,
  );
}

/** Normalize an upstream snake_case row to our stable camelCase shape. */
function normalizeDeposit(
  slot: number,
  chainId: string,
  r: UpstreamDepositRecord,
) {
  return {
    slot,
    chainId,
    l1Txid: r.l1_txid,
    vout: r.vout,
    ctipSeq: r.ctip_seq,
    address: r.address,
    valueSats: r.value_sats, // keep bigint as decimal string over the wire
    status: r.status,
    // l1_confirmations is hardcoded 0 upstream -> "unknown", not zero.
    confirmations: r.l1_confirmations === 0 ? null : r.l1_confirmations,
    firstSeenTs: r.first_seen_ts,
    l1ConfirmedTs: r.l1_confirmed_ts,
    l2CreditedTs: r.l2_credited_ts,
  };
}

function toSats(s: string): bigint {
  if (!/^\d+$/.test(s)) throw new Error(`invalid value_sats: ${s}`);
  return BigInt(s);
}

/**
 * Resolve a slot path segment to an ACTIVE sidechain descriptor.
 * Returns a Response on any failure (bad slot, unknown, or non-active such
 * as proposed riscy). signet is absent from our registry, so it resolves to
 * "unknown slot" here — exactly the filtering we want.
 */
function resolveSlot(raw: string):
  | { ok: true; slot: number; chainId: string }
  | { ok: false; res: Response } {
  if (!/^\d+$/.test(raw)) {
    return { ok: false, res: err("bad_slot", `invalid slot "${raw}"`, 400) };
  }
  const slot = Number(raw);
  const sc = getSidechainBySlot(slot);
  if (!sc) {
    return {
      ok: false,
      res: err("unknown_slot", `no sidechain at slot ${slot}`, 404),
    };
  }
  if (sc.status !== "active") {
    return {
      ok: false,
      res: err(
        "sidechain_inactive",
        `sidechain at slot ${slot} (${sc.id}) is ${sc.status}, not active`,
        404,
      ),
    };
  }
  return { ok: true, slot, chainId: sc.id };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (req.method !== "GET") {
      return err("method_not_allowed", "GET only", 405);
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/v1(?=\/|$)/, "");
    const parts = path.split("/").filter(Boolean);
    const client = new UpstreamClient({ baseUrl: env.SUPAQT_BASE_URL });

    // GET /health
    if (parts.length === 0 || (parts.length === 1 && parts[0] === "health")) {
      return json({
        status: "ok",
        service: "sidecoin-api",
        time: new Date().toISOString(),
      });
    }

    // GET /sidechains — from OUR registry (active drivechains only).
    if (parts.length === 1 && parts[0] === "sidechains") {
      const chains = getActiveSidechains().map((sc) => ({
        slot: sc.slot,
        id: sc.id,
        displayName: sc.displayName,
        description: sc.description,
        status: sc.status,
      }));
      return json({ sidechains: chains });
    }

    // /wallet/:slot/...
    if (parts[0] === "wallet" && parts.length >= 3) {
      const resolved = resolveSlot(parts[1]);
      if (!resolved.ok) return resolved.res;
      const { slot, chainId } = resolved;

      // GET /wallet/:slot/deposits
      if (parts.length === 3 && parts[2] === "deposits") {
        const q = url.searchParams;
        const limitRaw = q.get("limit");
        let limit: number | undefined;
        if (limitRaw != null) {
          const n = Number(limitRaw);
          if (!Number.isInteger(n) || n < 1) {
            return err("bad_limit", `invalid limit "${limitRaw}"`, 400);
          }
          limit = Math.min(n, MAX_PAGE);
        }

        const out = await client.listDeposits(chainId, {
          address: q.get("address") ?? undefined,
          status: q.get("status") ?? undefined,
          limit,
          cursor: q.get("cursor") ?? undefined,
        });

        if (out.kind === "not_provisioned") {
          // Chain known but its deposits table isn't live yet (the 6
          // unproven DBs). Surface as an empty, well-formed page.
          return json({
            slot,
            chainId,
            provisioned: false,
            deposits: [],
            nextCursor: null,
          });
        }
        if (out.kind === "unknown_chain") {
          return err(
            "unknown_chain",
            `upstream has no chain "${chainId}"`,
            404,
          );
        }
        if (out.kind === "error") {
          return err("upstream_error", out.message, 502);
        }

        return json({
          slot,
          chainId,
          provisioned: true,
          deposits: out.data.deposits.map((d) =>
            normalizeDeposit(slot, chainId, d),
          ),
          nextCursor: out.data.next_cursor,
        });
      }

      // GET /wallet/:slot/deposits/:l1Txid/:vout
      if (
        parts.length === 5 &&
        parts[2] === "deposits"
      ) {
        const l1Txid = parts[3];
        const voutRaw = parts[4];
        if (!/^[0-9a-fA-F]+$/.test(l1Txid)) {
          return err("bad_txid", `invalid l1Txid "${l1Txid}"`, 400);
        }
        if (!/^\d+$/.test(voutRaw)) {
          return err("bad_vout", `invalid vout "${voutRaw}"`, 400);
        }
        const vout = Number(voutRaw);

        const out = await client.getDeposit(chainId, l1Txid, vout);
        if (out.kind === "ok") {
          return json(normalizeDeposit(slot, chainId, out.data));
        }
        // not_found AND not_provisioned both mean "no such deposit here".
        if (out.kind === "not_found" || out.kind === "not_provisioned") {
          return err(
            "deposit_not_found",
            `no deposit ${l1Txid}:${vout} on ${chainId}`,
            404,
          );
        }
        if (out.kind === "error") return err("upstream_error", out.message, 502);
        return err("upstream_error", "unknown upstream state", 502);
      }

      // GET /wallet/:slot/balance  (DERIVED: sum of credited deposit inflow)
      if (parts.length === 3 && parts[2] === "balance") {
        const address = url.searchParams.get("address");
        if (!address) {
          return err("missing_address", "address query param required", 400);
        }

        let total = 0n;
        let count = 0;
        let cursor: string | undefined;
        let pages = 0;
        let provisioned = true;

        do {
          const out = await client.listDeposits(chainId, {
            address,
            limit: MAX_PAGE,
            cursor,
          });
          if (out.kind === "not_provisioned") {
            provisioned = false;
            break;
          }
          if (out.kind === "unknown_chain") {
            return err(
              "unknown_chain",
              `upstream has no chain "${chainId}"`,
              404,
            );
          }
          if (out.kind === "error") {
            return err("upstream_error", out.message, 502);
          }

          for (const d of out.data.deposits) {
            try {
              total += toSats(d.value_sats);
            } catch (e) {
              return err(
                "upstream_error",
                e instanceof Error ? e.message : "bad value_sats",
                502,
              );
            }
            count++;
          }
          cursor = out.data.next_cursor ?? undefined;
          pages++;
        } while (cursor && pages < MAX_BALANCE_PAGES);

        const truncated = Boolean(cursor) && pages >= MAX_BALANCE_PAGES;

        return json({
          slot,
          chainId,
          address,
          provisioned,
          totalSats: total.toString(),
          depositCount: count,
          truncated,
          // CAVEAT: derived from deposit inflow (sum of credited peg-ins),
          // NOT spendable L2 balance. SupaQt exposes no balance route today.
          note: "derived from deposit inflow; not spendable balance",
        });
      }
    }

    return err("not_found", `no route for ${url.pathname}`, 404);
  },
};
