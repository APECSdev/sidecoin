// packages/shared/src/wallet/derivation.ts
//
// HD key derivation → receive addresses. Two distinct schemes live here:
//
//   L1 (Bitcoin-derived chains: mainnet, testnet, signet, regtest):
//     BIP-84 native SegWit (P2WPKH) — deriveReceiveAddress()
//
//   L2 (Thunder / BitAssets drivechains):
//     SLIP-0010 ed25519 + blake3 + base58 — deriveDrivechainAddress()
//
// ---------------------------------------------------------------------------
// L1 — BIP-84 native SegWit (P2WPKH, "bc1q…" / "tb1q…").
//   path:    m/84'/{coinType}'/0'/0/{index}
//   coinType: 0 for mainnet, 1 for every test network (BIP-44 registry)
//   pubkey:  33-byte compressed secp256k1 (from @scure/bip32 HDKey)
//   address: bech32(hrp, witnessVersion=0, hash160(pubkey))
//   hash160: ripemd160(sha256(pubkey))
//
// L2 — Thunder drivechain receive address (matches thunder-rust exactly):
//   seed:    bip39 seed, EMPTY passphrase   (tiny-bip39 Seed::new(.., ""))
//   key:     SLIP-0010 ed25519, path m/1'/0'/0'/{index}'  (ALL hardened)
//   pubkey:  RAW 32-byte ed25519 key (verifying_key.to_bytes()), NOT the
//            33-byte 00-prefixed SLIP-0010 serialization form
//   hash:    blake3 XOF → first 20 bytes
//   address: base58(hash)  — Bitcoin alphabet, NO checksum, NO version byte
//   index:   Thunder issues addresses starting at 1 (index 0 is never used)
//
// Both Thunder (slot 9) and BitAssets (slot 4) use the identical scheme;
// the receive address does NOT depend on THIS_SIDECHAIN. The s{n}_…_{csum}
// deposit wrapper (Address::format_for_deposit) is a separate concern and
// is intentionally NOT produced here.

import { bech32, base58 } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { HDKey as Slip10HDKey } from "micro-key-producer/slip10.js";
import { mnemonicToSeedSync } from "@scure/bip39";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { blake3 } from "@noble/hashes/blake3";

import type { NetworkId } from "../types/network";
import { getNetworkOrThrow } from "../chain";
import { normalizeMnemonic, validateMnemonic } from "./mnemonic";

/**
 * BIP-143 hash160: RIPEMD-160(SHA-256(data)).
 * For P2WPKH the input is the 33-byte compressed public key.
 */
function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

/**
 * SLIP-0044 coin type. eCash inherits Bitcoin's registry slots at the
 * fork point: 0 for the production chain, 1 for all test networks.
 */
function coinTypeFor(network: NetworkId): number {
  return network === "mainnet" ? 0 : 1;
}

/**
 * Derive a BIP-84 native-SegWit (P2WPKH) receive address.
 *
 * @param mnemonic - BIP-39 mnemonic (will be normalized + validated)
 * @param network  - Target network; selects coinType + bech32 HRP
 * @param index    - Address index within m/84'/coin'/0'/0/* (default 0)
 * @returns The bech32 receive address, e.g. "tb1q…" (signet) / "bc1q…" (main)
 * @throws If the mnemonic is invalid or key derivation fails
 */
export function deriveReceiveAddress(
  mnemonic: string,
  network: NetworkId,
  index: number = 0,
): string {
  const normalized = normalizeMnemonic(mnemonic);

  if (!validateMnemonic(normalized)) {
    throw new Error("Cannot derive an address from an invalid BIP-39 mnemonic.");
  }

  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Address index must be a non-negative integer, got ${index}.`);
  }

  const config = getNetworkOrThrow(network);
  const hrp = config.bech32.hrp;
  const coinType = coinTypeFor(network);

  // BIP-39 seed (empty passphrase — matches wallet default).
  const seed = mnemonicToSeedSync(normalized);

  const root = HDKey.fromMasterSeed(seed);
  const path = `m/84'/${coinType}'/0'/0/${index}`;
  const child = root.derive(path);

  if (!child.publicKey) {
    throw new Error("Key derivation failed: HDKey produced no public key.");
  }

  // P2WPKH: witness version 0 followed by the 20-byte key hash.
  const program = hash160(child.publicKey);
  const words = [0, ...bech32.toWords(program)];

  return bech32.encode(hrp, words);
}

/**
 * Derive a Thunder / BitAssets drivechain (L2) receive address.
 *
 * Mirrors thunder-rust's `Wallet::get_signing_key` + `get_address`
 * byte-for-byte:
 *
 *   seed   = bip39 seed (empty passphrase)
 *   key    = SLIP-0010 ed25519, m/1'/0'/0'/{index}'
 *   digest = blake3_xof(verifying_key.to_bytes())[..20]
 *   addr   = base58(digest)   // raw, no checksum, no version byte
 *
 * Thunder's `get_new_address` issues addresses starting at index 1 and
 * increments; index 0 is never used on-chain. We therefore default to 1
 * and reject lower values so a derived address always corresponds to one
 * Thunder can actually issue.
 *
 * The address is identical across Thunder (slot 9) and BitAssets (slot 4) —
 * it does not depend on the sidechain slot. This returns the bare base58
 * address, NOT the `s{slot}_…_{checksum}` deposit string.
 *
 * @param mnemonic - BIP-39 mnemonic (will be normalized + validated)
 * @param index    - Hardened address index (>= 1, default 1)
 * @returns The base58 drivechain address (20-byte blake3 digest)
 * @throws If the mnemonic is invalid, index < 1, or derivation fails
 */
export function deriveDrivechainAddress(
  mnemonic: string,
  index: number = 1,
): string {
  const normalized = normalizeMnemonic(mnemonic);

  if (!validateMnemonic(normalized)) {
    throw new Error("Cannot derive an address from an invalid BIP-39 mnemonic.");
  }

  // Thunder never issues index 0 (get_new_address starts at last_index + 1
  // on an empty wallet, i.e. 1). Reject it so derived addresses match.
  if (!Number.isInteger(index) || index < 1) {
    throw new Error(
      `Drivechain address index must be an integer >= 1, got ${index}.`,
    );
  }

  // BIP-39 seed (empty passphrase — matches tiny-bip39 Seed::new(.., "")).
  const seed = mnemonicToSeedSync(normalized);

  // SLIP-0010 ed25519, all-hardened path m/1'/0'/0'/{index}'.
  const root = Slip10HDKey.fromMasterSeed(seed);
  const path = `m/1'/0'/0'/${index}'`;
  const child = root.derive(path);

  // Thunder hashes the RAW 32-byte ed25519 public key
  // (verifying_key.to_bytes()) — NOT the 33-byte 00-prefixed form.
  const pubkey = child.publicKeyRaw;

  if (!pubkey || pubkey.length !== 32) {
    throw new Error(
      "Key derivation failed: expected a 32-byte ed25519 public key.",
    );
  }

  // blake3 XOF → first 20 bytes (blake3's hash output is its XOF stream,
  // so dkLen:20 == Rust's finalize_xof().fill(&mut [0u8; 20])).
  const digest = blake3(pubkey, { dkLen: 20 });

  // base58, Bitcoin alphabet, no checksum, no version byte.
  return base58.encode(digest);
}
