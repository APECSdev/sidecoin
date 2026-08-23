// packages/wallet/src/keystore.ts
//
// Minimal localStorage keystore for the SIGNET TEST wallet.
//
// ⚠️  The mnemonic is stored in PLAINTEXT. This is acceptable only for
//     throwaway signet funds. Do NOT store a real-funds mnemonic here.
//     Encryption-at-rest must land before any mainnet support.

import { validateMnemonic, normalizeMnemonic } from "@sidecoin/shared";

const STORAGE_KEY = "sidecoin.wallet.v1";

/** The two L1 networks a user can toggle between in Settings. Both are
 *  non-production (signet = the live L2L signet; alphanet = the ECX alpha
 *  practice network, a mainnet fork from drivechain.dev/config). */
export type WalletNetwork = "signet" | "alphanet";

export interface StoredWallet {
  version: 1;
  network: WalletNetwork;
  mnemonic: string;
  createdAt: number;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // e.g. blocked by privacy settings
  }
}

export function hasWallet(): boolean {
  return loadWallet() !== null;
}

export function loadWallet(): StoredWallet | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredWallet;
    if (parsed?.version === 1 && typeof parsed.mnemonic === "string") {
      // Coerce the network field to a known WalletNetwork. Older wallets
      // (pre-toggle) stored the literal "signet"; anything else is treated
      // as signet so a corrupt field never blocks access.
      if (parsed.network !== "alphanet") {
        parsed.network = "signet";
      }
      return parsed;
    }
    return null;
  } catch {
    return null; // corrupt entry — treat as no wallet
  }
}

export function saveWallet(mnemonic: string): StoredWallet {
  const normalized = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalized)) {
    throw new Error("Refusing to store an invalid BIP-39 mnemonic.");
  }
  const record: StoredWallet = {
    version: 1,
    network: "signet",
    mnemonic: normalized,
    createdAt: Date.now(),
  };
  const s = storage();
  if (!s) throw new Error("localStorage is unavailable in this context.");
  s.setItem(STORAGE_KEY, JSON.stringify(record));
  return record;
}

/**
 * Persist a new network choice (signet or alphanet) onto the stored wallet.
 * The mnemonic is preserved; only `network` changes. Emits the
 * WALLET_NETWORK_EVENT so live views (Dashboard, Sidebar, …) re-derive and
 * re-fetch for the new network. Throws if there is no stored wallet or
 * localStorage is unavailable.
 */
export const WALLET_NETWORK_EVENT = "sidecoin:wallet-network-changed";

export function setWalletNetwork(network: WalletNetwork): StoredWallet {
  const s = storage();
  if (!s) throw new Error("localStorage is unavailable in this context.");
  const current = loadWallet();
  if (!current) {
    throw new Error("No wallet found. Create or import a wallet first.");
  }
  const updated: StoredWallet = { ...current, network };
  s.setItem(STORAGE_KEY, JSON.stringify(updated));
  try {
    window.dispatchEvent(new CustomEvent(WALLET_NETWORK_EVENT, { detail: { network } }));
  } catch {
    // window may be unavailable in some test contexts — non-fatal.
  }
  return updated;
}

export function clearWallet(): void {
  storage()?.removeItem(STORAGE_KEY);
}
