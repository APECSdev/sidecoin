// packages/shared/src/wallet/__tests__/nostr-identity.test.ts

import { describe, it, expect } from "vitest";
import { bytesToHex } from "@noble/hashes/utils";

import { deriveNostrIdentityKey } from "../nostr-identity";

// Canonical NIP-06 test vectors (verified against the NIP-06 spec).
const NIP06_MNEMONIC =
  "leader monkey parrot ring guide accident before fence cannon height naive bean";
const NIP06_PRIVKEY_HEX =
  "7f7ff03d123792d6ac594bfa67bf6d0c0ab55b6b1fdb6249303fe861f1ccba9a";
// x-only (32-byte) public key per NIP-06; our compressed key's X half.
const NIP06_XONLY_HEX =
  "17162c921dc4d2518f9a101db33695df1afb56ab82f5ff3e5da6eec3ca5cd917";

describe("deriveNostrIdentityKey", () => {
  it("matches the NIP-06 private-key vector at index 0", () => {
    const key = deriveNostrIdentityKey(NIP06_MNEMONIC, 0);
    expect(bytesToHex(key.privateKey)).toBe(NIP06_PRIVKEY_HEX);
  });

  it("matches the NIP-06 x-only public key (npub parity check)", () => {
    const key = deriveNostrIdentityKey(NIP06_MNEMONIC, 0);
    // Compressed key = 02/03 prefix + 32-byte X. Stripping the prefix MUST
    // yield the NIP-06 x-only key the leaderboard turns into the npub.
    const prefix = key.publicKeyHex.slice(0, 2);
    expect(prefix === "02" || prefix === "03").toBe(true);
    expect(key.publicKeyHex.slice(2)).toBe(NIP06_XONLY_HEX);
  });

  it("uses the NIP-06 derivation path", () => {
    expect(deriveNostrIdentityKey(NIP06_MNEMONIC, 0).path).toBe(
      "m/44'/1237'/0'/0/0",
    );
  });

  it("produces a 66-char lowercase-hex compressed pubkey", () => {
    const key = deriveNostrIdentityKey(NIP06_MNEMONIC, 0);
    expect(key.publicKeyHex).toMatch(/^[0-9a-f]{66}$/);
    expect(key.publicKey).toHaveLength(33);
  });

  it("is deterministic for the same inputs", () => {
    const a = deriveNostrIdentityKey(NIP06_MNEMONIC, 0);
    const b = deriveNostrIdentityKey(NIP06_MNEMONIC, 0);
    expect(a.publicKeyHex).toBe(b.publicKeyHex);
  });

  it("derives distinct keys for distinct indices", () => {
    const i0 = deriveNostrIdentityKey(NIP06_MNEMONIC, 0);
    const i1 = deriveNostrIdentityKey(NIP06_MNEMONIC, 1);
    expect(i0.publicKeyHex).not.toBe(i1.publicKeyHex);
    expect(i1.path).toBe("m/44'/1237'/0'/0/1");
  });

  it("rejects an invalid mnemonic", () => {
    expect(() => deriveNostrIdentityKey("not a real mnemonic", 0)).toThrow();
  });

  it("rejects a negative / non-integer index", () => {
    expect(() => deriveNostrIdentityKey(NIP06_MNEMONIC, -1)).toThrow();
    expect(() => deriveNostrIdentityKey(NIP06_MNEMONIC, 1.5)).toThrow();
  });
});
