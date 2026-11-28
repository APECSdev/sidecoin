// packages/shared/src/sidechains/thunder/keys.ts
//
// Versioned Thunder key derivation — the "bip32ish" scheme over ristretto255.
//
// Thunder changed its key derivation between node releases while keeping the
// signature scheme (FROST ristretto255 Schnorr, since 0.18) and the address
// format (BLAKE3-XOF(pubkey)[..20], base58) IDENTICAL. Both variants derive
// from the same path m/43'/1899'/0'/<slot>'/0'/<index> (bip43 purpose /
// eCash token / purpose 0 / sidechain slot / account / address index), with
// the five account levels hardened and the address index non-hardened below
// 2^31 — only the hash construction differs:
//
//   v0.18 ("thunder-v18", betanet node sha-2ea74b0 2026-10-07):
//     master:  HMAC-SHA512(key="Bitcoin seed", seed) → 64 bytes:
//              scalar = BE(bytes[0..32]) with top 3 bits cleared (bias fix),
//              reduced mod ℓ;  chaincode = bytes[32..64].
//     child:   HMAC-SHA512(key=chaincode, data) → same split.
//              hardened data:  0x00 ‖ scalar_le(32) ‖ be32(i | 0x80000000)
//              non-hardened:  compressed_pk(32) ‖ be32(i)
//
//   v0.19 ("thunder-v19", v0.19.0 2026-10-28 → v0.19.3; signet + eCash
//   mainnet nodes):
//     master:  BLAKE3 derive_key("Thunder seed", seed) XOF → 96 bytes:
//              scalar = BE(bytes[0..64]) reduced mod ℓ (512-bit wide);
//              chaincode = bytes[64..96].
//     child:   BLAKE3 keyed(key=chaincode) XOF → same split.
//              input data identical to v0.18 (the hardened hasher prefixes
//              the same 0x00 byte; the non-hardened hasher does not).
//
// In BOTH variants: child scalar = parent + tweak (mod ℓ), child pubkey =
// parent_pub + tweak·G, and non-hardened children derive identically from
// the PUBLIC side (pubkey + chaincode) — which is what makes watch-only
// address listing possible.
//
// The derivation path is wallet-internal convention, not consensus: a
// self-consistent wallet spends fine on any node ≥ 0.18. Matching the
// convention matters for cross-wallet seed restoration and for parity with
// the node's own wallet. v0.18 is what Layer Two Labs' own betanet Thunder
// deployment runs (and what the eCash.com wallet implements); v0.19 is what
// the signet and eCash-mainnet deployments run.
//
// Sources (all MIT, read 2026-11-27):
//   - thunder-rust v0.19.3 lib/wallet/bip32.rs + lib/wallet/mod.rs
//     (get_signing_key: the path and the ChildIndex hardened/non-hardened
//     mapping)
//   - thunder-rust v0.18.1 lib/wallet/bip32.rs (the HMAC-SHA512 hashers,
//     via git diff v0.18.1..HEAD)
//   - bip32ish 0.1.1 (the structure: KeyInit keyed by chaincode; hardened
//     input = PrimeField(secret) ‖ child number with 0x80000000 set;
//     non-hardened input = GroupEncoding(pubkey) ‖ child number; child =
//     parent + tweak; SecretExtra is a unit type contributing zero bytes)
//   - drivechain.dev/config (node versions per network, fetched live)

import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import { blake3 } from "@noble/hashes/blake3";

import {
  baseMul,
  modScalar,
  pointAdd,
  scalarFromBe32BiasFixed,
  scalarFromBeWide,
  scalarToBytes,
  type PointBytes,
} from "./crypto";

/** The two deployed Thunder key schemes. */
export type ThunderKeySchemeId = "thunder-v18" | "thunder-v19";

export const THUNDER_KEY_SCHEMES: readonly ThunderKeySchemeId[] = [
  "thunder-v18",
  "thunder-v19",
];

/** Slot 9 (THIS_SIDECHAIN in thunder-rust). */
export const THUNDER_SLOT = 9;

/**
 * Which scheme a Thunder deployment uses, per verified node versions
 * (drivechain.dev/config, 2026-11-27):
 *   betanet       → v0.18 (node image sha-2ea74b0, 2026-10-07, pre-0.19)
 *   signet        → v0.19 (node v0.19.3)
 *   eCash mainnet → v0.19 (node v0.19.3)
 */
export function schemeForNetwork(network: "betanet" | "signet" | "mainnet"): ThunderKeySchemeId {
  return network === "betanet" ? "thunder-v18" : "thunder-v19";
}

const HARDENED_OFFSET = 0x8000_0000;

/** Account levels: m/43'/1899'/0'/<slot>'/0' — all hardened. */
const ACCOUNT_LEVELS = [43, 1899, 0, THUNDER_SLOT, 0];

/** An extended private key: secret scalar + chain code. */
export interface ThunderPrivateKey {
  /** Reduced mod ℓ. Serialized little-endian when hashed. */
  readonly scalar: bigint;
  readonly chainCode: Uint8Array;
}

/** The public half of an extended key: enough to derive non-hardened children. */
export interface ThunderPublicKey {
  /** Compressed ristretto255 point, 32 bytes. */
  readonly point: PointBytes;
  readonly chainCode: Uint8Array;
}

