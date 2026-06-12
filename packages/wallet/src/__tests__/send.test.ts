// packages/wallet/src/__tests__/send.test.ts
//
// Tests for the pure Send helpers: lossless decimal->sats parsing and the
// read-Utxo -> shared-Utxo mapper.

import { describe, it, expect } from "vitest";
import { parseCoinsToSats, toSpendableUtxo } from "../send";
import type { Utxo as ReadUtxo } from "../api";

describe("parseCoinsToSats", () => {
  it("parses a whole number", () => {
    expect(parseCoinsToSats("1")).toBe(100_000_000n);
  });

  it("parses a fractional amount", () => {
    expect(parseCoinsToSats("0.005")).toBe(500_000n);
  });

  it("parses the smallest unit (1 sat)", () => {
    expect(parseCoinsToSats("0.00000001")).toBe(1n);
  });

  it("parses zero", () => {
    expect(parseCoinsToSats("0")).toBe(0n);
    expect(parseCoinsToSats("0.00000000")).toBe(0n);
  });

  it("trims surrounding whitespace", () => {
    expect(parseCoinsToSats("  2.5  ")).toBe(250_000_000n);
  });

  it("is lossless beyond 2^53", () => {
    // 100,000,000 coins = 1e16 sats > Number.MAX_SAFE_INTEGER.
    expect(parseCoinsToSats("100000000")).toBe(10_000_000_000_000_000n);
  });

  it("rejects more than 8 decimal places", () => {
    expect(() => parseCoinsToSats("0.000000001")).toThrow(/8 decimal/);
  });

  it("rejects non-numeric input", () => {
    expect(() => parseCoinsToSats("abc")).toThrow(/Invalid amount/);
    expect(() => parseCoinsToSats("")).toThrow(/Invalid amount/);
    expect(() => parseCoinsToSats("1.2.3")).toThrow(/Invalid amount/);
  });

  it("rejects a negative amount", () => {
    expect(() => parseCoinsToSats("-1")).toThrow(/Invalid amount/);
  });
});

describe("toSpendableUtxo", () => {
  const read: ReadUtxo = {
    chainId: "signet",
    address: "tb1qexample",
    txid: "a".repeat(64),
    vout: 2,
    valueSats: 1_234_567n,
    scriptPubKey: "0014" + "11".repeat(20),
    confirmations: 42,
    blockHeight: 1000,
    isCoinbase: true,
  };

  it("bridges valueSats to amountSatoshis", () => {
    expect(toSpendableUtxo(read).amountSatoshis).toBe(1_234_567n);
  });

  it("carries txid, vout, scriptPubKey, address, confirmations verbatim", () => {
    const s = toSpendableUtxo(read);
    expect(s.txid).toBe(read.txid);
    expect(s.vout).toBe(2);
    expect(s.scriptPubKey).toBe(read.scriptPubKey);
    expect(s.address).toBe("tb1qexample");
    expect(s.confirmations).toBe(42);
    expect(s.blockHeight).toBe(1000);
  });

  it("preserves the coinbase flag (for the maturity guard)", () => {
    expect(toSpendableUtxo(read).isCoinbase).toBe(true);
  });

  it("defaults isLocked false and derivationPath empty", () => {
    const s = toSpendableUtxo(read);
    expect(s.isLocked).toBe(false);
    expect(s.derivationPath).toBe("");
  });

  it("preserves a value beyond 2^53", () => {
    const huge = { ...read, valueSats: 90_071_992_547_409_910n };
    expect(toSpendableUtxo(huge).amountSatoshis).toBe(90_071_992_547_409_910n);
  });
});
