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

/** GET /market/price/:asset — live market price for ECX/eCash aliases. */
export async function getMarketPrice(asset: string): Promise<MarketPrice> {
  return supaqtGet<MarketPrice>(
    `/market/price/${encodeURIComponent(asset.toLowerCase())}`,
  );
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
  let out = whole.toString();
  if (frac > 0n) {
    const f = frac.toString().padStart(8, "0").replace(/0+$/, "");
    out += `.${f}`;
  }
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
 * Convenience: indexed L1/signet balance for an address. This is what the
 * dashboard uses to show the wallet's on-chain (signet) balance.
 */
export async function getL1Balance(address: string): Promise<ChainBalance> {
  return _client.getChainBalance(L1_CHAIN_ID, address);
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
 * Convenience: spendable L1/signet UTXO set for an address. This is what Send
 * uses to fund a signet transaction before signing locally.
 */
export async function getL1Utxos(
  address: string,
  params: GetUtxosParams = {},
): Promise<UtxosResult> {
  return _client.getUtxos(L1_CHAIN_ID, address, params);
}

/**
 * POST /chains/:chainId/broadcast — relay a fully-signed raw tx hex to a
 * chain's node. Broadcast is signet/L1 ONLY today; pass "signet". L2
 * sidechains are NOT broadcastable here (ApiError "broadcast_unsupported",
 * 501) — use the sidechain's own transfer/withdraw verbs instead.
 *
 * Returns the broadcast receipt (txid + accepted). Throws ApiError on
 * failure; notable codes: "rejected" (422 — do not retry same bytes),
 * "rate_limited" (429 — honor details.retryAfter), "relay_error"/
 * "broadcast_unavailable" (502/503 — retry with backoff).
 */
export async function broadcastTransaction(
  chainId: string,
  txHex: string,
): Promise<BroadcastReceipt> {
  return _client.broadcast(chainId, txHex);
}

// ---------------------------------------------------------------------------
// Raw transaction fetch (signet block explorer)
// ---------------------------------------------------------------------------
// OneKey firmware requires full prevout transactions (refTxs) even for segwit
// inputs. The Sidecoin adapter exposes no raw-tx endpoint, so we fetch from the
// signet mempool.space API. This is read-only and signet-specific.

const SIGNET_TX_API = "https://explorer.signet.drivechain.info/api/tx";

/** Fetch raw transaction hex by txid from the signet block explorer. */
export async function getRawTransaction(txid: string): Promise<string> {
  const res = await globalThis.fetch(`${SIGNET_TX_API}/${txid}/hex`);
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
