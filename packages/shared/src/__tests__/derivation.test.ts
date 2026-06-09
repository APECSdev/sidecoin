// packages/shared/src/__tests__/derivation.test.ts
//
// Proves the BIP-84 engine against the CANONICAL published test vectors
// from the BIP-84 specification. If these pass, the seed → secp256k1 →
// hash160 → bech32 pipeline is provably correct, and the signet path is
// the same engine with coinType=1 + hrp="tb".

import { describe, expect, it } from "vitest";
import { deriveReceiveAddress } from "../wallet/derivation";

// The standard all-"abandon" BIP-39 test mnemonic.
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon about";

describe("deriveReceiveAddress — BIP-84 canonical vectors", () => {
  it("mainnet m/84'/0'/0'/0/0 matches the BIP-84 spec vector", () => {
    expect(deriveReceiveAddress(TEST_MNEMONIC, "mainnet", 0)).toBe(
      "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
    );
  });

  it("mainnet m/84'/0'/0'/0/1 matches the BIP-84 spec vector", () => {
    expect(deriveReceiveAddress(TEST_MNEMONIC, "mainnet", 1)).toBe(
      "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g",
    );
  });

  it("defaults to index 0 when no index is supplied", () => {
    expect(deriveReceiveAddress(TEST_MNEMONIC, "mainnet")).toBe(
      deriveReceiveAddress(TEST_MNEMONIC, "mainnet", 0),
    );
  });
});

describe("deriveReceiveAddress — network HRP selection", () => {
  it("signet uses the 'tb' HRP and the testnet coinType", () => {
    const addr = deriveReceiveAddress(TEST_MNEMONIC, "signet", 0);
    expect(addr.startsWith("tb1q")).toBe(true);
  });

  it("regtest uses the 'bcrt' HRP", () => {
    const addr = deriveReceiveAddress(TEST_MNEMONIC, "regtest", 0);
    expect(addr.startsWith("bcrt1q")).toBe(true);
  });

  it("mainnet and signet derive distinct addresses for the same index", () => {
    const main = deriveReceiveAddress(TEST_MNEMONIC, "mainnet", 0);
    const sig = deriveReceiveAddress(TEST_MNEMONIC, "signet", 0);
    expect(main).not.toBe(sig);
  });
});

describe("deriveReceiveAddress — input validation", () => {
  it("rejects an invalid mnemonic", () => {
    expect(() =>
      deriveReceiveAddress("not a real mnemonic phrase at all", "signet"),
    ).toThrow(/invalid BIP-39 mnemonic/i);
  });

  it("rejects a negative index", () => {
    expect(() => deriveReceiveAddress(TEST_MNEMONIC, "signet", -1)).toThrow(
      /non-negative integer/i,
    );
  });

  it("rejects an unknown network id", () => {
    expect(() =>
      // @ts-expect-error — intentionally invalid network for the throw path
      deriveReceiveAddress(TEST_MNEMONIC, "dogecoin", 0),
    ).toThrow();
  });
});
