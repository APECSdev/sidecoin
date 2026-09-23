// packages/mobile/src/keystore.ts
//
// Encrypted keystore for the Sidecoin React Native wallet.
//
// PORT NOTE (security upgrade vs. the Vue original):
//   packages/wallet/src/keystore.ts stores the mnemonic in PLAINTEXT in
//   localStorage. That is acceptable only for throwaway signet funds.
//
//   The React Native port ships ENCRYPTED-AT-REST FROM DAY ONE, as required:
//     • the mnemonic lives in the platform keychain / keystore
//       (react-native-keychain → Android Keystore-backed), and
//     • only non-secret metadata (version / network / createdAt) lives in
//       AsyncStorage, where it is safe to read without unlocking.
//
//   The public API is async because both backends are async. `hasWallet()`
//   is therefore async, which matters for the navigation gate in the router.
//
// ⚠️  The network is limited to non-production networks (signet, alphanet,
//     betanet). Encryption-at-rest is in place, but a real-funds mnemonic
//     still warrants hardware signing before mainnet support.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Keychain from "react-native-keychain";

import { validateMnemonic, normalizeMnemonic } from "@sidecoin/shared";

/** AsyncStorage key for the non-secret wallet envelope. */
const STORAGE_KEY = "sidecoin.wallet.v1";

/** Keychain service name under which the mnemonic is stored. */
const KEYCHAIN_SERVICE = "app.sidecoin.wallet";

/** The L1 networks a user can toggle between in Settings. All are
 *  non-production: signet = the live L2L signet; alphanet = the ECX alpha
 *  practice network; betanet = the ECX beta practice network (the default).
 *  Both alphanet and betanet are mainnet forks, from drivechain.dev/config. */
export type WalletNetwork = "signet" | "alphanet" | "betanet";

/** Runtime allowlist for WalletNetwork. Persisted values are validated
 *  against this set; anything else falls back to DEFAULT_WALLET_NETWORK. */
const WALLET_NETWORKS: readonly WalletNetwork[] = [
  "signet",
  "alphanet",
  "betanet",
];

/** Network used when a stored wallet has no (or an unknown) network field. */
const DEFAULT_WALLET_NETWORK: WalletNetwork = "betanet";

export interface StoredWallet {
  version: 1;
  network: WalletNetwork;
  mnemonic: string;
  createdAt: number;
}

/** Non-secret half of the wallet — everything except the mnemonic. */
interface WalletEnvelope {
  version: 1;
  network: WalletNetwork;
  createdAt: number;
}

function isWalletNetwork(value: unknown): value is WalletNetwork {
  return typeof value === "string" && (WALLET_NETWORKS as readonly string[]).includes(value);
}

/**
 * Read the non-secret envelope. Returns null when absent or corrupt.
 * Unknown/invalid network values fall back to DEFAULT_WALLET_NETWORK so a
 * forward-incompatible record never blocks access.
 */
async function loadEnvelope(): Promise<WalletEnvelope | null> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as WalletEnvelope;
    if (parsed?.version !== 1) return null;
    return {
      version: 1,
      network: isWalletNetwork(parsed.network) ? parsed.network : DEFAULT_WALLET_NETWORK,
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    };
  } catch {
    return null; // corrupt entry — treat as no wallet
  }
}

/**
 * True when a wallet exists. Async because the envelope and (on some
 * platforms) the keychain are both async. The Vue original was sync; the
 * router gate awaits this instead.
 */
export async function hasWallet(): Promise<boolean> {
  return (await loadWallet()) !== null;
}

/**
 * Load the full wallet, decrypting the mnemonic from the keychain.
 * Returns null when EITHER half is missing or unreadable — a half-wallet is
 * not usable and must not be treated as present.
 */
export async function loadWallet(): Promise<StoredWallet | null> {
  const envelope = await loadEnvelope();
  if (!envelope) return null;

  let credentials: false | Keychain.UserCredentials = false;
  try {
    credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch {
    return null;
  }
  if (!credentials || typeof credentials.password !== "string" || !credentials.password) {
    return null;
  }

  return {
    version: 1,
    network: envelope.network,
    mnemonic: credentials.password,
    createdAt: envelope.createdAt,
  };
}

/**
 * Persist a new wallet. The mnemonic goes to the keychain (encrypted at
 * rest); the non-secret envelope goes to AsyncStorage.
 *
 * Ordering: the keychain write happens FIRST. If it fails we throw before
 * touching AsyncStorage, so we can never leave an envelope that points at a
 * missing mnemonic.
 */
export async function saveWallet(mnemonic: string): Promise<StoredWallet> {
  const normalized = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalized)) {
    throw new Error("Refusing to store an invalid BIP-39 mnemonic.");
  }

  const createdAt = Date.now();

  let stored: false | Keychain.Result = false;
  try {
    stored = await Keychain.setGenericPassword("sidecoin", normalized, {
      service: KEYCHAIN_SERVICE,
    });
  } catch (err) {
    throw new Error(
      `Failed to store the wallet in the device keychain: ${(err as Error).message}`,
    );
  }
  if (!stored) {
    throw new Error("Failed to store the wallet in the device keychain.");
  }

  const envelope: WalletEnvelope = {
    version: 1,
    network: DEFAULT_WALLET_NETWORK,
    createdAt,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (err) {
    // Roll the keychain write back so we don't strand a mnemonic with no
    // envelope, which would make the wallet permanently unreachable.
    try {
      await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
    } catch {
      // best-effort rollback
    }
    throw new Error(
      `Failed to store the wallet metadata: ${(err as Error).message}`,
    );
  }

  return {
    version: 1,
    network: DEFAULT_WALLET_NETWORK,
    mnemonic: normalized,
    createdAt,
  };
}

/**
 * Persist a new network choice (signet, alphanet, or betanet) onto the stored
 * wallet. The mnemonic is untouched; only the envelope's `network` changes.
 *
 * PORT NOTE: the Vue original emitted a `window` CustomEvent here so live
 * views re-derived and re-fetched. RN has no DOM event bus; callers re-read
 * the wallet after this resolves. Throws if there is no stored wallet.
 */
export async function setWalletNetwork(network: WalletNetwork): Promise<StoredWallet> {
  const current = await loadWallet();
  if (!current) {
    throw new Error("No wallet found. Create or import a wallet first.");
  }

  const envelope: WalletEnvelope = {
    version: 1,
    network,
    createdAt: current.createdAt,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (err) {
    throw new Error(
      `Failed to update the wallet network: ${(err as Error).message}`,
    );
  }

  return { ...current, network };
}

/** Remove both halves of the wallet (best-effort). */
export async function clearWallet(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch {
    // best-effort — continue and clear the metadata
  }
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}