function be32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// v0.18 hashers (HMAC-SHA512 family)
// ---------------------------------------------------------------------------

function v18Tweak(key: Uint8Array, data: Uint8Array): { tweak: bigint; chainCode: Uint8Array } {
  const digest = hmac(sha512, key, data);
  return {
    tweak: scalarFromBe32BiasFixed(digest.slice(0, 32)),
    chainCode: digest.slice(32, 64),
  };
}

function v18Master(seed: Uint8Array): ThunderPrivateKey {
  const digest = hmac(sha512, new TextEncoder().encode("Bitcoin seed"), seed);
  return {
    scalar: scalarFromBe32BiasFixed(digest.slice(0, 32)),
    chainCode: digest.slice(32, 64),
  };
}

// ---------------------------------------------------------------------------
// v0.19 hashers (BLAKE3 keyed / derive_key family)
// ---------------------------------------------------------------------------

function v19Tweak(key: Uint8Array, data: Uint8Array): { tweak: bigint; chainCode: Uint8Array } {
  const out = blake3(data, { key, dkLen: 96 });
  return {
    tweak: scalarFromBeWide(out.slice(0, 64)),
    chainCode: out.slice(64, 96),
  };
}

function v19Master(seed: Uint8Array): ThunderPrivateKey {
  const out = blake3(seed, { context: "Thunder seed", dkLen: 96 });
  return {
    scalar: scalarFromBeWide(out.slice(0, 64)),
    chainCode: out.slice(64, 96),
  };
}

// ---------------------------------------------------------------------------
// Derivation (shared structure, per-scheme hashers)
// ---------------------------------------------------------------------------

/** Master key from a BIP39 seed (64 bytes, empty passphrase) for a scheme. */
export function thunderMasterKey(seed: Uint8Array, scheme: ThunderKeySchemeId): ThunderPrivateKey {
  return scheme === "thunder-v18" ? v18Master(seed) : v19Master(seed);
}

/**
 * Hardened child (index ≥ 2^31 semantically; here every account level).
 * Input = key(cc) over 0x00 ‖ scalar_le ‖ be32(i | 0x80000000).
 */
function deriveHardened(parent: ThunderPrivateKey, index: number, scheme: ThunderKeySchemeId): ThunderPrivateKey {
  const data = concat(
    new Uint8Array([0x00]),
    scalarToBytes(parent.scalar),
    be32(index | HARDENED_OFFSET),
  );
  const { tweak, chainCode } = scheme === "thunder-v18"
    ? v18Tweak(parent.chainCode, data)
    : v19Tweak(parent.chainCode, data);
  return { scalar: modScalar(parent.scalar + tweak), chainCode };
}

/**
 * Non-hardened child (address index < 2^31), from the private side.
 * Input = key(cc) over compressed_pk ‖ be32(i).
 */
export function deriveAddressKey(
  account: ThunderPrivateKey,
  index: number,
  scheme: ThunderKeySchemeId,
): ThunderPrivateKey {
  if (index >= HARDENED_OFFSET) {
    // bip32ish::ChildIndex::from maps ≥ 2^31 to hardened; Thunder address
    // indices are always small non-hardened numbers in practice.
    return deriveHardened(account, index, scheme);
  }
  const data = concat(baseMul(account.scalar), be32(index));
  const { tweak, chainCode } = scheme === "thunder-v18"
    ? v18Tweak(account.chainCode, data)
    : v19Tweak(account.chainCode, data);
  return { scalar: modScalar(account.scalar + tweak), chainCode };
}

/**
 * Non-hardened child from the PUBLIC side — watch-only address listing.
 * Must equal deriveAddressKey(deriveAccountKey(seed), index).publicKey.
 */
export function deriveAddressPublicKey(
  account: ThunderPublicKey,
  index: number,
  scheme: ThunderKeySchemeId,
): PointBytes {
  if (index >= HARDENED_OFFSET) {
    throw new Error("Public derivation cannot produce a hardened child");
  }
  const data = concat(account.point, be32(index));
  const { tweak, chainCode } = scheme === "thunder-v18"
    ? v18Tweak(account.chainCode, data)
    : v19Tweak(account.chainCode, data);
  return pointAdd(account.point, baseMul(tweak));
}

/** The public half of an extended private key. */
export function toPublicKey(key: ThunderPrivateKey): ThunderPublicKey {
  return { point: baseMul(key.scalar), chainCode: key.chainCode };
}

/**
 * The account key at m/43'/1899'/0'/9'/0' — derive once per wallet, then
 * derive address keys from it (the 5 hardened levels + BIP39 seed
 * computation run once, not per address).
 */
export function deriveAccountKey(seed: Uint8Array, scheme: ThunderKeySchemeId): ThunderPrivateKey {
  let key = thunderMasterKey(seed, scheme);
  for (const level of ACCOUNT_LEVELS) {
    key = deriveHardened(key, level, scheme);
  }
  return key;
}

/** Printable derivation path of an address index (display only). */
export function derivationPath(index: number): string {
  return `m/${ACCOUNT_LEVELS.map((l) => `${l}'`).join("/")}/${index}`;
}
