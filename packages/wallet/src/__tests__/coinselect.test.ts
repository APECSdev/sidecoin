// packages/wallet/src/__tests__/coinselect.test.ts
//
// Tests for the pure largest-first coin-selection module. Covers the coinbase
// maturity guard, deterministic ordering, fee/change math (incl. sub-dust
// change folded into the fee), bigint precision beyond 2^53, and the typed
// insufficient_funds / invalid_target results.

import { describe, it, expect } from "vitest";
import {
  selectCoins,
  estimateVsize,
  COINBASE_MATURITY,
  DEFAULT_FEE_RATE_SATS_PER_VBYTE,
  DUST_THRESHOLD_SATS,
  type SelectionOk,
  type SelectionInsufficient,
} from "../coinselect";
import type { Utxo } from "../api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;

/** Build a Utxo with sensible signet defaults; override per test. */
function utxo(valueSats: bigint, over: Partial<Utxo> = {}): Utxo {
  const n = _seq++;
  return {
    chainId: "signet",
    address: "tb1qexample",
    txid: (over.txid ?? String(n).padStart(2, "0")).repeat(1),
    vout: 0,
    valueSats,
    scriptPubKey: "0014" + "00".repeat(20),
    confirmations: 200,
    blockHeight: 100,
    isCoinbase: false,
    ...over,
  };
}

function expectOk(r: ReturnType<typeof selectCoins>): SelectionOk {
  if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
  return r;
}

function expectInsufficient(
  r: ReturnType<typeof selectCoins>,
): SelectionInsufficient {
  if (r.kind !== "insufficient_funds") {
    throw new Error(`expected insufficient_funds, got ${r.kind}`);
  }
  return r;
}

// ---------------------------------------------------------------------------
// vsize model
// ---------------------------------------------------------------------------

describe("estimateVsize", () => {
  it("grows by the input and output vbyte costs", () => {
    // 11 overhead + 1*68 input + 2*31 outputs = 141
    expect(estimateVsize(1, 2)).toBe(141n);
    // 11 + 2*68 + 1*31 = 178
    expect(estimateVsize(2, 1)).toBe(178n);
  });
});

// ---------------------------------------------------------------------------
// Maturity guard
// ---------------------------------------------------------------------------

