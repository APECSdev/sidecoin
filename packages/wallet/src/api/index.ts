// packages/wallet/src/api/index.ts
//
// Abstraction layer that replaces Tauri's `invoke()` for the web edition.
//
// In the desktop app, views call `invoke<T>("command_name")` to talk to
// the Rust backend over IPC. In the webapp, this module provides the same
// function signatures backed by:
//
//   1. A configurable REST/JSON-RPC endpoint (for connecting to a remote node)
//   2. Mock data (for demo/offline mode)
//
// The views import from this module instead of `@tauri-apps/api/core`,
// making them portable across desktop and web.

// ---------------------------------------------------------------------------
// Types (mirroring the Tauri command return types)
// ---------------------------------------------------------------------------

export interface WalletBalance {
  confirmed: number;
  unconfirmed: number;
  total: number;
}

export interface BlockInfo {
  height: number;
  hash: string;
  timestamp: number;
}

export interface Sidechain {
  slot: number;
  name: string;
  description: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Base URL for the wallet backend API.
 * When empty, mock data is used (demo mode).
 */
let _apiBaseUrl = "";

/**
 * Set the backend API base URL.
 * Call this from Settings when the user configures their node.
 *
 * @param url - The base URL, e.g. "http://127.0.0.1:8332"
 */
export function setApiBaseUrl(url: string): void {
  _apiBaseUrl = url.replace(/\/+$/, "");
  console.log("[api] Base URL set to:", _apiBaseUrl || "(mock mode)");
}

/**
 * Get the current backend API base URL.
 */
export function getApiBaseUrl(): string {
  return _apiBaseUrl;
}

/**
 * Returns true if we're in mock/demo mode (no backend configured).
 */
export function isMockMode(): boolean {
  return _apiBaseUrl === "";
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_BALANCE: WalletBalance = {
  confirmed: 0,
  unconfirmed: 0,
  total: 0,
};

const MOCK_BLOCK: BlockInfo = {
  height: 0,
  hash: "0000000000000000000000000000000000000000000000000000000000000000",
  timestamp: 0,
};

const MOCK_SIDECHAINS: Sidechain[] = [
  { slot: 0, name: "Thunder Network", description: "Payment channel network for instant, low-fee transactions.", active: true },
  { slot: 1, name: "zSide", description: "Privacy-focused sidechain with shielded transactions.", active: true },
  { slot: 2, name: "BitNames", description: "Decentralized naming and identity system.", active: true },
  { slot: 3, name: "BitAssets", description: "Tokenized assets and prediction markets.", active: true },
  { slot: 4, name: "Photon", description: "EVM-compatible smart contract sidechain.", active: true },
  { slot: 5, name: "Truthcoin", description: "Prediction market sidechain with peer-to-peer oracle.", active: true },
  { slot: 6, name: "CoinShift", description: "Cross-chain atomic swap sidechain.", active: true },
  { slot: 7, name: "Sidechain #8 (TBA)", description: "Reserved sidechain slot.", active: false },
];

const MOCK_RECEIVE_ADDRESS = "bc1q0000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// API Functions (drop-in replacements for Tauri invoke())
// ---------------------------------------------------------------------------

/**
 * Fetch wallet balance.
 * Replaces: invoke<WalletBalance>("get_balance")
 */
export async function getBalance(): Promise<WalletBalance> {
  if (isMockMode()) {
    return MOCK_BALANCE;
  }

  const res = await fetch(`${_apiBaseUrl}/api/balance`);
  if (!res.ok) throw new Error(`Failed to fetch balance: ${res.status}`);
  return res.json();
}

/**
 * Fetch latest block info.
 * Replaces: invoke<BlockInfo>("get_latest_block")
 */
export async function getLatestBlock(): Promise<BlockInfo> {
  if (isMockMode()) {
    return MOCK_BLOCK;
  }

  const res = await fetch(`${_apiBaseUrl}/api/block/latest`);
  if (!res.ok) throw new Error(`Failed to fetch block: ${res.status}`);
  return res.json();
}

/**
 * Fetch list of sidechains.
 * Replaces: invoke<Sidechain[]>("get_sidechains")
 */
export async function getSidechains(): Promise<Sidechain[]> {
  if (isMockMode()) {
    return MOCK_SIDECHAINS;
  }

  const res = await fetch(`${_apiBaseUrl}/api/sidechains`);
  if (!res.ok) throw new Error(`Failed to fetch sidechains: ${res.status}`);
  return res.json();
}

/**
 * Get a receive address.
 * Replaces: invoke<string>("get_receive_address")
 */
export async function getReceiveAddress(): Promise<string> {
  if (isMockMode()) {
    return MOCK_RECEIVE_ADDRESS;
  }

  const res = await fetch(`${_apiBaseUrl}/api/address/new`);
  if (!res.ok) throw new Error(`Failed to get address: ${res.status}`);
  return res.text();
}
