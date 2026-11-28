// packages/shared/src/sidechains/thunder/crypto.ts
//
// ristretto255 group + scalar arithmetic for the Thunder sidechain.
//
// Thunder (thunder-rust, slot 9) signs with FROST(ristretto255, SHA-512)
// single-signer Schnorr and derives keys with a "bip32ish" scheme over the
// ristretto255 group. This module wraps the ristretto255 implementation in
// @noble/curves (RFC 9496) and adds the exact scalar byte conventions
// thunder-rust uses.
//
// Sources (all MIT, read 2026-11-27):
//   - thunder-rust v0.19.3 lib/wallet/bip32.rs (scalar_from_uniform_be_bytes)
//   - curve25519-dalek Scalar semantics: LE canonical serialization,
//     from_bytes_mod_order_wide = little-endian 512-bit reduce mod ℓ
//   - frost-core @ 0966bd1 (pinned by thunder-rust Cargo.toml):
//     hash_to_scalar = SHA-512 output → from_bytes_mod_order_wide (LE wide)
//
// Conventions:
//   - Scalars are JS bigint, always reduced mod ℓ (the ed25519 group order).
//   - "LE bytes"  = canonical little-endian 32-byte serialization, exactly
//     what curve25519-dalek's Scalar::to_bytes produces and what the
//     bip32ish codec::PrimeField feeds into hardened derivation.
//   - "BE reduce" = interpret bytes as a big-endian integer, reduce mod ℓ
//     (thunder's scalar_from_uniform_be_bytes reverses to LE then reduces).

import { ristretto255 } from "@noble/curves/ed25519.js";

/** The ristretto255 base point (generator) — internal; consumers use
 * baseMul() (the frozen noble instance is not re-exportable under TS4094). */
const RISTRETTO_BASE = ristretto255.Point.BASE;

/** The scalar field order ℓ = 2^252 + 277423177773723535658539250641728161727
 * (ed25519 group order — @noble/curves ristretto255.Point.Fn.ORDER). */
export const GROUP_ORDER = ristretto255.Point.Fn.ORDER as bigint;

/** Reduce x mod ℓ. */
export function modScalar(x: bigint): bigint {
  const r = x % GROUP_ORDER;
  return r >= 0n ? r : r + GROUP_ORDER;
}

/** Canonical little-endian 32-byte serialization of a reduced scalar. */
export function scalarToBytes(s: bigint): Uint8Array {
  const reduced = modScalar(s);
  const out = new Uint8Array(32);
  let v = reduced;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Whether `bytes` is already the canonical LE serialization of a scalar. */
export function isCanonicalScalarBytes(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  const canonical = scalarToBytes(bytesToScalarLe(bytes));
  for (let i = 0; i < 32; i++) {
    if (bytes[i] !== canonical[i]) return false;
  }
  return true;
}

/** Interpret 32 little-endian bytes as an integer (no reduction applied). */
export function bytesToScalarLe(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    v = (v << 8n) | BigInt(bytes[i]);
  }
  return v;
}

/**
 * curve25519-dalek `Scalar::from_bytes_mod_order_wide`: 64 little-endian
 * bytes reduced mod ℓ. Used by frost-core's hash_to_scalar and by nonce
 * generation.
 */
export function scalarFromLeWide(bytes: Uint8Array): bigint {
  return modScalar(bytesToScalarLe(bytes));
}

/**
 * thunder-rust ≥ 0.19 `scalar_from_uniform_be_bytes([u8; 64])`: interpret 64
 * bytes as a big-endian 512-bit integer and reduce mod ℓ. (The Rust code
 * reverses to LE then calls from_bytes_mod_order_wide.)
 */
export function scalarFromBeWide(bytes: Uint8Array): bigint {
  if (bytes.length !== 64) {
    throw new Error(`scalarFromBeWide: expected 64 bytes, got ${bytes.length}`);
  }
  let v = 0n;
  for (let i = 0; i < bytes.length; i++) {
    v = (v << 8n) | BigInt(bytes[i]);
  }
  return modScalar(v);
}

/**
 * thunder-rust 0.18.x `scalar_from_uniform_be_bytes([u8; 32])`: interpret 32
 * bytes as a big-endian 256-bit integer, CLEAR the top 3 bits (the "bias
 * fix", commit 6b4a25f — bias comparable to secp256k1 256-bit reduction),
 * then reduce mod ℓ. (v0.18.1 lib/wallet/bip32.rs.)
 */
export function scalarFromBe32BiasFixed(bytes: Uint8Array): bigint {
  if (bytes.length !== 32) {
    throw new Error(`scalarFromBe32BiasFixed: expected 32 bytes, got ${bytes.length}`);
  }
  let v = BigInt(bytes[0] & 0b0001_1111);
  for (let i = 1; i < 32; i++) {
    v = (v << 8n) | BigInt(bytes[i]);
  }
  return modScalar(v);
}

/** A compressed ristretto255 point (32 bytes). */
export type PointBytes = Uint8Array;

/** Multiply the base point by scalar `s` → compressed point bytes. */
export function baseMul(s: bigint): PointBytes {
  return RISTRETTO_BASE.multiply(modScalar(s)).toBytes();
}

/** Point addition on compressed point bytes. */
export function pointAdd(a: PointBytes, b: PointBytes): PointBytes {
  return ristretto255.Point.fromBytes(a).add(ristretto255.Point.fromBytes(b)).toBytes();
}

/** Scalar multiply a compressed point by scalar `s`. */
export function pointMul(p: PointBytes, s: bigint): PointBytes {
  return ristretto255.Point.fromBytes(p).multiply(modScalar(s)).toBytes();
}

/** Whether the 32 bytes decode to a valid ristretto255 point (RFC 9496). */
export function isValidPoint(p: PointBytes): boolean {
  if (p.length !== 32) return false;
  try {
    ristretto255.Point.fromBytes(p);
    return true;
  } catch {
    return false;
  }
}

/** 64 uniformly random bytes from the platform CSPRNG. */
export function randomBytes64(): Uint8Array {
  const out = new Uint8Array(64);
  crypto.getRandomValues(out);
  return out;
}
