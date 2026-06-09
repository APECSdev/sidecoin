// packages/shared/src/wallet/derivation.ts
//
// HD key derivation → receive addresses for the eCash (Sztorc drivechain
// fork) wallet. This module covers the L1 / Bitcoin-derived chains
// (mainnet, testnet, signet, regtest, l2l-signet) ONLY.
//
// Scheme: BIP-84 native SegWit (P2WPKH, "bc1q…" / "tb1q…").
//   path:    m/84'/{coinType}'/0'/0/{index}
//   coinType: 0 for mainnet, 1 for every test network (BIP-44 registry)
//   pubkey:  33-byte compressed secp256k1 (from @scure/bip32 HDKey)
//   address: bech32(hrp, witnessVersion=0, hash160(pubkey))
//   hash160: ripemd160(sha256(pubkey))
//
// The L2 drivechains (Thunder, BitAssets, …) use an entirely different
// scheme (ed25519 SLIP-0010 m/1'/0'/0'/i' → blake3 → base58) and are
// handled in a separate module; do NOT route L2 derivation through here.

import { bech32 } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";

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
