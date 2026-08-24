// packages/wallet/src/api/index.ts
//
// Wallet data layer for the web edition. Thin wrapper over the FROZEN
// @sidecoin/api-client (SidecoinClient), which talks only to the adapter
// REST surface (default https://sidecoin.app/v1).
//
// Views import from this module so the client is configured in one place
// (Settings calls setApiBaseUrl) and so tests can stub a single fetch.

import {
  SidecoinClient,
  type SidechainSummary,
  type DepositsPage,
  type WalletBalance,
  type ChainBalance,
  type ListDepositsParams,
  type BroadcastReceipt,
  type UtxosResult,
  type GetUtxosParams,
} from "@sidecoin/api-client";
import { scriptPubKeyFromAddress } from "@sidecoin/shared";

export type {
  SidechainSummary,
  DepositsPage,
  WalletBalance,
  ChainBalance,
  ListDepositsParams,
  BroadcastReceipt,
  Utxo,
  UtxosResult,
  GetUtxosParams,
} from "@sidecoin/api-client";
export { ApiError } from "@sidecoin/api-client";

/** Upstream chain id for Bitcoin L1 / signet (no sidechain slot). */
export const L1_CHAIN_ID = "signet";

/** Satoshis per whole coin (1 BTC = 100,000,000 sats). */
const SATS_PER_COIN = 100_000_000n;

// ---------------------------------------------------------------------------
// Client configuration (single source of truth)
// ---------------------------------------------------------------------------

let _apiBaseUrl = "";
let _client = makeClient(_apiBaseUrl);

/**
 * Build a SidecoinClient. The fetchImpl is a live delegate to globalThis.fetch
 * (rather than the captured reference) so spies/mocks installed after
 * construction are still honored.
 */
function makeClient(baseUrl: string): SidecoinClient {
  return new SidecoinClient({
    baseUrl: baseUrl || undefined,
    fetchImpl: (input: RequestInfo | URL, init?: RequestInit) =>
      globalThis.fetch(input, init),
  });
}

/**
 * Point the wallet at a specific adapter base URL. Empty string resets to the
 * client's built-in default (DEFAULT_BASE_URL). Call from Settings.
 */
export function setApiBaseUrl(url: string): void {
  _apiBaseUrl = url.replace(/\/+$/, "");
  _client = makeClient(_apiBaseUrl);
  console.log("[api] Base URL set to:", _apiBaseUrl || "(default)");
}

/** The configured base URL, or "" when using the client default. */
export function getApiBaseUrl(): string {
  return _apiBaseUrl;
}

/** Escape hatch for views that need the raw client (e.g. the poller). */
export function getClient(): SidecoinClient {
  return _client;
}


// ---------------------------------------------------------------------------
// SupaQt live data helpers
// ---------------------------------------------------------------------------

/** Read-only SupaQt API base for Coin News and market data. */
export const SUPAQT_BASE_URL = "https://supaqt.com/v1";

/** Read-only eCash Farm API base for the ECX/USD market projection. */
export const ECASHFARM_BASE_URL = "https://ecashfarm.com/v1";

export interface CoinNewsFeed {
  id: string;
  name: string;
  language?: string;
  enabled?: boolean;
  post_count?: number;
}

export interface CoinNewsPost {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  author: string | null;
  created_at: number;
  fee_sats: string;
  flag: number | null;
  txid: string;
  status: string;
}

export interface CoinNewsPostsPage {
  feed: {
    id: string;
    name: string;
  };
  posts: CoinNewsPost[];
  next_cursor: string | null;
}

export interface CoinNewsPostsParams {
  limit?: number;
  cursor?: string;
}

export interface MarketPrice {
  asset: string;
  name: string;
  price_usd: string;
  source: string;
  as_of: string;
}

