// packages/shared/src/__tests__/signing.test.ts
//
// Proves deriveSigningKey against the CANONICAL BIP-84 specification test
// vectors (the standard all-"abandon" mnemonic). A passing suite means the
// PRIVATE key, public key, address, and P2WPKH scriptPubKey are provably
// correct — the foundation the L1 transaction signer is built on.
//
// Vectors (BIP-84, account 0, first receiving key, m/84'/0'/0'/0/0):
//   privkey (WIF) = KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d
//   privkey (hex) = 4604b4b710fe91f584fff084e1a9159fe4f8408fff380596a604948474ce4fa3
//   pubkey  (hex) = 0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c
//   address       = bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu
//
// The private-key assertion decodes the published WIF at runtime rather than
// trusting a hand-copied hex constant: base58check(WIF) -> [0x80, key32, 0x01]
// for a mainnet compressed key, so payload[1..33] is the raw 32-byte scalar.

import { describe, expect, it } from "vitest";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { bech32, base58check } from "@scure/base";
import { deriveSigningKey } from "../wallet/signing";
import { deriveReceiveAddress } from "../wallet/derivation";

// The standard all-"abandon" BIP-39 test mnemonic.
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon about";

// Published BIP-84 spec artifact (mainnet, compressed). Decoded at runtime so
// the expected private key is anchored to the spec, not a transcribed hex.
const BIP84_WIF = "KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d";
const BIP84_PUBKEY_HEX =
  "0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c";
const BIP84_ADDRESS = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";

/** Decode a mainnet compressed WIF to its raw 32-byte secp256k1 scalar. */
function wifToRawPrivateKey(wif: string): Uint8Array {
  // base58check (double-SHA256 checksum) -> [version, ...32-byte key, 0x01].
  // Mainnet WIF version is 0x80; the trailing 0x01 is the compression flag.
  const payload = base58check(sha256).decode(wif);
  return payload.slice(1, 33);
}

/** Reconstruct the expected P2WPKH scriptPubKey hex from a bech32 address. */
function expectedScriptPubKeyHex(address: string): string {
  const decoded = bech32.decode(address);
  // words[0] is the witness version (0); the rest is the program.
  const program = bech32.fromWords(decoded.words.slice(1));
  return `0014${bytesToHex(Uint8Array.from(program))}`;
}

describe("deriveSigningKey — BIP-84 canonical vectors", () => {
  it("mainnet m/84'/0'/0'/0/0 private key matches the BIP-84 spec WIF", () => {
    const key = deriveSigningKey(TEST_MNEMONIC, "mainnet", 0);
    expect(bytesToHex(key.privateKey)).toBe(
      bytesToHex(wifToRawPrivateKey(BIP84_WIF)),
    );
  });

  it("mainnet m/84'/0'/0'/0/0 public key matches the BIP-84 spec vector", () => {
    const key = deriveSigningKey(TEST_MNEMONIC, "mainnet", 0);
    expect(bytesToHex(key.publicKey)).toBe(BIP84_PUBKEY_HEX);
  });

  it("derives the canonical BIP-84 address", () => {
    const key = deriveSigningKey(TEST_MNEMONIC, "mainnet", 0);
    expect(key.address).toBe(BIP84_ADDRESS);
  });

  it("address is identical to deriveReceiveAddress for the same inputs", () => {
    const key = deriveSigningKey(TEST_MNEMONIC, "mainnet", 0);
    expect(key.address).toBe(deriveReceiveAddress(TEST_MNEMONIC, "mainnet", 0));
  });

  it("reports the correct derivation path", () => {
    const key = deriveSigningKey(TEST_MNEMONIC, "mainnet", 0);
    expect(key.path).toBe("m/84'/0'/0'/0/0");
  });
});

describe("deriveSigningKey — scriptPubKey construction", () => {
  it("builds a P2WPKH scriptPubKey that matches the canonical address", () => {
    const key = deriveSigningKey(TEST_MNEMONIC, "mainnet", 0);
    expect(bytesToHex(key.scriptPubKey)).toBe(
      expectedScriptPubKeyHex(BIP84_ADDRESS),
    );
  });

  it("scriptPubKey is 22 bytes and starts with OP_0 + 20-byte push", () => {
    const key = deriveSigningKey(TEST_MNEMONIC, "mainnet", 0);
    expect(key.scriptPubKey.length).toBe(22);
    expect(key.scriptPubKey[0]).toBe(0x00); // OP_0
    expect(key.scriptPubKey[1]).toBe(0x14); // 20-byte push
  });
});

describe("deriveSigningKey — network HRP / coinType selection", () => {
  it("signet uses coinType 1 and yields a tb1q address + matching spk", () => {
    const key = deriveSigningKey(TEST_MNEMONIC, "signet", 0);
    expect(key.path).toBe("m/84'/1'/0'/0/0");
    expect(key.address.startsWith("tb1q")).toBe(true);
    expect(bytesToHex(key.scriptPubKey)).toBe(
      expectedScriptPubKeyHex(key.address),
    );
  });

  it("mainnet and signet derive distinct keys for the same index", () => {
    const main = deriveSigningKey(TEST_MNEMONIC, "mainnet", 0);
    const sig = deriveSigningKey(TEST_MNEMONIC, "signet", 0);
    expect(bytesToHex(main.privateKey)).not.toBe(bytesToHex(sig.privateKey));
    expect(main.address).not.toBe(sig.address);
  });
});

describe("deriveSigningKey — key material shape", () => {
  it("private key is 32 bytes, public key is 33 (compressed)", () => {
    const key = deriveSigningKey(TEST_MNEMONIC, "signet", 0);
    expect(key.privateKey.length).toBe(32);
    expect(key.publicKey.length).toBe(33);
  });

  it("derives distinct private keys across indices", () => {
    const set = new Set([
      bytesToHex(deriveSigningKey(TEST_MNEMONIC, "signet", 0).privateKey),
      bytesToHex(deriveSigningKey(TEST_MNEMONIC, "signet", 1).privateKey),
      bytesToHex(deriveSigningKey(TEST_MNEMONIC, "signet", 2).privateKey),
    ]);
    expect(set.size).toBe(3);
  });

  it("defaults to index 0 when no index is supplied", () => {
    const a = deriveSigningKey(TEST_MNEMONIC, "signet");
    const b = deriveSigningKey(TEST_MNEMONIC, "signet", 0);
    expect(bytesToHex(a.privateKey)).toBe(bytesToHex(b.privateKey));
  });
});

describe("deriveSigningKey — input validation", () => {
  it("rejects an invalid mnemonic", () => {
    expect(() =>
      deriveSigningKey("not a real mnemonic phrase at all", "signet"),
    ).toThrow(/invalid BIP-39 mnemonic/i);
  });

  it("rejects a negative index", () => {
    expect(() => deriveSigningKey(TEST_MNEMONIC, "signet", -1)).toThrow(
      /non-negative integer/i,
    );
  });

  it("rejects an unknown network id", () => {
    expect(() =>
      // @ts-expect-error — intentionally invalid network for the throw path
      deriveSigningKey(TEST_MNEMONIC, "dogecoin", 0),
    ).toThrow();
  });
});
