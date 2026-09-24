// apps/mobile/src/keystore.ts
//
// Encrypted keystore for the Sidecoin React Native wallet.
//
// PORT NOTE (security upgrade vs. the Vue original):
//   apps/wallet/src/keystore.ts stores the mnemonic in PLAINTEXT in
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
// ⚠️  The network is limited to non-production networks (betanet,
//     signet). Encryption-at-rest is in place, but a real-funds mnemonic
//     still warrants hardware signing before mainnet support.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Keychain from "react-native-keychain";

import { validateMnemonic, normalizeMnemonic } from "@sidecoin/shared";

/** AsyncStorage key for the non-secret wallet envelope. */
const STORAGE_KEY = "sidecoin.wallet.v1";

/** Keychain service name under which the mnemonic is stored. */
const KEYCHAIN_SERVICE = "app.sidecoin.wallet";

/**
 * Access-control policy applied to the keychain item once the user opts in to
 * biometric unlock. BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE requires a
 * currently-enrolled biometric, and falls back to the device passcode — so a
 * user who later removes their fingerprints still has a way in. Verified in
 * react-native-keychain 10.0.0
 * (android/src/main/java/com/oblador/keychain/KeychainModule.kt:723-740):
 * this value is in BOTH the getUseBiometry and getUsePasscode sets.
 */
const BIOMETRIC_ACCESS_CONTROL =
  Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE;

/** The L1 networks a user can toggle between in Settings. Both are
 *  non-production: betanet = the ECX beta practice network (the default);
 *  signet = the live L2L signet. Betanet is a mainnet fork, from
 *  drivechain.dev/config. */
export type WalletNetwork = "signet" | "betanet";

/** Runtime allowlist for WalletNetwork. Persisted values are validated
 *  against this set; anything else falls back to DEFAULT_WALLET_NETWORK. */
const WALLET_NETWORKS: readonly WalletNetwork[] = [
  "signet",
  "betanet",
];

/** Network used when a stored wallet has no (or an unknown) network field. */
const DEFAULT_WALLET_NETWORK: WalletNetwork = "betanet";

export interface StoredWallet {
  version: 1;
  network: WalletNetwork;
  mnemonic: string;
  createdAt: number;
  /** True when the keychain item is gated behind biometric unlock. */
  biometricsEnabled: boolean;
}

/** Non-secret half of the wallet — everything except the mnemonic. */
interface WalletEnvelope {
  version: 1;
  network: WalletNetwork;
  createdAt: number;
  /**
   * Whether the mnemonic's keychain item carries the biometric access-control
   * policy. Stored here (not in the keychain) so callers can decide whether a
   * read will prompt WITHOUT triggering the prompt to find out.
   *
   * Optional on DISK (pre-biometric records lack it); loadEnvelope() always
   * normalizes it to a boolean, so in-memory envelopes are never undefined.
   */
  biometricsEnabled?: boolean;
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
      // Absent on pre-biometric records, which are un-gated by definition.
      biometricsEnabled: parsed.biometricsEnabled === true,
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
 * Whether this device can perform biometric authentication at all — i.e.
 * the hardware exists AND the user has at least one credential enrolled.
 * `getSupportedBiometryType()` resolves to null when nothing is enrolled, so
 * this is the correct gate before offering the opt-in toggle.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    return (await Keychain.getSupportedBiometryType()) !== null;
  } catch {
    return false;
  }
}

/**
 * Human-readable name of the enrolled biometric modality, or null when none
 * is enrolled. Used for UI copy ("Unlock with fingerprint").
 */
export async function getBiometricLabel(): Promise<string | null> {
  let type: Keychain.BIOMETRY_TYPE | null = null;
  try {
    type = await Keychain.getSupportedBiometryType();
  } catch {
    return null;
  }

  switch (type) {
    case Keychain.BIOMETRY_TYPE.FINGERPRINT:
      return "fingerprint";
    case Keychain.BIOMETRY_TYPE.FACE:
      return "face";
    case Keychain.BIOMETRY_TYPE.IRIS:
      return "iris";
    case Keychain.BIOMETRY_TYPE.TOUCH_ID:
      return "Touch ID";
    case Keychain.BIOMETRY_TYPE.FACE_ID:
      return "Face ID";
    case Keychain.BIOMETRY_TYPE.OPTIC_ID:
      return "Optic ID";
    default:
      return null;
  }
}

