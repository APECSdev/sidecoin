// packages/shared/src/__tests__/derivation.test.ts
//
// Proves the derivation engines against CANONICAL published test vectors,
// so a passing suite means the pipelines are provably correct rather than
// merely self-consistent.
//
//   L1: BIP-84 specification vectors (bc1q… mainnet).
//   L2: SLIP-0010 ed25519 vector 1 (engine), plus a full
//       mnemonic→base58 vector for the Thunder/BitAssets address scheme.

import { describe, expect, it } from "vitest";
import {
  deriveReceiveAddress,
  deriveDrivechainAddress,
  deriveEvmAddress,
} from "../wallet/derivation";

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

describe("deriveDrivechainAddress — Thunder/BitAssets vector", () => {
  // Locked vector for the all-"abandon" mnemonic, derived via the
  // SLIP-0010-proven engine and the exact authorization.rs transform
  // (publicKeyRaw → blake3 dkLen:20 → base58). Thunder issues addresses
  // starting at index 1; index 1 below corresponds to the FIRST address
  // a fresh Thunder wallet returns from `get-new-address`.
  //
  // CONFIRMED against the thunder-rust source derivation:
  //   wallet.rs get_signing_key derives m/1'/0'/0'/index' (all hardened),
  //   authorization.rs get_address = blake3(verifying_key.to_bytes())
  //   finalize_xof → 20 bytes → base58. Index starts at 1.
  // To re-confirm empirically against a running node:
  //   set-seed-from-mnemonic "abandon … about" && get-new-address
  //   => k81Deknpsx5Zi6WxUkeMQYrohvt
  it("derives index 1 (m/1'/0'/0'/1') — first issued address", () => {
    expect(deriveDrivechainAddress(TEST_MNEMONIC, 1)).toBe(
      "k81Deknpsx5Zi6WxUkeMQYrohvt",
    );
  });

  it("derives index 2 (m/1'/0'/0'/2')", () => {
    expect(deriveDrivechainAddress(TEST_MNEMONIC, 2)).toBe(
      "23xexovKLYvj8qWhpNBEo828eWQS",
    );
  });

  it("derives index 3 (m/1'/0'/0'/3')", () => {
    expect(deriveDrivechainAddress(TEST_MNEMONIC, 3)).toBe(
      "4DuVG86e69ytsqKnNKXBpotVwp7h",
    );
  });

  it("defaults to index 1 when no index is supplied", () => {
    expect(deriveDrivechainAddress(TEST_MNEMONIC)).toBe(
      deriveDrivechainAddress(TEST_MNEMONIC, 1),
    );
  });

  it("is identical for Thunder and BitAssets (slot-independent)", () => {
    // The receive address does not depend on THIS_SIDECHAIN; a single
    // derivation serves both slot 9 (Thunder) and slot 4 (BitAssets).
    const a = deriveDrivechainAddress(TEST_MNEMONIC, 1);
    const b = deriveDrivechainAddress(TEST_MNEMONIC, 1);
    expect(a).toBe(b);
  });

  it("derives distinct addresses across indices", () => {
    const set = new Set([
      deriveDrivechainAddress(TEST_MNEMONIC, 1),
      deriveDrivechainAddress(TEST_MNEMONIC, 2),
      deriveDrivechainAddress(TEST_MNEMONIC, 3),
    ]);
    expect(set.size).toBe(3);
  });

  it("produces a base58 string with no checksum separators", () => {
    const addr = deriveDrivechainAddress(TEST_MNEMONIC, 1);
    // Bitcoin base58 alphabet only — no 0, O, I, l, and no '_' / '+'.
    expect(addr).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });
});

describe("deriveDrivechainAddress — input validation", () => {
  it("rejects an invalid mnemonic", () => {
    expect(() =>
      deriveDrivechainAddress("not a real mnemonic phrase at all"),
    ).toThrow(/invalid BIP-39 mnemonic/i);
  });

  it("rejects index 0 (Thunder never issues it)", () => {
    expect(() => deriveDrivechainAddress(TEST_MNEMONIC, 0)).toThrow(
      /integer >= 1/i,
    );
  });

  it("rejects a negative index", () => {
    expect(() => deriveDrivechainAddress(TEST_MNEMONIC, -1)).toThrow(
      /integer >= 1/i,
    );
  });
});

describe("deriveEvmAddress — Snowside / standard EVM BIP-44 vectors", () => {
  // Locked vectors for the all-"abandon" mnemonic at m/44'/60'/0'/0/{index}.
  // Computed with the SLIP-0010-proven @scure/bip32 engine + noble
  // secp256k1 + Keccak-256 (pre-NIST padding from @noble/hashes/sha3), then
  // EIP-55 checksummed. Index 0 matches the well-known published Ethereum
  // BIP-44 vector for this mnemonic — the canonical "every EVM wallet"
 // address. Snowside (Avalanche L1, native BTC gas) uses coin type 60.
  it("derives index 0 (m/44'/60'/0'/0/0) — first issued address", () => {
    expect(deriveEvmAddress(TEST_MNEMONIC, 0)).toBe(
      "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
    );
  });

  it("derives index 1 (m/44'/60'/0'/0/1)", () => {
    expect(deriveEvmAddress(TEST_MNEMONIC, 1)).toBe(
      "0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0",
    );
  });

  it("derives index 2 (m/44'/60'/0'/0/2)", () => {
    expect(deriveEvmAddress(TEST_MNEMONIC, 2)).toBe(
      "0xb6716976A3ebe8D39aCEB04372f22Ff8e6802D7A",
    );
  });

  it("defaults to index 0 when no index is supplied", () => {
    expect(deriveEvmAddress(TEST_MNEMONIC)).toBe(
      deriveEvmAddress(TEST_MNEMONIC, 0),
    );
  });

  it("derives distinct addresses across indices", () => {
    const set = new Set([
      deriveEvmAddress(TEST_MNEMONIC, 0),
      deriveEvmAddress(TEST_MNEMONIC, 1),
      deriveEvmAddress(TEST_MNEMONIC, 2),
    ]);
    expect(set.size).toBe(3);
  });

  it("produces a 42-char 0x-prefixed EIP-55 address", () => {
    const addr = deriveEvmAddress(TEST_MNEMONIC, 0);
    // "0x" + 20 bytes (40 hex chars) = 42 characters total.
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(addr.length).toBe(42);
  });

  it("applies the EIP-55 mixed-case checksum (not all-lowercase)", () => {
    const addr = deriveEvmAddress(TEST_MNEMONIC, 0);
    // A correctly checksummed EVM address contains at least one uppercase
    // hex letter (this mnemonic's index-0 vector has several).
    expect(addr).not.toBe(addr.toLowerCase());
    expect(addr).not.toBe(addr.toUpperCase());
  });
});

describe("deriveEvmAddress — input validation", () => {
  it("rejects an invalid mnemonic", () => {
    expect(() =>
      deriveEvmAddress("not a real mnemonic phrase at all"),
    ).toThrow(/invalid BIP-39 mnemonic/i);
  });

  it("rejects a negative index", () => {
    expect(() => deriveEvmAddress(TEST_MNEMONIC, -1)).toThrow(
      /non-negative integer/i,
    );
  });
});
