// packages/wallet/src/__tests__/keystore.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  hasWallet,
  loadWallet,
  saveWallet,
  clearWallet,
  setWalletNetwork,
  WALLET_NETWORK_EVENT,
} from "../keystore";

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

  // -------------------------------------------------------------------------
  // setWalletNetwork — persist + dispatch the network-change event
  // -------------------------------------------------------------------------

  it("persists a network change to alphanet and reloads it", () => {
    saveWallet(VALID_12);
    expect(loadWallet()?.network).toBe("signet");

    const updated = setWalletNetwork("alphanet");
    expect(updated.network).toBe("alphanet");
    expect(updated.mnemonic).toBe(VALID_12); // mnemonic preserved
    expect(loadWallet()?.network).toBe("alphanet");
  });

  it("round-trips back to signet from alphanet", () => {
    saveWallet(VALID_12);
    setWalletNetwork("alphanet");
    expect(loadWallet()?.network).toBe("alphanet");

    setWalletNetwork("signet");
    expect(loadWallet()?.network).toBe("signet");
  });

  it("dispatches the WALLET_NETWORK_EVENT on change", () => {
    saveWallet(VALID_12);
    const handler = vi.fn();
    window.addEventListener(WALLET_NETWORK_EVENT, handler);

    setWalletNetwork("alphanet");

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ network: "alphanet" });

    window.removeEventListener(WALLET_NETWORK_EVENT, handler);
  });

  it("throws when there is no stored wallet", () => {
    expect(() => setWalletNetwork("alphanet")).toThrow(/no wallet/i);
  });

  it("coerces an unknown network field back to signet on load", () => {
    saveWallet(VALID_12);
    // Manually corrupt the network field to simulate an old/foreign record.
    const raw = JSON.parse(localStorage.getItem("sidecoin.wallet.v1")!);
    raw.network = "regtest"; // not a valid WalletNetwork
    localStorage.setItem("sidecoin.wallet.v1", JSON.stringify(raw));

    expect(loadWallet()?.network).toBe("signet");
  });
});
