// packages/shared/src/__tests__/thunder-frost.test.ts
//
// FROST(ristretto255, SHA-512) single-signer Schnorr — the Thunder
// signature scheme. The rules are pinned from frost-core @ 0966bd1 (the
// rev thunder-rust pins); correctness is proven by sign/verify round trips
// against independently-computed challenges, tamper rejection, canonicality
// rejection, and cross-verification with @noble/curves' own group math.

import { describe, expect, it } from "vitest";
import { sha512 } from "@noble/hashes/sha512";
import { ristretto255 } from "@noble/curves/ed25519.js";

import {
  frostChallenge,
  frostSign,
  frostVerify,
  SIGNATURE_LENGTH,
} from "../sidechains/thunder/frost";
import {
  baseMul,
  isValidPoint,
  modScalar,
  scalarFromLeWide,
  scalarToBytes,
} from "../sidechains/thunder/crypto";

const CONTEXT = "FROST-RISTRETTO255-SHA512-v1";

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("FROST ristretto255 single-signer Schnorr", () => {
  it("sign → verify round trip over arbitrary messages", () => {
    for (const msg of [
      new Uint8Array(0),
      new Uint8Array([1, 2, 3]),
      new Uint8Array(256).fill(0xab),
    ]) {
      const secret = scalarFromLeWide(new Uint8Array(64).fill(0x42));
      const publicKey = baseMul(secret);
      const sig = frostSign(msg, secret);
      expect(sig.length).toBe(SIGNATURE_LENGTH);
      expect(frostVerify(sig, publicKey, msg)).toBe(true);
    }
  });

  it("two signatures over the same message differ (fresh nonce) but both verify", () => {
    const secret = 1234567890123456789012345678901234567890n;
    const publicKey = baseMul(secret);
    const msg = utf8("same message");
    const sig1 = frostSign(msg, secret);
    const sig2 = frostSign(msg, secret);
    expect(sig1).not.toEqual(sig2);
    expect(frostVerify(sig1, publicKey, msg)).toBe(true);
    expect(frostVerify(sig2, publicKey, msg)).toBe(true);
  });

  it("challenge is SHA-512(context ‖ 'chal' ‖ R ‖ VK ‖ msg) reduced mod ℓ (wide-LE)", () => {
    const secret = 987654321n;
    const publicKey = baseMul(secret);
    const r = baseMul(555n);
    const msg = utf8("challenge vector");
    const c = frostChallenge(r, publicKey, msg);
    const digest = sha512(
      new Uint8Array([
        ...utf8(CONTEXT),
        ...utf8("chal"),
        ...r,
        ...publicKey,
        ...msg,
      ]),
    );
    expect(c).toBe(scalarFromLeWide(digest));
  });

  it("cross-checks against @noble/curves group math: z·G == R + c·VK", () => {
    const secret = 0xdeadbeefn * 0x10001n;
    const publicKey = baseMul(secret);
    const msg = utf8("cross-check");
    const sig = frostSign(msg, secret);
    const r = sig.slice(0, 32);
    const z = scalarFromLeWide(sig.slice(32, 64));
    const c = frostChallenge(r, publicKey, msg);
    const lhs = ristretto255.Point.BASE.multiply(z);
    const rhs = ristretto255.Point.fromBytes(r).add(
      ristretto255.Point.fromBytes(publicKey).multiply(c),
    );
    expect(lhs.toBytes()).toEqual(rhs.toBytes());
  });

  it("rejects a tampered message, signature, or public key", () => {
    const secret = 424242n;
    const publicKey = baseMul(secret);
    const msg = utf8("payload");
    const sig = frostSign(msg, secret);
    const flipped = Uint8Array.from(msg);
    if (flipped.length > 0) flipped[0] ^= 0x01;
    expect(frostVerify(sig, publicKey, flipped)).toBe(false);

    const badSig = Uint8Array.from(sig);
    badSig[10] ^= 0x01;
    expect(frostVerify(badSig, publicKey, msg)).toBe(false);

    const badKey = Uint8Array.from(publicKey);
    badKey[7] ^= 0x01;
    expect(frostVerify(sig, badKey, msg)).toBe(false);
  });

  it("rejects wrong lengths, invalid points, and non-canonical scalars", () => {
    const secret = 777n;
    const publicKey = baseMul(secret);
    const msg = utf8("canon");
    const sig = frostSign(msg, secret);
    expect(frostVerify(sig.slice(0, 63), publicKey, msg)).toBe(false);

    // R replaced by a non-canonical point encoding.
    const badR = Uint8Array.from(sig);
    badR[0] = 0xff; badR[1] = 0xff; badR[2] = 0xff;
    expect(frostVerify(badR, publicKey, msg)).toBe(false);

    // z ≥ ℓ (non-canonical): reduce(z) != z bytes.
    const nonCanonical = Uint8Array.from(sig);
    new Uint8Array(32).forEach((_, i) => {
      nonCanonical[32 + i] = 0xff;
    });
    expect(frostVerify(nonCanonical, publicKey, msg)).toBe(false);
  });

  it("scalar helpers: canonical serialization round trip", () => {
    // Zero is not a valid signing key (frost-core rejects it; so does noble's
    // multiply) — the vectors here are all nonzero.
    for (const v of [1n, 0x1234567890abcdefn, modScalar(-1n)]) {
      const bytes = scalarToBytes(v);
      expect(bytes.length).toBe(32);
      expect(scalarFromLeWide(bytes)).toBe(modScalar(v));
      expect(isValidPoint(baseMul(v))).toBe(true);
    }
  });
});
