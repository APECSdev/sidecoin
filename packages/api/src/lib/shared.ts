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
  type UpstreamUtxoRecord,
} from "../upstream.js";

export interface Env {
  SUPAQT_BASE_URL?: string;
  /**
   * Optional authorized-provider API key for SupaQt. When set it is forwarded
   * (Authorization: Bearer) so we are rate-limited by key, not by our shared
   * Cloudflare egress IP. Wire it as a Worker secret once SupaQt issues it.
   */
  SUPAQT_API_KEY?: string;
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

/**
 * Build an UpstreamClient from the Worker env, threading the base URL and the
 * (optional) authorized-provider API key in one place.
 */
export function makeUpstream(env: Env): UpstreamClient {
  return new UpstreamClient({
    baseUrl: env.SUPAQT_BASE_URL,
    apiKey: env.SUPAQT_API_KEY,
  });
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

/**
 * Stable, camelCase UTXO shape served by every transport. valueSats stays a
 * bigint decimal string over the wire (CAN exceed 2^53); the client coerces
 * it to bigint. blockHeight uses a -1 sentinel for an unconfirmed (mempool)
 * output — matching the wallet's domain Utxo.blockHeight convention and the
 * balance route's updated_at_height === -1 ("never seen") sentinel — so the
 * wire shape never carries null for it. isCoinbase carries the upstream
 * `coinbase` fact verbatim; maturity policy is NOT applied here (it is the
 * coin-selection layer's surgical per-UTXO guard).
 */
export interface NormalizedUtxo {
  chainId: string;
  address: string;
  txid: string;
  vout: number;
  valueSats: string;
  scriptPubKey: string;
  confirmations: number;
  blockHeight: number;
  isCoinbase: boolean;
}

/** Normalize an upstream snake_case UTXO row to our stable camelCase shape. */
export function normalizeUtxo(
  chainId: string,
  address: string,
  r: UpstreamUtxoRecord,
): NormalizedUtxo {
  return {
    chainId,
    address,
    txid: r.txid,
    vout: r.vout,
    valueSats: r.value_sats, // keep bigint as decimal string over the wire
    scriptPubKey: r.script_pubkey,
    confirmations: r.confirmations,
    // null block_height (0-conf mempool output) -> -1 sentinel; otherwise the
    // confirming height verbatim.
    blockHeight: r.block_height === null ? -1 : r.block_height,
    isCoinbase: r.coinbase,
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

/**
 * Result of opListUtxos. The UTXO set is fully paginated upstream (callers
 * get the COMPLETE set in one call) because partial UTXO data would silently
 * corrupt coin selection. `truncated` is true only if the page cap
 * (MAX_BALANCE_PAGES) was hit before the cursor was exhausted — a wallet with
 * more than MAX_PAGE * MAX_BALANCE_PAGES UTXOs, which we surface rather than
 * silently drop. not_provisioned mirrors the deposits route (chain known but
 * its UTXO index isn't live yet) so the transport can return an empty set.
 */
export type ListUtxosResult =
  | { kind: "ok"; utxos: NormalizedUtxo[]; truncated: boolean }
  | { kind: "not_provisioned" }
  | { kind: "unknown_chain" }
  | { kind: "error"; message: string };

/**
 * List the spendable UTXO set for an address (chainId-addressed, any chain
 * incl. L1/signet). Pages through up to MAX_BALANCE_PAGES of MAX_PAGE,
 * mirroring opDeriveBalance's bounded keyset loop. minConfirmations is passed
 * straight through to upstream (endpoint default is 1); it is a GLOBAL floor,
 * NOT a coinbase-maturity filter — the per-UTXO maturity guard lives in
 * coin-selection. Each row is normalized to the stable camelCase shape.
 */
export async function opListUtxos(
  client: UpstreamClient,
  chainId: string,
  address: string,
  params: { minConfirmations?: number } = {},
): Promise<ListUtxosResult> {
  const utxos: NormalizedUtxo[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const out = await client.listUtxos(chainId, address, {
      limit: MAX_PAGE,
      cursor,
      minConfirmations: params.minConfirmations,
    });
    if (out.kind === "not_provisioned") return { kind: "not_provisioned" };
    if (out.kind === "unknown_chain") return { kind: "unknown_chain" };
    if (out.kind === "error") return { kind: "error", message: out.message };

    for (const u of out.data.utxos) {
      utxos.push(normalizeUtxo(chainId, address, u));
    }
    cursor = out.data.next_cursor ?? undefined;
    pages++;
  } while (cursor && pages < MAX_BALANCE_PAGES);

  const truncated = Boolean(cursor) && pages >= MAX_BALANCE_PAGES;

  return { kind: "ok", utxos, truncated };
}

/**
 * Authoritative indexed balance from SupaQt's balance route. seen=false maps
 * the upstream updated_at_height === -1 sentinel ("address never seen").
 */
export type IndexedBalanceResult =
  | {
      kind: "ok";
      balanceSats: string;
      updatedAtHeight: number;
      seen: boolean;
    }
  | { kind: "not_provisioned" }
  | { kind: "unknown_chain" }
  | { kind: "error"; message: string };

export async function opGetBalance(
  client: UpstreamClient,
  chainId: string,
  address: string,
): Promise<IndexedBalanceResult> {
  const out = await client.getBalance(chainId, address);
  if (out.kind === "ok") {
    // Validate the bigint string but keep it as a string over the wire.
    try {
      toSats(out.data.balance);
    } catch (e) {
      return {
        kind: "error",
        message: e instanceof Error ? e.message : "bad balance",
      };
    }
    const h = out.data.updated_at_height;
    // -1 => address never seen (synthetic zero balance).
    return {
      kind: "ok",
      balanceSats: out.data.balance,
      updatedAtHeight: h,
      seen: h !== -1,
    };
  }
  if (out.kind === "not_provisioned") return { kind: "not_provisioned" };
  if (out.kind === "unknown_chain") return { kind: "unknown_chain" };
  return { kind: "error", message: out.message };
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
 * to MAX_BALANCE_PAGES pages of MAX_PAGE. NOT spendable balance.
 *
 * Retained as the FALLBACK behind opGetBalance: the v1 balance route prefers
 * the real indexed balance and only falls back to this derived sum when the
 * chain's balance index isn't provisioned.
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

export type BroadcastResult =
  | {
      kind: "ok";
      chainId: string;
      txid: string;
      accepted: boolean;
      broadcastAt: number;
    }
  | { kind: "malformed"; message: string }
  | { kind: "rejected"; message: string }
  | { kind: "unknown_chain" }
  | { kind: "unsupported"; message: string }
  | { kind: "rate_limited"; retryAfter: number }
  | { kind: "relay_error"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

/**
 * Relay a fully-signed raw transaction to the chain's node via SupaQt's
 * broadcast route. The adapter never signs — it forwards an already-signed
 * tx_hex. Broadcast is signet/L1 ONLY today; L2 chainIds map to "unsupported"
 * (501) until dedicated sidechain endpoints ship. Maps the upstream verdict
 * to a transport-neutral result so each transport can format malformed/
 * rejected/unsupported/rate_limited/relay_error/unavailable/error in its own
 * envelope. Re-broadcasting an already-known tx is idempotent (ok, accepted,
 * same txid).
 */
export async function opBroadcast(
  client: UpstreamClient,
  chainId: string,
  txHex: string,
): Promise<BroadcastResult> {
  const out = await client.broadcast(chainId, txHex);
  if (out.kind === "ok") {
    return {
      kind: "ok",
      chainId: out.data.chainId,
      txid: out.data.txid,
      accepted: out.data.accepted,
      broadcastAt: out.data.broadcast_at,
    };
  }
  if (out.kind === "malformed") {
    return { kind: "malformed", message: out.message };
  }
  if (out.kind === "rejected") {
    return { kind: "rejected", message: out.message };
  }
  if (out.kind === "unknown_chain") return { kind: "unknown_chain" };
  if (out.kind === "unsupported") {
    return { kind: "unsupported", message: out.message };
  }
  if (out.kind === "rate_limited") {
    return { kind: "rate_limited", retryAfter: out.retryAfter };
  }
  if (out.kind === "relay_error") {
    return { kind: "relay_error", message: out.message };
  }
  if (out.kind === "unavailable") {
    return { kind: "unavailable", message: out.message };
  }
  return { kind: "error", message: out.message };
}
