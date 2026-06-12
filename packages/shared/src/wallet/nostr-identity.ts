// packages/shared/src/wallet/nostr-identity.ts
//
// HD derivation of the Sidecoin Founder IDENTITY key (NIP-06 Nostr key).
//
// Sibling of signing.ts / derivation.ts, but it derives the canonical FOUNDER
// IDENTITY rather than a spending key. The identity is a NIP-06 Nostr key at
// m/44'/1237'/0'/0/{index} (SLIP-44 coin type 1237 = Nostr). It is
// INTENTIONALLY domain-separated from the BIP-84 spending path
// (m/84'/{coin}'/...), so publishing the public key leaks nothing about the
// wallet's funds — it is meant to be public, exactly like any Nostr npub.
//
//   path:    m/44'/1237'/0'/0/{index}   (coinType FIXED at 1237, NOT network)
//   privkey: 32-byte secp256k1 scalar (from @scure/bip32 HDKey.privateKey)
//   pubkey:  33-byte compressed secp256k1 (from HDKey.publicKey)
//   pubHex:  66-char lowercase hex of the compressed pubkey — this is what the
//            user pastes at /pro checkout and what becomes founders.identity.
//
// The leaderboard derives the NIP-19 npub by stripping the 02/03 compression
// prefix off this compressed key to recover the 32-byte x-only Schnorr key,
// so the publicKeyHex shown in Settings round-trips to the SAME npub the
// leaderboard renders.
//
// ⚠️  SECURITY: the returned `privateKey` is RAW key material. Callers must
//     not log it, persist it, or transmit it. Phase 0 only ever DISPLAYS
//     publicKeyHex; signing with the private half is a Phase 1 concern. This
//     matches the wallet's existing client-side trust model (the mnemonic
//     already lives in plaintext localStorage for signet).

import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { bytesToHex } from "@noble/hashes/utils";

import { normalizeMnemonic, validateMnemonic } from "./mnemonic";

/**
 * SLIP-44 coin type for Nostr (NIP-06). Fixed for ALL networks — a Nostr
 * identity is network-agnostic, unlike the BIP-84 spending path whose
 * coinType switches on mainnet vs test networks.
 */
const NOSTR_COIN_TYPE = 1237;

/**
 * A derived NIP-06 Nostr identity key. publicKeyHex is the canonical Founder
 * identity (founders.identity) and the value pasted at /pro checkout.
 */
export interface NostrIdentityKey {
  /** 32-byte secp256k1 private scalar. RAW key material — handle with care. */
  readonly privateKey: Uint8Array;
  /** 33-byte compressed secp256k1 public key. */
  readonly publicKey: Uint8Array;
  /** 66-char lowercase hex of the compressed public key (founders.identity). */
  readonly publicKeyHex: string;
  /** The full BIP-32 derivation path, e.g. "m/44'/1237'/0'/0/0". */
  readonly path: string;
  /** The address index within m/44'/1237'/0'/0/*. */
  readonly index: number;
}

/**
 * Derive the NIP-06 Nostr IDENTITY key for the Founder system.
 *
 * Mirrors deriveSigningKey()'s structure (same seed/HDKey machinery, empty
 * BIP-39 passphrase) but uses the Nostr path and is network-independent. The
 * empty passphrase matches NIP-06 and the rest of the wallet.
 *
 * @param mnemonic - BIP-39 mnemonic (will be normalized + validated)
 * @param index    - Address index within m/44'/1237'/0'/0/* (default 0)
 * @returns The identity key: private key, compressed pubkey, and 66-hex pubkey
 * @throws If the mnemonic is invalid or key derivation fails
 */
export function deriveNostrIdentityKey(
  mnemonic: string,
  index: number = 0,
): NostrIdentityKey {
  const normalized = normalizeMnemonic(mnemonic);

  if (!validateMnemonic(normalized)) {
    throw new Error(
      "Cannot derive a Nostr identity key from an invalid BIP-39 mnemonic.",
    );
  }

  if (!Number.isInteger(index) || index < 0) {
    throw new Error(
      `Identity index must be a non-negative integer, got ${index}.`,
    );
  }

  // BIP-39 seed (empty passphrase — matches NIP-06 + the wallet default).
  const seed = mnemonicToSeedSync(normalized);

  const root = HDKey.fromMasterSeed(seed);
  const path = `m/44'/${NOSTR_COIN_TYPE}'/0'/0/${index}`;
  const child = root.derive(path);

  // Unlike the receive path, we keep the private key (Phase 1 will sign with
  // it). Both halves are required for a usable identity.
  if (!child.privateKey) {
    throw new Error("Key derivation failed: HDKey produced no private key.");
  }
  if (!child.publicKey) {
    throw new Error("Key derivation failed: HDKey produced no public key.");
  }

  return {
    privateKey: child.privateKey,
    publicKey: child.publicKey,
    publicKeyHex: bytesToHex(child.publicKey),
    path,
    index,
  };
}
