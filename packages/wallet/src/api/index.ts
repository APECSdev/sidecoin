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
  type ListDepositsParams,
} from "@sidecoin/api-client";

export type {
  SidechainSummary,
  DepositsPage,
  WalletBalance,
  ListDepositsParams,
} from "@sidecoin/api-client";
export { ApiError } from "@sidecoin/api-client";

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
 * GET /wallet/:slot/balance — DERIVED inflow for an address, not a spendable
 * balance. Requires an address (available once a key exists in Phase 3).
 */
export async function getWalletBalance(
  slot: number,
  address: string,
): Promise<WalletBalance> {
  return _client.getWalletBalance(slot, address);
}
