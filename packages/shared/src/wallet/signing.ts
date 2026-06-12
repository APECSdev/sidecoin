// packages/shared/src/wallet/signing.ts
//
// HD PRIVATE-KEY derivation for L1 SIGNING (BIP-84 native SegWit, P2WPKH).
//
// This is the security-critical sibling of derivation.ts. Where
// deriveReceiveAddress() derives the @scure/bip32 child and keeps only the
// PUBLIC key (to build an address), deriveSigningKey() keeps the PRIVATE key
// as well — it is the input the transaction signer (step 2) feeds to
// @scure/btc-signer to produce a BIP-143 witness.
//
//   path:    m/84'/{coinType}'/0'/0/{index}   (identical to the receive path)
//   coinType: 0 for mainnet, 1 for every test network (BIP-44 registry)
//   privkey: 32-byte secp256k1 scalar (from @scure/bip32 HDKey.privateKey)
//   pubkey:  33-byte compressed secp256k1
//   spk:     P2WPKH scriptPubKey = OP_0 <0x14> hash160(pubkey)
//   address: bech32(hrp, witnessVersion=0, hash160(pubkey))  — same as receive
//
// ⚠️  SECURITY: the returned`privateKey` is RAW key material. Callers must
//     not log it, persist it, or transmit it. It exists only to sign locally
//     in-process; only the resulting signed tx hex ever leaves the device.
//     This matches the wallet's existing client-side trust model (the
//     mnemonic already lives in plaintext localStorage for signet).

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
 * A derived BIP-84 signing key plus everything the transaction builder needs
 * to spend the output it controls.`scriptPubKey` and`address` describe the
 * SAME output two ways: the raw witness program (for tx construction / BIP-143
 * sighash) and its bech32 encoding (for display / matching UTXOs by address).
 */
export interface SigningKey {
  /** 32-byte secp256k1 private scalar. RAW key material — handle with care. */
  readonly privateKey: Uint8Array;
  /** 33-byte compressed secp256k1 public key. */
  readonly publicKey: Uint8Array;
  /** The P2WPKH receive address (identical to deriveReceiveAddress's output). */
  readonly address: string;
  /** P2WPKH scriptPubKey: OP_0 <0x14> <20-byte hash160(pubkey)> (22 bytes). */
  readonly scriptPubKey: Uint8Array;
  /** The full BIP-32 derivation path, e.g. "m/84'/1'/0'/0/0". */
  readonly path: string;
  /** The network this key was derived for. */
  readonly network: NetworkId;
  /** The address index within m/84'/coin'/0'/0/*. */
  readonly index: number;
}

/**
 * Derive a BIP-84 native-SegWit (P2WPKH) SIGNING key.
 *
 * Mirrors deriveReceiveAddress() exactly (same path, coinType, HRP) but
 * additionally returns the private key and the raw scriptPubKey so the tx
 * builder can sign. The address it returns is guaranteed identical to
 * deriveReceiveAddress(mnemonic, network, index) for the same inputs.
 *
 * @param mnemonic - BIP-39 mnemonic (will be normalized + validated)
 * @param network  - Target network; selects coinType + bech32 HRP
 * @param index    - Address index within m/84'/coin'/0'/0/* (default 0)
 * @returns The signing key, public key, address, and scriptPubKey
 * @throws If the mnemonic is invalid or key derivation fails
 */
export function deriveSigningKey(
  mnemonic: string,
  network: NetworkId,
  index: number = 0,
): SigningKey {
  const normalized = normalizeMnemonic(mnemonic);

  if (!validateMnemonic(normalized)) {
    throw new Error(
      "Cannot derive a signing key from an invalid BIP-39 mnemonic.",
    );
  }

  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Address index must be a non-negative integer, got ${index}.`);
  }

  const config = getNetworkOrThrow(network);
  const hrp = config.bech32.hrp;
  const coinType = coinTypeFor(network);

  // BIP-39 seed (empty passphrase — matches wallet default + receive path).
  const seed = mnemonicToSeedSync(normalized);

  const root = HDKey.fromMasterSeed(seed);
  const path =`m/84'/${coinType}'/0'/0/${index}`;
  const child = root.derive(path);

  // Unlike the receive path, we REQUIRE the private key here.
  if (!child.privateKey) {
    throw new Error("Key derivation failed: HDKey produced no private key.");
  }
  if (!child.publicKey) {
    throw new Error("Key derivation failed: HDKey produced no public key.");
  }

  // P2WPKH witness program: the 20-byte hash160 of the compressed pubkey.
  const program = hash160(child.publicKey);

  // scriptPubKey = OP_0 (0x00) <push 20 bytes> (0x14) <program>.
  const scriptPubKey = new Uint8Array(2 + program.length);
  scriptPubKey[0] = 0x00; // OP_0 — witness version 0
  scriptPubKey[1] = program.length; // 0x14 — 20-byte data push
  scriptPubKey.set(program, 2);

  // Same bech32 encoding as deriveReceiveAddress, so address round-trips.
  const words = [0, ...bech32.toWords(program)];
  const address = bech32.encode(hrp, words);

  return {
    privateKey: child.privateKey,
    publicKey: child.publicKey,
    address,
    scriptPubKey,
    path,
    network,
    index,
  };
}