/** Options accepted by loadWallet(). */
export interface LoadWalletOptions {
  /**
   * When false, a biometric-gated wallet is only read from the in-memory
   * session cache; the OS prompt is NOT shown. If the session has not been
   * unlocked yet, null is returned instead of prompting. Background reads —
   * a dashboard refresh, a balance poll — pass false so the user is not
   * challenged for a fingerprint every few seconds. Foreground, user-initiated
   * reads leave it at the default (true).
   */
  authenticate?: boolean;
}

/**
 * In-memory session cache for the decrypted mnemonic.
 *
 * WHY THIS EXISTS: once biometric unlock is enabled, every keychain read
 * shows the OS prompt. The Dashboard re-reads the wallet on mount, on network
 * switch, and after each send/receive — so without a cache the user would be
 * asked for a fingerprint just to look at a balance.
 *
 * The cache holds the mnemonic for the lifetime of the process only. It is
 * never persisted, and `clearSession()` drops it on lock/logout. This is the
 * "one-time unlock per session" model: the user authenticates once, and
 * subsequent reads are served from memory.
 */
let sessionWallet: StoredWallet | null = null;

/**
 * Seed the session cache after a successful authentication. Called by
 * loadWallet() when it reads a gated wallet with a real prompt.
 */
function rememberSession(wallet: StoredWallet): void {
  sessionWallet = wallet;
}

/**
 * Drop the cached mnemonic. Call on explicit lock/logout, or when the wallet
 * is cleared or re-saved (which invalidates the cached copy).
 */
export function clearSession(): void {
  sessionWallet = null;
}

/**
 * True when the decrypted mnemonic is already held in memory, so a read will
 * not prompt. Lets UI decide whether to render an "unlock" affordance.
 */
export function isSessionUnlocked(): boolean {
  return sessionWallet !== null;
}

/**
 * Load the full wallet, decrypting the mnemonic from the keychain.
 * Returns null when EITHER half is missing or unreadable — a half-wallet is
 * not usable and must not be treated as present.
 *
 * Three paths, in order:
 *   1. Session cache hit      → return immediately, never prompt.
 *   2. Non-gated wallet       → read the keychain directly (no prompt).
 *   3. Gated wallet           → prompt, then cache for the rest of the
 *                               session. With `authenticate: false` this
 *                               path returns null instead of prompting.
 *
 * A cancelled or failed prompt resolves to null (indistinguishable from "no
 * wallet"), which is the same contract the navigation gate already relies on.
 */
export async function loadWallet(
  options: LoadWalletOptions = {},
): Promise<StoredWallet | null> {
  const envelope = await loadEnvelope();
  if (!envelope) return null;

  const authenticate = options.authenticate !== false;

  // Path 1 — already unlocked this session. Serve from memory so background
  // reads never re-prompt. The envelope is re-read above, so a network change
  // made after the unlock is still reflected.
  if (sessionWallet) {
    return { ...sessionWallet, network: envelope.network };
  }

  // Path 3 guard — a gated wallet with no session cache must not be read
  // silently: doing so would prompt (surprising for a background read) or, on
  // some platforms, throw. Report "not available" and let the caller ask.
  if (envelope.biometricsEnabled && !authenticate) {
    return null;
  }

  const getOptions: Keychain.GetOptions = { service: KEYCHAIN_SERVICE };
  if (envelope.biometricsEnabled) {
    getOptions.accessControl = BIOMETRIC_ACCESS_CONTROL;
    getOptions.authenticationPrompt = {
      title: "Unlock your Sidecoin wallet",
      description: "Authenticate to decrypt your recovery phrase.",
      cancel: "Cancel",
    };
  }

  let credentials: false | Keychain.UserCredentials = false;
  try {
    credentials = await Keychain.getGenericPassword(getOptions);
  } catch {
    return null;
  }
  if (!credentials || typeof credentials.password !== "string" || !credentials.password) {
    return null;
  }

  const wallet: StoredWallet = {
    version: 1,
    network: envelope.network,
    mnemonic: credentials.password,
    createdAt: envelope.createdAt,
    biometricsEnabled: envelope.biometricsEnabled === true,
  };

  // Path 3 — cache the freshly authenticated read so the REST of the session
  // is prompt-free.
  rememberSession(wallet);

  return wallet;
}

