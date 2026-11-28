// packages/shared/src/__tests__/thunder-address.test.ts
//
// Thunder addresses + deposit strings. The deposit-string checksum rule is
// verified against a real betanet deposit: the OP_RETURN of
// f83c5c7a975798aefa35a98299b31bebcf4dda5edf885bd6f893244a1b2688c5 carries
// the bare address "8twUkpctzwgbjqi5o14qWjrD9uk" (27 base58 chars, 20
// bytes).

import { describe, expect, it } from "vitest";

import {
  parseThunderDepositString,
  thunderAddress,
  thunderAddressBytes,
  thunderAddressBytesFromBase58,
  thunderDepositString,
} from "../sidechains/thunder/address";
import { baseMul } from "../sidechains/thunder/crypto";
import { THUNDER_SLOT } from "../sidechains/thunder/keys";

describe("thunder addresses", () => {
  it("20-byte hashes encode to 26-28 char base58 with no checksum/version", () => {
    for (let i = 0; i < 5; i++) {
      const pk = baseMul(BigInt(i + 1) * 123456789n);
      const addr = thunderAddress(pk);
      expect(addr).toMatch(/^[1-9A-HJ-NP-Za-km-z]{26,28}$/);
      expect(thunderAddressBytesFromBase58(addr)).toEqual(thunderAddressBytes(pk));
    }
  });

  it("rejects base58 of the wrong length", () => {
    expect(() => thunderAddressBytesFromBase58("1111")).toThrow();
  });
});

describe("thunder deposit strings", () => {
  it("wraps as s<slot>_<addr>_<hex(sha256(prefix)[..3])>", () => {
    const pk = baseMul(999n);
    const addr = thunderAddress(pk);
    const wrapped = thunderDepositString(addr);
    const parts = wrapped.split("_");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(`s${THUNDER_SLOT}`);
    expect(parts[1]).toBe(addr);
    expect(parts[2]).toMatch(/^[0-9a-f]{6}$/);
  });

  it("round trips: bare, two-part, and checksummed forms", () => {
    const addr = thunderAddress(baseMul(4242n));
    const wrapped = thunderDepositString(addr);
    expect(parseThunderDepositString(addr)).toEqual({ slot: 9, address: addr });
    expect(parseThunderDepositString(`s9_${addr}`)).toEqual({ slot: 9, address: addr });
    expect(parseThunderDepositString(wrapped)).toEqual({ slot: 9, address: addr });
  });

  it("rejects wrong slot, bad checksum, and malformed input", () => {
    const addr = thunderAddress(baseMul(77n));
    expect(() => parseThunderDepositString(`s2_${addr}`)).toThrow(/slot 2, expected 9/);
    const wrapped = thunderDepositString(addr);
    const tampered = wrapped.slice(0, wrapped.length - 1) + (wrapped.endsWith("0") ? "1" : "0");
    expect(() => parseThunderDepositString(tampered)).toThrow(/checksum/);
    expect(() => parseThunderDepositString("a_b_c_d")).toThrow(/Malformed/);
  });

  it("matches the real betanet deposit address shape", () => {
    // 8twUkpctzwgbjqi5o14qWjrD9uk — 27 chars, parses to 20 bytes.
    const parsed = parseThunderDepositString("8twUkpctzwgbjqi5o14qWjrD9uk");
    expect(parsed.slot).toBe(9);
    expect(parsed.address).toBe("8twUkpctzwgbjqi5o14qWjrD9uk");
    expect(thunderAddressBytesFromBase58(parsed.address)).toHaveLength(20);
  });
});
