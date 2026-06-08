// packages/wallet/src/__tests__/keystore.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { hasWallet, loadWallet, saveWallet, clearWallet } from "../keystore";

const VALID_12 =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("keystore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reports no wallet when storage is empty", () => {
    expect(hasWallet()).toBe(false);
    expect(loadWallet()).toBeNull();
  });

  it("saves and reloads a valid mnemonic", () => {
    const saved = saveWallet(VALID_12);
    expect(saved.mnemonic).toBe(VALID_12);
    expect(saved.version).toBe(1);
    expect(saved.network).toBe("signet");
    expect(hasWallet()).toBe(true);
    expect(loadWallet()?.mnemonic).toBe(VALID_12);
  });

  it("normalizes the mnemonic before storing", () => {
    saveWallet(`  ABANDON ${VALID_12.slice(8)}  `);
    expect(loadWallet()?.mnemonic).toBe(VALID_12);
  });

  it("refuses to store an invalid mnemonic", () => {
    expect(() => saveWallet("not a real mnemonic")).toThrow(/invalid BIP-39/);
    expect(hasWallet()).toBe(false);
  });

  it("clears the stored wallet", () => {
    saveWallet(VALID_12);
    clearWallet();
    expect(hasWallet()).toBe(false);
  });

  it("treats a corrupt entry as no wallet", () => {
    localStorage.setItem("sidecoin.wallet.v1", "{not json");
    expect(loadWallet()).toBeNull();
  });
});