async function supaqtGet<T>(path: string): Promise<T> {
  const res = await globalThis.fetch(`${SUPAQT_BASE_URL}${path}`, {
    headers: { accept: "application/json" },
  });

  const text = await res.text();
  let body: unknown = null;

  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch (e) {
      console.error("[api] Failed to parse SupaQt response:", e);
      throw new Error("SupaQt returned invalid JSON.");
    }
  }

  if (!res.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "message" in body.error &&
      typeof body.error.message === "string"
        ? body.error.message
        : `SupaQt request failed with HTTP ${res.status}.`;

    throw new Error(message);
  }

  return body as T;
}

/** GET /coin-news/feeds — enabled Coin News feeds indexed by SupaQt. */
export async function getCoinNewsFeeds(): Promise<CoinNewsFeed[]> {
  const page = await supaqtGet<{ feeds: CoinNewsFeed[] }>("/coin-news/feeds");
  return Array.isArray(page.feeds) ? page.feeds : [];
}

/** GET /coin-news/feeds/:feedId/posts — live Coin News posts for one feed. */
export async function getCoinNewsPosts(
  feedId: string,
  params: CoinNewsPostsParams = {},
): Promise<CoinNewsPostsPage> {
  const qs = new URLSearchParams();

  if (params.limit !== undefined) {
    qs.set("limit", String(params.limit));
  }

  if (params.cursor) {
    qs.set("cursor", params.cursor);
  }

  const query = qs.toString();
  return supaqtGet<CoinNewsPostsPage>(
    `/coin-news/feeds/${encodeURIComponent(feedId)}/posts${query ? `?${query}` : ""}`,
  );
}

/** GET /market/price/:asset — live market price for ECX/eCash aliases.
 *
 * Sources the ECX/USD projection from eCash Farm (`/v1/markets`), which
 * publishes a `projected.ecxUsd` figure (a forward-looking fair-value
 * estimate rather than a last-trade print). The `asset` argument is
 * accepted for backward-compatibility but the projection is always for ECX
 * (eCash) — non-ECX aliases are coerced to "ecash". The returned `MarketPrice`
 * shape is preserved so existing callers (Dashboard) keep working; the
 * `source` field is set to "eCash Farm" and `as_of` carries the upstream
 * `updatedAt` epoch seconds as an ISO string.
 */
