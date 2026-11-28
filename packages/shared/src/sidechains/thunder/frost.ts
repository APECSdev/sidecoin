// packages/shared/src/sidechains/thunder/frost.ts
//
// FROST(ristretto255, SHA-512) single-signer Schnorr — the Thunder
// signature scheme since thunder-rust 0.18.0 (unchanged through 0.19.3;
// the 0.18→0.19 types/authorization.rs diff is an import refactor only).
//
// Exact semantics from frost-core @ 0966bd1529aa062ad3b621af99e277f976b1c0f0
// (the revision thunder-rust Cargo.toml pins; frost-ristretto255 +
// frost-core/src/signing_key.rs default_sign, lib.rs challenge()):
//
//   sign(sk, msg):
//     k  = random_nonzero()          // 64 random bytes, wide-LE reduced mod ℓ
//     R  = k·G
//     c  = H2(R ‖ VK ‖ msg)         // SHA-512("FROST-RISTRETTO255-SHA512-v1"
//                                   //   ‖ "chal" ‖ R ‖ VK ‖ msg) → wide-LE
//                                   //   reduced mod ℓ
//     z  = k + c·sk  (mod ℓ)
//     signature = R ‖ z              // 32 + 32 = 64 bytes
//
//   verify(VK, sig, msg):
//     z·G == R + c·VK, with R a valid point and z a canonical scalar.
//
// The message is whatever Thunder signs: the ENTIRE canonical Borsh
// serialization of the transaction (authorization.rs::sign — there is no
// sighash, no per-input message, no script, no flags).

import { sha512 } from "@noble/hashes/sha512";

import {
  baseMul,
  isCanonicalScalarBytes,
  isValidPoint,
  modScalar,
  pointAdd,
  pointMul,
  randomBytes64,
  scalarFromLeWide,
  scalarToBytes,
  type PointBytes,
} from "./crypto";

/** "FROST-RISTRETTO255-SHA512-v1" (frost-ristretto255/src/lib.rs:151). */
const CONTEXT_STRING = "FROST-RISTRETTO255-SHA512-v1";

/** H2 domain separator (frost-ristretto255 hash_to_scalar, b"chal"). */
const CHALLENGE_TAG = "chal";

export const SIGNATURE_LENGTH = 64;

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
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

/**
 * FROST H2 challenge over (R ‖ VK ‖ msg):
 * SHA-512(context ‖ "chal" ‖ R ‖ VK ‖ msg) reduced mod ℓ (wide-LE).
 */
export function frostChallenge(r: PointBytes, publicKey: PointBytes, message: Uint8Array): bigint {
  const digest = sha512(
    concat(utf8(CONTEXT_STRING), utf8(CHALLENGE_TAG), r, publicKey, message),
  );
  return scalarFromLeWide(digest);
}

/** A uniformly random nonzero scalar (frost-core random_nonzero). */
function randomNonzeroScalar(): bigint {
  // 8 attempts, then give up — probability of 8 consecutive zero scalars
  // is cryptographically nonexistent.
  for (let i = 0; i < 8; i++) {
    const k = scalarFromLeWide(randomBytes64());
    if (k !== 0n) return k;
  }
  throw new Error("FROST: could not generate a nonzero nonce");
}

/**
 * Sign `message` with the 32-byte-canonical secret scalar `secret`.
 * Returns the 64-byte `R ‖ z` signature.
 */
export function frostSign(message: Uint8Array, secret: bigint): Uint8Array {
  const publicKey = baseMul(secret);
  const k = randomNonzeroScalar();
  const r = baseMul(k);
  const c = frostChallenge(r, publicKey, message);
  const z = modScalar(k + modScalar(c * secret));
  const sig = new Uint8Array(SIGNATURE_LENGTH);
  sig.set(r, 0);
  sig.set(scalarToBytes(z), 32);
  return sig;
}

/**
 * Verify a 64-byte `R ‖ z` signature. Rejects non-canonical z and invalid
 * points, exactly as frost-core does.
 */
export function frostVerify(signature: Uint8Array, publicKey: PointBytes, message: Uint8Array): boolean {
  if (signature.length !== SIGNATURE_LENGTH) return false;
  if (!isValidPoint(publicKey)) return false;
  const r = signature.slice(0, 32);
  const zBytes = signature.slice(32, 64);
  if (!isValidPoint(r)) return false;
  if (!isCanonicalScalarBytes(zBytes)) return false;
  const z = scalarFromLeWide(zBytes);
  if (z === 0n) return false;
  const c = frostChallenge(r, publicKey, message);
  // z·G == R + c·VK
  const lhs = baseMul(z);
  const rhs = pointAdd(r, pointMul(publicKey, c));
  for (let i = 0; i < 32; i++) {
    if (lhs[i] !== rhs[i]) return false;
  }
  return true;
}