/**
 * Persist a new wallet. The mnemonic goes to the keychain (encrypted at
 * rest); the non-secret envelope goes to AsyncStorage.
 *
 * `biometrics` opts the keychain item into biometric access control. It
 * defaults to TRUE — biometric protection is on by default — but a caller may
 * pass false to store an un-gated item. It is validated against device
 * capability first: asking for a policy the device cannot satisfy would write
 * an item that can never be read back, so a device with no enrolled
 * credential stores an un-gated item regardless.
 *
 * Ordering: the keychain write happens FIRST. If it fails we throw before
 * touching AsyncStorage, so we can never leave an envelope that points at a
 * missing mnemonic.
 */
export async function saveWallet(
  mnemonic: string,
  biometrics = true,
): Promise<StoredWallet> {
  const normalized = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalized)) {
    throw new Error("Refusing to store an invalid BIP-39 mnemonic.");
  }

  // Never gate the item behind biometrics the device cannot provide.
  const gate = biometrics && (await isBiometricAvailable());
  const createdAt = Date.now();

  const setOptions: Keychain.SetOptions = { service: KEYCHAIN_SERVICE };
  if (gate) {
    setOptions.accessControl = BIOMETRIC_ACCESS_CONTROL;
    setOptions.authenticationPrompt = {
      title: "Protect your Sidecoin wallet",
      description: "Authenticate to store your recovery phrase.",
      cancel: "Cancel",
    };
  }

  let stored: false | Keychain.Result = false;
  try {
    stored = await Keychain.setGenericPassword("sidecoin", normalized, setOptions);
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
    biometricsEnabled: gate,
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

  // A newly created wallet replaces any prior one: drop the old session.
  clearSession();

  return {
    version: 1,
    network: DEFAULT_WALLET_NETWORK,
    mnemonic: normalized,
    createdAt,
    biometricsEnabled: gate,
  };
}

/**
 * Enable or disable biometric unlock for an existing wallet.
 *
 * The mnemonic must be re-written because Android binds the access-control
 * policy to the cipher that encrypts the item — the policy cannot be changed
 * in place. The caller therefore supplies the plaintext mnemonic it already
 * holds (the user just authenticated to get it).
 *
 * Reports whether the policy actually changed, so the caller can tell the
 * user when the device cannot honor the request.
 */
export async function setBiometricsEnabled(
  mnemonic: string,
  enabled: boolean,
): Promise<boolean> {
  if (enabled && !(await isBiometricAvailable())) {
    return false;
  }

  const normalized = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalized)) {
    throw new Error("Refusing to store an invalid BIP-39 mnemonic.");
  }

  const current = await loadEnvelope();
  if (!current) {
    throw new Error("No wallet found. Create or import a wallet first.");
  }

  // Re-write the secret with the new policy. If this throws, the existing item
  // is untouched and the envelope is not updated — the wallet stays readable.
  const setOptions: Keychain.SetOptions = { service: KEYCHAIN_SERVICE };
  if (enabled) {
    setOptions.accessControl = BIOMETRIC_ACCESS_CONTROL;
    setOptions.authenticationPrompt = {
      title: "Protect your Sidecoin wallet",
      description: "Authenticate to store your recovery phrase.",
      cancel: "Cancel",
    };
  }

  let stored: false | Keychain.Result = false;
  try {
    stored = await Keychain.setGenericPassword("sidecoin", normalized, setOptions);
  } catch (err) {
    throw new Error(
      `Failed to update biometric protection: ${(err as Error).message}`,
    );
  }
  if (!stored) {
    throw new Error("Failed to update biometric protection.");
  }

  const envelope: WalletEnvelope = {
    version: 1,
    network: current.network,
    createdAt: current.createdAt,
    biometricsEnabled: enabled,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (err) {
    throw new Error(
      `Failed to store the wallet metadata: ${(err as Error).message}`,
    );
  }

  // The keychain item was re-written with a new access-control policy, so the
  // cached plaintext no longer matches what a fresh read would produce. Drop
  // it: the next gated read must authenticate against the new item.
  clearSession();

  return true;
}

/**
 * Persist a new network choice (signet or betanet) onto the stored
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
    // Preserve the biometric policy — changing networks must not silently
    // un-gate (or re-gate) the secret.
    biometricsEnabled: current.biometricsEnabled === true,
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
  // Drop the cached plaintext FIRST so a failed keychain wipe below still
  // leaves no reachable copy of the mnemonic in this process.
  clearSession();

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
