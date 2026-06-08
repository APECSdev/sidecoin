// packages/api/src/lib/shared.ts
//
// Shared core for all three Sidecoin endpoints (/v1, /graphql, /mcp).
// Hoisted out of worker.ts so the REST, GraphQL, and MCP handlers all call
// the SAME slot resolver, normalizer, bigint parser, and upstream
// operations — guaranteeing identical data from the same SupaQt source of
// truth regardless of transport.
//
// Error envelope (normalized, REST): { error: { code, message, details? } }

import {
  getSidechainBySlot,
  getActiveSidechains,
} from "@sidecoin/shared/sidechains";

import {
  UpstreamClient,
  type UpstreamDepositRecord,
} from "../upstream.js";

export interface Env {
  SUPAQT_BASE_URL?: string;
}

// POST is allowed because /graphql and /mcp are POST endpoints; /v1 stays
// GET-only at the handler level, this only widens the CORS preflight.
export const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

// Upstream caps list at 200/page; we page balance with the max page size.
export const MAX_PAGE = 200;
export const MAX_BALANCE_PAGES = 100; // safety bound for the derived sum

export function json(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...extra },
  });
}

export function err(
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

/** Stable, camelCase deposit shape served by every transport. */
export interface NormalizedDeposit {
  slot: number;
  chainId: string;
  l1Txid: string;
  vout: number;
  ctipSeq: number | null;
  address: string;
  valueSats: string;
  status: string;
  confirmations: number | null;
  firstSeenTs: number | null;
  l1ConfirmedTs: number | null;
  l2CreditedTs: number | null;
}

/** Normalize an upstream snake_case row to our stable camelCase shape. */
export function normalizeDeposit(
  slot: number,
  chainId: string,
  r: UpstreamDepositRecord,
): NormalizedDeposit {
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

export function toSats(s: string): bigint {
  if (!/^\d+$/.test(s)) throw new Error(`invalid value_sats: ${s}`);
  return BigInt(s);
}

/**
 * Transport-neutral slot resolution. Returns a discriminated result so each
 * transport can format the failure in its own envelope (REST err(), GraphQL
 * error extensions, MCP isError tool result) instead of a baked Response.
 */
export type SlotResolution =
  | { ok: true; slot: number; chainId: string }
  | { ok: false; code: string; message: string; status: number };

/**
 * Resolve a slot path/argument to an ACTIVE sidechain descriptor.
 * Fails on bad slot, unknown, or non-active (such as proposed riscy). signet
 * is absent from our registry, so it resolves to "unknown slot" here —
 * exactly the filtering we want.
 */
export function resolveSlot(raw: string): SlotResolution {
  if (!/^\d+$/.test(raw)) {
    return { ok: false, code: "bad_slot", message: `invalid slot "${raw}"`, status: 400 };
  }
  const slot = Number(raw);
  const sc = getSidechainBySlot(slot);
  if (!sc) {
    return {
      ok: false,
      code: "unknown_slot",
      message: `no sidechain at slot ${slot}`,
      status: 404,
    };
  }
  if (sc.status !== "active") {
    return {
      ok: false,
      code: "sidechain_inactive",
      message: `sidechain at slot ${slot} (${sc.id}) is ${sc.status}, not active`,
      status: 404,
    };
  }
  return { ok: true, slot, chainId: sc.id };
}

/** Active drivechains from OUR registry, in stable camelCase shape. */
export function listSidechains() {
  return getActiveSidechains().map((sc) => ({
    slot: sc.slot,
    id: sc.id,
    displayName: sc.displayName,
    description: sc.description,
    status: sc.status,
  }));
}

/** Health payload, shared so all transports report identically. */
export function healthInfo() {
  return {
    status: "ok",
    service: "sidecoin-api",
    time: new Date().toISOString(),
  };
}

// --- Shared upstream operations -------------------------------------------
// These produce the SAME normalized data for every transport. Each transport
// is responsible only for mapping the outcome kind into its own envelope.

export type ListDepositsResult =
  | { kind: "ok"; deposits: NormalizedDeposit[]; nextCursor: string | null }
  | { kind: "not_provisioned" }
  | { kind: "unknown_chain" }
  | { kind: "error"; message: string };

export async function opListDeposits(
  client: UpstreamClient,
  slot: number,
  chainId: string,
  params: {
    address?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  },
): Promise<ListDepositsResult> {
  const out = await client.listDeposits(chainId, params);
  if (out.kind === "not_provisioned") return { kind: "not_provisioned" };
  if (out.kind === "unknown_chain") return { kind: "unknown_chain" };
  if (out.kind === "error") return { kind: "error", message: out.message };
  return {
    kind: "ok",
    deposits: out.data.deposits.map((d) => normalizeDeposit(slot, chainId, d)),
    nextCursor: out.data.next_cursor,
  };
}

export type GetDepositResult =
  | { kind: "ok"; deposit: NormalizedDeposit }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export async function opGetDeposit(
  client: UpstreamClient,
  slot: number,
  chainId: string,
  l1Txid: string,
  vout: number,
): Promise<GetDepositResult> {
  const out = await client.getDeposit(chainId, l1Txid, vout);
  if (out.kind === "ok") {
    return { kind: "ok", deposit: normalizeDeposit(slot, chainId, out.data) };
  }
  // not_found AND not_provisioned both mean "no such deposit here".
  if (out.kind === "not_found" || out.kind === "not_provisioned") {
    return { kind: "not_found" };
  }
  if (out.kind === "error") return { kind: "error", message: out.message };
  return { kind: "error", message: "unknown upstream state" };
}

export type BalanceResult =
  | {
      kind: "ok";
      provisioned: boolean;
      totalSats: string;
      depositCount: number;
      truncated: boolean;
    }
  | { kind: "unknown_chain" }
  | { kind: "error"; message: string };

/**
 * DERIVED balance: sum of credited deposit inflow for an address across up
 * to MAX_BALANCE_PAGES pages of MAX_PAGE. NOT spendable L2 balance — SupaQt
 * exposes no balance route today.
 */
export async function opDeriveBalance(
  client: UpstreamClient,
  chainId: string,
  address: string,
): Promise<BalanceResult> {
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
      return { kind: "unknown_chain" };
    }
    if (out.kind === "error") {
      return { kind: "error", message: out.message };
    }

    for (const d of out.data.deposits) {
      try {
        total += toSats(d.value_sats);
      } catch (e) {
        return {
          kind: "error",
          message: e instanceof Error ? e.message : "bad value_sats",
        };
      }
      count++;
    }
    cursor = out.data.next_cursor ?? undefined;
    pages++;
  } while (cursor && pages < MAX_BALANCE_PAGES);

  const truncated = Boolean(cursor) && pages >= MAX_BALANCE_PAGES;

  return {
    kind: "ok",
    provisioned,
    totalSats: total.toString(),
    depositCount: count,
    truncated,
  };
}
