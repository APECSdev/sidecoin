// packages/wallet/src/keystore.ts
//
// Minimal localStorage keystore for the SIGNET TEST wallet.
//
// ⚠️  The mnemonic is stored in PLAINTEXT. This is acceptable only for
//     throwaway signet funds. Do NOT store a real-funds mnemonic here.
//     Encryption-at-rest must land before any mainnet support.

import { validateMnemonic, normalizeMnemonic } from "@sidecoin/shared";

const STORAGE_KEY = "sidecoin.wallet.v1";

export interface StoredWallet {
  version: 1;
  network: "signet";
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

export function clearWallet(): void {
  storage()?.removeItem(STORAGE_KEY);
}
