// packages/api/src/routes/explorer.ts
//
// Chain explorer REST reads backed by SupaQt's indexed explorer endpoints.
// SupaQt is snake_case; this adapter exposes the Sidecoin API's stable
// camelCase surface. Public chain id "l1" maps to upstream "signet".

import {
  MAX_PAGE,
  err,
  json,
  type Env,
} from "../lib/shared.js";
import { DEFAULT_SUPAQT_BASE } from "../upstream.js";

type JsonObject = Record<string, unknown>;

interface ExplorerChainResolution {
  chainId: "l1" | "bitnames" | "thunder";
  upstreamChainId: "signet" | "bitnames" | "thunder";
}

function asObject(v: unknown): JsonObject {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as JsonObject)
    : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(r: JsonObject, key: string): string | null {
  const v = r[key];
  return typeof v === "string" ? v : null;
}

function strRequired(r: JsonObject, key: string): string {
  return str(r, key) ?? "";
}

function num(r: JsonObject, key: string): number | null {
  const v = r[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bool(r: JsonObject, key: string): boolean | null {
  const v = r[key];
  return typeof v === "boolean" ? v : null;
}

function decimalStringOrNull(r: JsonObject, key: string): string | null {
  const v = r[key];
  return typeof v === "string" && /^\d+$/.test(v) ? v : null;
}

function resolveExplorerChain(raw: string): ExplorerChainResolution | null {
  const id = raw.toLowerCase();
  if (id === "l1" || id === "signet") {
    return { chainId: "l1", upstreamChainId: "signet" };
  }
  if (id === "bitnames") {
    return { chainId: "bitnames", upstreamChainId: "bitnames" };
  }
  if (id === "thunder") {
    return { chainId: "thunder", upstreamChainId: "thunder" };
  }
  return null;
}

function checkedLimit(url: URL): { ok: true; limit?: number } | { ok: false; response: Response } {
  const raw = url.searchParams.get("limit");
  if (raw == null) return { ok: true };

  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    return {
      ok: false,
      response: err("bad_limit", `invalid limit "${raw}"`, 400),
    };
  }

  return { ok: true, limit: Math.min(n, MAX_PAGE) };
}

function upstreamBase(env: Env): string {
  return (env.SUPAQT_BASE_URL ?? DEFAULT_SUPAQT_BASE).replace(/\/+$/, "");
}

function upstreamHeaders(env: Env): HeadersInit {
  return {
    accept: "application/json",
    ...(env.SUPAQT_API_KEY
      ? { authorization: `Bearer ${env.SUPAQT_API_KEY}` }
      : {}),
  };
}

async function upstreamGet(
  env: Env,
  path: string,
  query?: URLSearchParams,
): Promise<{ status: number; body: unknown }> {
  const qs = query && [...query.keys()].length ? `?${query}` : "";
  const res = await fetch(`${upstreamBase(env)}${path}${qs}`, {
    headers: upstreamHeaders(env),
  });

  const text = await res.text();
  if (!text) return { status: res.status, body: null };

  try {
    return { status: res.status, body: JSON.parse(text) as unknown };
  } catch {
    return { status: res.status, body: { error: text } };
  }
}

function upstreamErrorMessage(body: unknown, fallback: string): string {
  const o = asObject(body);
  const e = o.error;
  if (typeof e === "string") return e;
  const m = o.message;
  if (typeof m === "string") return m;
  return fallback;
}

function normalizeBlockSummary(
  chainId: string,
  upstreamChainId: string,
  raw: unknown,
) {
  const r = asObject(raw);
  return {
    chainId,
    upstreamChainId,
    height: num(r, "height"),
    hash: strRequired(r, "hash"),
    previousHash: str(r, "previous_hash"),
    timestamp: num(r, "timestamp"),
    confirmations: num(r, "confirmations"),
    transactionCount: num(r, "transaction_count") ?? 0,
    size: num(r, "size"),
    weight: num(r, "weight"),
  };
}

function normalizeBlockDetail(
  chainId: string,
  upstreamChainId: string,
  raw: unknown,
) {
  const r = asObject(raw);
  const txids = asArray(r.txids ?? r.transactions)
    .map((tx) => {
      if (typeof tx === "string") return tx;
      const o = asObject(tx);
      return str(o, "txid") ?? str(o, "hash");
    })
    .filter((txid): txid is string => Boolean(txid));

  return {
    ...normalizeBlockSummary(chainId, upstreamChainId, r),
    nextHash: str(r, "next_hash"),
    merkleRoot: str(r, "merkle_root"),
    version: num(r, "version"),
    nonce: num(r, "nonce"),
    bits: str(r, "bits"),
    difficulty: str(r, "difficulty"),
    txids,
  };
}

function normalizeTransactionSummary(
  chainId: string,
  upstreamChainId: string,
  raw: unknown,
) {
  const r = asObject(raw);
  return {
    chainId,
    upstreamChainId,
    txid: strRequired(r, "txid"),
    status: str(r, "status") ?? "confirmed",
    coinbase: bool(r, "coinbase"),
    blockHeight: num(r, "block_height"),
    blockHash: str(r, "block_hash"),
    confirmations: num(r, "confirmations") ?? 0,
    timestamp: num(r, "timestamp"),
    totalOutputSats: decimalStringOrNull(r, "total_output_sats"),
    feeSats: decimalStringOrNull(r, "fee_sats"),
    feeRate: str(r, "fee_rate"),
    size: num(r, "size"),
    vsize: num(r, "vsize"),
    weight: num(r, "weight"),
  };
}

function normalizeInput(raw: unknown) {
  const r = asObject(raw);
  return {
    previousTxid: str(r, "previous_txid"),
    vout: num(r, "vout"),
    address: str(r, "address"),
    valueSats: decimalStringOrNull(r, "value_sats"),
  };
}

function normalizeOutput(raw: unknown) {
  const r = asObject(raw);
  return {
    vout: num(r, "vout"),
    address: str(r, "address"),
    valueSats: decimalStringOrNull(r, "value_sats"),
    scriptPubKey: str(r, "script_pubkey"),
    spent: bool(r, "spent"),
  };
}

function normalizeTransactionDetail(
  chainId: string,
  upstreamChainId: string,
  raw: unknown,
) {
  const r = asObject(raw);
  return {
    ...normalizeTransactionSummary(chainId, upstreamChainId, r),
    version: num(r, "version"),
    locktime: num(r, "locktime"),
    inputs: asArray(r.inputs).map(normalizeInput),
    outputs: asArray(r.outputs).map(normalizeOutput),
  };
}

function normalizeAddressOverview(
  chainId: string,
  upstreamChainId: string,
  raw: unknown,
) {
  const r = asObject(raw);
  return {
    chainId,
    upstreamChainId,
    address: strRequired(r, "address"),
    balanceSats: decimalStringOrNull(r, "balance_sats"),
    totalReceivedSats: decimalStringOrNull(r, "total_received_sats"),
    totalSentSats: decimalStringOrNull(r, "total_sent_sats"),
    transactionCount: num(r, "transaction_count") ?? 0,
    utxoCount: num(r, "utxo_count") ?? 0,
  };
}

async function forwardExplorerGet(
  env: Env,
  upstreamPath: string,
  query: URLSearchParams | undefined,
  notFoundCode: string,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  let upstream: { status: number; body: unknown };
  try {
    upstream = await upstreamGet(env, upstreamPath, query);
  } catch (e) {
    return {
      ok: false,
      response: err(
        "upstream_error",
        e instanceof Error ? e.message : "upstream fetch failed",
        502,
      ),
    };
  }

  if (upstream.status === 200) {
    return { ok: true, body: upstream.body };
  }

  if (upstream.status === 404) {
    return {
      ok: false,
      response: err(
        notFoundCode,
        upstreamErrorMessage(upstream.body, "explorer resource not found"),
        404,
      ),
    };
  }

  return {
    ok: false,
    response: err(
      "upstream_error",
      upstreamErrorMessage(upstream.body, `upstream ${upstream.status}`),
      502,
      { status: upstream.status },
    ),
  };
}

/**
 * Handle /v1/chains/:chainId explorer reads.
 *
 * Returns null for non-explorer /chains routes so the existing balance,
 * utxo, and broadcast handlers keep owning their current paths.
 */
export async function handleExplorerV1(
  _req: Request,
  env: Env,
  url: URL,
  parts: string[],
): Promise<Response | null> {
  if (parts[0] !== "chains" || parts.length < 3) return null;

  const resolved = resolveExplorerChain(parts[1]);
  if (!resolved) return null;

  const { chainId, upstreamChainId } = resolved;
  const resource = parts[2];

  const limit = checkedLimit(url);
  if (!limit.ok) return limit.response;

  const query = new URLSearchParams();
  if (limit.limit != null) query.set("limit", String(limit.limit));
  const cursor = url.searchParams.get("cursor");
  if (cursor) query.set("cursor", cursor);

  // GET /chains/:chainId/blocks
  if (resource === "blocks" && parts.length === 3) {
    const out = await forwardExplorerGet(
      env,
      `/chains/${upstreamChainId}/blocks`,
      query,
      "blocks_not_found",
    );
    if (!out.ok) return out.response;

    const body = asObject(out.body);
    return json({
      chainId,
      upstreamChainId,
      tipHeight: num(body, "tip_height"),
      blocks: asArray(body.blocks).map((b) =>
        normalizeBlockSummary(chainId, upstreamChainId, b),
      ),
      nextCursor: str(body, "next_cursor"),
    });
  }

  // GET /chains/:chainId/blocks/:heightOrHash
  if (resource === "blocks" && parts.length === 4) {
    const id = parts[3];
    const out = await forwardExplorerGet(
      env,
      `/chains/${upstreamChainId}/blocks/${encodeURIComponent(id)}`,
      undefined,
      "block_not_found",
    );
    if (!out.ok) return out.response;

    return json({
      chainId,
      upstreamChainId,
      block: normalizeBlockDetail(chainId, upstreamChainId, out.body),
    });
  }

  // GET /chains/:chainId/transactions
  if (resource === "transactions" && parts.length === 3) {
    const out = await forwardExplorerGet(
      env,
      `/chains/${upstreamChainId}/transactions`,
      query,
      "transactions_not_found",
    );
    if (!out.ok) return out.response;

    const body = asObject(out.body);
    return json({
      chainId,
      upstreamChainId,
      transactions: asArray(body.transactions).map((tx) =>
        normalizeTransactionSummary(chainId, upstreamChainId, tx),
      ),
      nextCursor: str(body, "next_cursor"),
    });
  }

  // GET /chains/:chainId/transactions/:txid
  if (resource === "transactions" && parts.length === 4) {
    const txid = parts[3];
    if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
      return err("bad_txid", `invalid txid "${txid}"`, 400);
    }

    const out = await forwardExplorerGet(
      env,
      `/chains/${upstreamChainId}/transactions/${txid}`,
      undefined,
      "transaction_not_found",
    );
    if (!out.ok) return out.response;

    return json({
      chainId,
      upstreamChainId,
      transaction: normalizeTransactionDetail(chainId, upstreamChainId, out.body),
    });
  }

  // Preserve existing wallet routes:
  // /chains/:chainId/address/:address/balance
  // /chains/:chainId/address/:address/utxos
  if (
    resource === "address" &&
    parts.length === 5 &&
    (parts[4] === "balance" || parts[4] === "utxos")
  ) {
    return null;
  }

  // GET /chains/:chainId/address/:address
  if (resource === "address" && parts.length === 4) {
    const address = parts[3];
    const out = await forwardExplorerGet(
      env,
      `/chains/${upstreamChainId}/address/${encodeURIComponent(address)}`,
      undefined,
      "address_not_found",
    );
    if (!out.ok) return out.response;

    return json({
      chainId,
      upstreamChainId,
      address: normalizeAddressOverview(chainId, upstreamChainId, out.body),
    });
  }

  // GET /chains/:chainId/address/:address/transactions
  if (resource === "address" && parts.length === 5 && parts[4] === "transactions") {
    const address = parts[3];
    const out = await forwardExplorerGet(
      env,
      `/chains/${upstreamChainId}/address/${encodeURIComponent(address)}/transactions`,
      query,
      "address_transactions_not_found",
    );
    if (!out.ok) return out.response;

    const body = asObject(out.body);
    return json({
      chainId,
      upstreamChainId,
      address,
      transactions: asArray(body.transactions).map((tx) =>
        normalizeTransactionSummary(chainId, upstreamChainId, tx),
      ),
      nextCursor: str(body, "next_cursor"),
    });
  }

  return null;
}
