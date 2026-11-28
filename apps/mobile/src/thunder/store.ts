// apps/mobile/src/thunder/store.ts
//
// Persistent Thunder account state — the mobile analog of the address index
// + account-key cache the eCash wallet keeps. Three facts make this store
// necessary:
//
//   1. Thunder has no watch-only xpub string, but non-hardened children
//      derive from the account PUBLIC key + chain code — caching that pair
//      (never the seed) lets the app list addresses and sync without a
//      single keychain read.
//   2. The revealed address index is local device state — Thunder cannot
//      recover "how far down the chain did this wallet go" from anywhere.
//      Losing it would re-issue published addresses (privacy) and sync only
//      a shallow prefix, making funds at a high index LOOK missing.
//   3. A gap limit still applies beyond the revealed index (money paid to
//      an address we handed out but never recorded must still be found).
//
// Storage is AsyncStorage (non-secret data only — public keys and counters;
// the mnemonic lives in the platform keychain and is loaded transiently at
// signing time).

import AsyncStorage from "@react-native-async-storage/async-storage";

const REVEALED_INDEX_KEY = "sidecoin.thunder.revealedIndex.v1";
const ACCOUNT_PUB_KEY_KEY = "sidecoin.thunder.accountPubKey.v1";

/** Scope a wallet's state to one Thunder deployment (betanet keys differ
 * from mainnet keys — different schemes, never mixed). */
function scopedKey(base: string, walletId: string, chain: string): string {
  return `${base}.${walletId}.${chain}`;
}

export interface StoredAccountPublicKey {
  /** Compressed ristretto255 point, 32 bytes, hex. */
  point: string;
  /** Chain code, 32 bytes, hex. */
  chainCode: string;
  /** Which scheme derived it ("thunder-v18" | "thunder-v19"). */
  scheme: string;
}

export async function loadRevealedIndex(walletId: string, chain: string): Promise<number> {
  const raw = await AsyncStorage.getItem(scopedKey(REVEALED_INDEX_KEY, walletId, chain));
  const n = raw === null ? 0 : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export async function saveRevealedIndex(index: number, walletId: string, chain: string): Promise<void> {
  await AsyncStorage.setItem(scopedKey(REVEALED_INDEX_KEY, walletId, chain), String(index));
}

export async function loadAccountPublicKey(
  walletId: string,
  chain: string,
): Promise<StoredAccountPublicKey | null> {
  const raw = await AsyncStorage.getItem(scopedKey(ACCOUNT_PUB_KEY_KEY, walletId, chain));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAccountPublicKey;
    if (typeof parsed.point === "string" && typeof parsed.chainCode === "string") {
      return parsed;
    }
  } catch {
    // fall through to null
  }
  return null;
}

export async function saveAccountPublicKey(
  key: StoredAccountPublicKey,
  walletId: string,
  chain: string,
): Promise<void> {
  await AsyncStorage.setItem(scopedKey(ACCOUNT_PUB_KEY_KEY, walletId, chain), JSON.stringify(key));
}

/** Forget everything a wallet kept for one chain (wallet removal). */
export async function forgetThunderAccount(walletId: string, chain: string): Promise<void> {
  await AsyncStorage.removeItem(scopedKey(REVEALED_INDEX_KEY, walletId, chain));
  await AsyncStorage.removeItem(scopedKey(ACCOUNT_PUB_KEY_KEY, walletId, chain));
}