export async function getMarketPrice(asset: string): Promise<MarketPrice> {
  const url = `${ECASHFARM_BASE_URL}/markets`;
  const res = await globalThis.fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `eCash Farm market price request failed (${res.status} ${res.statusText})`,
    );
  }
  const body = (await res.json()) as {
    ok?: boolean;
    updatedAt?: number;
    projected?: { ecxUsd?: number };
  };
  const ecxUsd = body?.projected?.ecxUsd;
  if (typeof ecxUsd !== "number" || !isFinite(ecxUsd)) {
    throw new Error("eCash Farm response did not include a numeric projected.ecxUsd");
  }
  // Coerce non-ECX aliases to "ecash" — the projection is ECX-only.
  const normalizedAsset =
    asset && asset.toLowerCase() !== "ecash" ? "ecash" : "ecash";
  return {
    asset: normalizedAsset,
    name: "eCash",
    price_usd: ecxUsd.toFixed(2),
    source: "eCash Farm",
    as_of: body.updatedAt
      ? new Date(body.updatedAt * 1000).toISOString()
      : new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * Format a bigint sats amount as a decimal coin string (e.g. 133700000n ->
 * "1.337"). Trailing zeros in the fractional part are trimmed; a whole number
 * has no decimal point. Pure/lossless — never uses floating point.
 */
export function satsToBtc(sats: bigint): string {
  const neg = sats < 0n;
  const abs = neg ? -sats : sats;
  const whole = abs / SATS_PER_COIN;
  const frac = abs % SATS_PER_COIN;
  // Always show at least 2 decimal places (e.g. 4 → "4.00", 4.1 → "4.10").
  const f = frac.toString().padStart(8, "0").replace(/0+$/, "");
  const decimals = f.length < 2 ? f.padEnd(2, "0") : f;
  const out = `${whole}.${decimals}`;
  return neg ? `-${out}` : out;
}

// ---------------------------------------------------------------------------
// Data functions (delegating to the frozen client)
// ---------------------------------------------------------------------------

/** GET /sidechains — active drivechains known to the adapter. */
export async function getSidechains(): Promise<SidechainSummary[]> {
  return _client.getSidechains();
}

/** GET /wallet/:slot/deposits */
export async function getDeposits(
  slot: number,
  params: ListDepositsParams = {},
): Promise<DepositsPage> {
  return _client.getDeposits(slot, params);
}

/**
 * GET /wallet/:slot/balance — slot-addressed (sidechains). Indexed balance
 * when available, deposit-inflow fallback otherwise. For L1/signet use
 * getL1Balance / getChainBalance instead (signet has no slot).
 */
export async function getWalletBalance(
  slot: number,
  address: string,
): Promise<WalletBalance> {
  return _client.getWalletBalance(slot, address);
}

/**
 * GET /chains/:chainId/address/:address/balance — chainId-addressed indexed
 * balance for ANY chain, including L1/signet. Unknown address => totalSats 0n,
 * seen=false.
 */
export async function getChainBalance(
  chainId: string,
  address: string,
): Promise<ChainBalance> {
  return _client.getChainBalance(chainId, address);
}

/**
 * Convenience: indexed L1 balance for an address on the wallet's current
 * network (signet or alphanet). Reads from the public Esplora endpoint
 * (drivechain.dev/config) so balances work even while the sidecoin.app/v1
 * adapter is offline. `network` defaults to "signet" for back-compat with
 * callers that haven't been updated.
 */
export async function getL1Balance(
  address: string,
  network: L1Network = "signet",
): Promise<ChainBalance> {
  return esploraGetChainBalance(network, address);
}

/**
 * GET /chains/:chainId/address/:address/utxos — chainId-addressed spendable
 * UTXO set for ANY chain, including L1/signet. Unknown address => empty utxos.
 * valueSats on each UTXO is a bigint; check result.truncated before treating
 * the set as complete for coin selection.
 *
 * MATURITY: the adapter/upstream does NOT pre-filter coinbase maturity — it
 * reports the per-UTXO isCoinbase flag and leaves the policy to the caller.
 * Whoever builds coin selection MUST skip immature coinbase outputs
 * (isCoinbase && confirmations < the chain's coinbase maturity, 100 on
 * Bitcoin/signet). The optional minConfirmations is a GLOBAL floor across all
 * outputs, NOT a substitute for that per-UTXO maturity guard.
 */
export async function getUtxos(
  chainId: string,
  address: string,
  params: GetUtxosParams = {},
): Promise<UtxosResult> {
  return _client.getUtxos(chainId, address, params);
}

/**
 * Convenience: spendable L1 UTXO set for an address on the wallet's current
 * network (signet or alphanet). Reads from the public Esplora endpoint so
 * Send/CoinNews can fund txs even while the sidecoin.app/v1 adapter is offline.
 * `network` defaults to "signet" for back-compat.
 */
export async function getL1Utxos(
  address: string,
  params: GetUtxosParams = {},
  network: L1Network = "signet",
): Promise<UtxosResult> {
  return esploraGetUtxos(network, address, params);
}

/**
 * Relay a fully-signed raw tx hex to the L1 node for the wallet's current
 * network (signet or alphanet) via the public Esplora `POST /tx` endpoint
 * (drivechain.dev/config). This keeps Send/CoinNews working while the
 * sidecoin.app/v1 adapter is offline.
 *
 * Returns the broadcast receipt (txid + accepted). The Esplora endpoint
 * returns the txid as plain text on success, or an RPC error body on
 * failure (mapped to a thrown Error). `network` defaults to "signet" for
 * back-compat; `chainId` is accepted but ignored — Esplora broadcasts to
 * whichever chain its instance serves (signet or alphanet).
 */
export async function broadcastTransaction(
  chainId: string,
  txHex: string,
  network: L1Network = "signet",
): Promise<BroadcastReceipt> {
  void chainId; // Esplora routes by instance, not by chainId param.
  return esploraBroadcast(network, txHex);
}

// ---------------------------------------------------------------------------
// Public Esplora fallback for L1 reads + broadcast (drivechain.dev/config)
// ---------------------------------------------------------------------------
// The sidecoin.app/v1 adapter is offline (see HANDOFF). Until it's restored,
// L1 balance / UTXO / broadcast / raw-tx reads route to the public Esplora
// (mempool-electrs) endpoints published in the drivechain.dev/config registry.
// Both networks expose the same mempool/esplora API surface:
//   GET  /address/:addr            -> { chain_stats, mempool_stats }
//   GET  /address/:addr/utxo       -> [ { txid, vout, value, status:{confirmed,block_height} }, … ]
//   POST /tx                       -> txid (plain text) on success / RPC error on failure
//   GET  /tx/:txid/hex             -> raw tx hex
//   GET  /blocks/tip/height        -> current chain tip height
// The returned objects are coerced into the same ChainBalance / UtxosResult /
// BroadcastReceipt shapes the views already consume, so callers are unchanged.

/** The two L1 networks a user can toggle between. Both are non-production. */
export type L1Network = "signet" | "alphanet";

/** Public Esplora base URLs per L1 network (from drivechain.dev/config). */
const ESPLORA_BASES: Record<L1Network, string> = {
  signet: "https://esplora.signet.drivechain.info",
  alphanet: "https://esplora.alpha.ecash.ninja",
};

/** Resolve the Esplora base URL for a network (throws on unknown). */
function esploraBase(network: L1Network): string {
  const base = ESPLORA_BASES[network];
  if (!base) {
    throw new Error(`No Esplora endpoint configured for network "${network}".`);
  }
  return base;
}

/** Shape of the Esplora /address/:addr stats response. */
interface EsploraAddressStats {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

/** Shape of one entry in the Esplora /address/:addr/utxo response. */
interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
}

/**
 * Fetch the indexed L1 balance for an address from Esplora. Confirmed balance
 * = chain_stats.funded - chain_stats.spent; mempool balance adds the mempool
 * deltas. We report the confirmed balance as `totalSats` and mark `seen=true`
 * when the address has any chain or mempool history. `updatedAtHeight` is the
 * current chain tip (so the UI can show how fresh the figure is).
 */
async function esploraGetChainBalance(
  network: L1Network,
  address: string,
): Promise<ChainBalance> {
  const base = esploraBase(network);
  const res = await globalThis.fetch(`${base}/address/${address}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `Esplora balance request failed: HTTP ${res.status} ${res.statusText}`,
    );
  }
  const stats = (await res.json()) as EsploraAddressStats;

  const funded = BigInt(stats.chain_stats.funded_txo_sum);
  const spent = BigInt(stats.chain_stats.spent_txo_sum);
  const totalSats = funded - spent;

  const seen =
    stats.chain_stats.tx_count > 0 || stats.mempool_stats.tx_count > 0;

  let updatedAtHeight: number | null = null;
  if (seen) {
    try {
      const tipRes = await globalThis.fetch(`${base}/blocks/tip/height`);
      if (tipRes.ok) {
        updatedAtHeight = Number((await tipRes.text()).trim());
      }
    } catch {
      // Non-fatal — the balance is still valid without a tip height.
    }
  }

  return {
    chainId: network,
    address,
    source: "indexed",
    totalSats,
    seen,
    updatedAtHeight,
    note: seen
      ? `Confirmed balance via public Esplora (${network}).`
      : "Address not yet seen on-chain.",
  };
}

/**
 * Fetch the spendable UTXO set for an address from Esplora. Esplora's
 * /utxo endpoint already excludes spent outputs and reports per-UTXO
 * confirmation status. We map to the UtxosResult shape the views expect,
 * deriving each UTXO's P2WPKH scriptPubKey from the receive address (all L1
 * wallet UTXOs are index-0 P2WPKH for the wallet's own key).
 * `minConfirmations` is applied client-side as a global floor (the same
 * semantics the adapter offered); coinbase maturity is still the caller's
 * responsibility (Esplora flags coinbase in /txs, not /utxo).
 */
async function esploraGetUtxos(
  network: L1Network,
  address: string,
  params: GetUtxosParams = {},
): Promise<UtxosResult> {
  const base = esploraBase(network);
  const res = await globalThis.fetch(`${base}/address/${address}/utxo`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `Esplora UTXO request failed: HTTP ${res.status} ${res.statusText}`,
    );
  }
  const raw = (await res.json()) as EsploraUtxo[];
  const minConf = params.minConfirmations ?? 0;

  // Derive the P2WPKH scriptPubKey from the receive address so coin
  // selection / signing have the script they expect. All L1 wallet UTXOs are
  // index-0 P2WPKH for the wallet's own key, so the address's witness
  // program IS the script's payload.
  let scriptPubKey = "";
  try {
    scriptPubKey = scriptPubKeyFromAddress(address);
  } catch (e) {
    console.error("[api] Could not derive scriptPubKey from address:", e);
    // Leave scriptPubKey empty — signing will fail fast if it's needed.
  }

  const utxos = (Array.isArray(raw) ? raw : []).map((u) => ({
    chainId: network,
    address,
    txid: u.txid,
    vout: u.vout,
    valueSats: BigInt(u.value),
    scriptPubKey,
    isCoinbase: false, // Esplora /utxo does not flag coinbase; default false.
    confirmations: u.status?.confirmed ? 1 : 0, // confirmed vs mempool only.
    blockHeight: u.status?.confirmed ? (u.status.block_height ?? -1) : -1,
  }));

  // Apply the optional global minConfirmations floor (client-side). A
  // confirmed UTXO counts as >= 1 confirmation; mempool UTXOs are 0.
  const filtered =
    minConf > 0 ? utxos.filter((u) => u.confirmations >= minConf) : utxos;

  return {
    chainId: network,
    address,
    utxos: filtered,
    truncated: false, // Esplora /utxo returns the full set in one response.
  };
}

/**
 * Broadcast a fully-signed raw tx hex via Esplora `POST /tx`. On success the
 * endpoint returns the txid as plain text; on failure it returns an RPC error
 * body (e.g. "sendrawtransaction RPC error: …"). We map success/failure to
 * the BroadcastReceipt shape and throw on failure.
 */
async function esploraBroadcast(
  network: L1Network,
  txHex: string,
): Promise<BroadcastReceipt> {
  const base = esploraBase(network);
  const res = await globalThis.fetch(`${base}/tx`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: txHex,
  });
  const text = (await res.text()).trim();
  if (!res.ok) {
    throw new Error(
      `Esplora broadcast failed (HTTP ${res.status}): ${text || res.statusText}`,
    );
  }
  // Esplora returns the txid (64 hex chars) on success.
  if (!/^[0-9a-fA-F]{64}$/.test(text)) {
    throw new Error(`Esplora broadcast returned an unexpected response: ${text.slice(0, 80)}…`);
  }
  return {
    chainId: network,
    txid: text.toLowerCase(),
    accepted: true,
    broadcastAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Raw transaction fetch (L1 block explorer)
// ---------------------------------------------------------------------------
// OneKey firmware requires full prevout transactions (refTxs) even for segwit
// inputs. We fetch raw tx hex from the same public Esplora instance that
// serves balance/UTXO reads (drivechain.dev/config). Read-only. Network-aware:
// `network` defaults to "signet" for back-compat.

/** Fetch raw transaction hex by txid from the L1 block explorer. */
export async function getRawTransaction(
  txid: string,
  network: L1Network = "signet",
): Promise<string> {
  const base = esploraBase(network);
  const res = await globalThis.fetch(`${base}/tx/${txid}/hex`);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch raw tx ${txid}: HTTP ${res.status} ${res.statusText}`,
    );
  }
  const hex = (await res.text()).trim();
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Raw tx ${txid} returned non-hex data: ${hex.slice(0, 40)}…`);
  }
  return hex;
}