describe("coinbase maturity guard", () => {
  it("skips an immature coinbase UTXO", () => {
    const r = selectCoins({
      utxos: [utxo(1_000_000n, { isCoinbase: true, confirmations: 99 })],
      targetSats: 100_000n,
    });
    const ins = expectInsufficient(r);
    expect(ins.availableSats).toBe(0n);
  });

  it("spends a mature coinbase UTXO (confirmations >= 100)", () => {
    const r = selectCoins({
      utxos: [utxo(1_000_000n, { isCoinbase: true, confirmations: 100 })],
      targetSats: 100_000n,
    });
    const ok = expectOk(r);
    expect(ok.inputs).toHaveLength(1);
    expect(ok.totalInSats).toBe(1_000_000n);
  });

  it("treats a non-coinbase low-confirmation UTXO as eligible", () => {
    const r = selectCoins({
      utxos: [utxo(1_000_000n, { isCoinbase: false, confirmations: 1 })],
      targetSats: 100_000n,
    });
    expect(expectOk(r).inputs).toHaveLength(1);
  });

  it("honors a custom coinbaseMaturity override", () => {
    const r = selectCoins({
      utxos: [utxo(1_000_000n, { isCoinbase: true, confirmations: 50 })],
      targetSats: 100_000n,
      coinbaseMaturity: 50,
    });
    expect(expectOk(r).inputs).toHaveLength(1);
  });

  it("exposes the standard maturity as 100", () => {
    expect(COINBASE_MATURITY).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Largest-first ordering
// ---------------------------------------------------------------------------

describe("largest-first selection", () => {
  it("selects the largest UTXO first and stops once funded", () => {
    const r = selectCoins({
      utxos: [utxo(50_000n), utxo(900_000n), utxo(300_000n)],
      targetSats: 100_000n,
    });
    const ok = expectOk(r);
    expect(ok.inputs).toHaveLength(1);
    expect(ok.inputs[0].valueSats).toBe(900_000n);
  });

  it("accumulates multiple inputs when one is not enough", () => {
    const r = selectCoins({
      utxos: [utxo(60_000n), utxo(60_000n), utxo(60_000n)],
      targetSats: 100_000n,
    });
    const ok = expectOk(r);
    expect(ok.inputs).toHaveLength(2);
    expect(ok.totalInSats).toBe(120_000n);
  });

  it("is deterministic for equal-value UTXOs (txid then vout tiebreak)", () => {
    const a = utxo(100_000n, { txid: "bb", vout: 1 });
    const b = utxo(100_000n, { txid: "aa", vout: 0 });
    const c = utxo(100_000n, { txid: "aa", vout: 1 });
    const r1 = selectCoins({ utxos: [a, b, c], targetSats: 150_000n });
    const r2 = selectCoins({ utxos: [c, a, b], targetSats: 150_000n });
    const ok1 = expectOk(r1);
    const ok2 = expectOk(r2);
    const ids1 = ok1.inputs.map((u) => `${u.txid}:${u.vout}`);
    const ids2 = ok2.inputs.map((u) => `${u.txid}:${u.vout}`);
    expect(ids1).toEqual(ids2);
    // aa:0 sorts before aa:1
    expect(ids1[0]).toBe("aa:0");
    expect(ids1[1]).toBe("aa:1");
  });
});

// ---------------------------------------------------------------------------
// Fee + change math
// ---------------------------------------------------------------------------

describe("fee and change", () => {
  it("returns change when it exceeds the dust threshold", () => {
    // 1 input, 2 outputs @ 1 sat/vB => fee 141. change = 1_000_000-100_000-141
    const r = selectCoins({
      utxos: [utxo(1_000_000n)],
      targetSats: 100_000n,
    });
    const ok = expectOk(r);
    expect(ok.hasChange).toBe(true);
    expect(ok.feeSats).toBe(141n);
    expect(ok.changeSats).toBe(899_859n);
    expect(ok.totalInSats).toBe(ok.changeSats + ok.feeSats + 100_000n);
  });

  it("folds sub-dust change into the fee (no change output)", () => {
    // Pick total so that total - target - feeWithChange(141) is in (0, dust).
    // target 100_000, feeWithChange 141 => change = total - 100_141.
    // Want 0 < change < 294 => choose total = 100_300 (change would be 159).
    const r = selectCoins({
      utxos: [utxo(100_300n)],
      targetSats: 100_000n,
    });
    const ok = expectOk(r);
    expect(ok.hasChange).toBe(false);
    expect(ok.changeSats).toBe(0n);
    // Entire leftover becomes the fee.
    expect(ok.feeSats).toBe(300n);
    expect(ok.totalInSats).toBe(100_300n);
  });

  it("applies a custom fee rate", () => {
    // 2 sat/vB, 1 input 2 outputs => 141 * 2 = 282 fee.
    const r = selectCoins({
      utxos: [utxo(1_000_000n)],
      targetSats: 100_000n,
      feeRateSatsPerVByte: 2n,
    });
    const ok = expectOk(r);
    expect(ok.feeSats).toBe(282n);
    expect(ok.changeSats).toBe(1_000_000n - 100_000n - 282n);
  });

  it("defaults the fee rate to 1 sat/vByte", () => {
    expect(DEFAULT_FEE_RATE_SATS_PER_VBYTE).toBe(1n);
  });
});

// ---------------------------------------------------------------------------
// bigint precision
// ---------------------------------------------------------------------------

describe("bigint precision", () => {
  it("handles values beyond 2^53 without loss", () => {
    const huge = 90_071_992_547_409_910n; // > Number.MAX_SAFE_INTEGER
    const r = selectCoins({
      utxos: [utxo(huge)],
      targetSats: 90_071_992_547_000_000n,
    });
    const ok = expectOk(r);
    expect(ok.totalInSats).toBe(huge);
    expect(ok.feeSats + ok.changeSats + 90_071_992_547_000_000n).toBe(huge);
  });
});

// ---------------------------------------------------------------------------
// Insufficient funds / invalid target
// ---------------------------------------------------------------------------

describe("insufficient funds", () => {
  it("reports available and required when coins cannot cover target + fee", () => {
    const r = selectCoins({
      utxos: [utxo(50_000n), utxo(40_000n)],
      targetSats: 100_000n,
    });
    const ins = expectInsufficient(r);
    expect(ins.availableSats).toBe(90_000n);
    expect(ins.requiredSats).toBeGreaterThan(100_000n);
    expect(ins.truncated).toBe(false);
  });

  it("carries the truncated flag through to the result", () => {
    const r = selectCoins({
      utxos: [utxo(50_000n)],
      targetSats: 100_000n,
      truncated: true,
    });
    expect(expectInsufficient(r).truncated).toBe(true);
  });

  it("reports zero available when every candidate is immature", () => {
    const r = selectCoins({
      utxos: [
        utxo(1_000_000n, { isCoinbase: true, confirmations: 10 }),
        utxo(2_000_000n, { isCoinbase: true, confirmations: 99 }),
      ],
      targetSats: 100_000n,
    });
    expect(expectInsufficient(r).availableSats).toBe(0n);
  });
});

describe("invalid target", () => {
  it("rejects a non-positive amount", () => {
    const r = selectCoins({ utxos: [utxo(1_000_000n)], targetSats: 0n });
    expect(r.kind).toBe("invalid_target");
  });

  it("rejects an amount below the dust threshold", () => {
    const r = selectCoins({
      utxos: [utxo(1_000_000n)],
      targetSats: DUST_THRESHOLD_SATS - 1n,
    });
    expect(r.kind).toBe("invalid_target");
  });
});
