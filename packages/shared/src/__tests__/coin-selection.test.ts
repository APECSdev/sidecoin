// packages/shared/src/__tests__/coin-selection.test.ts
//
// Pure, network-free tests for selectCoins(). Proves: largest-first
// accumulation, the builder-matching change/fold rule, fee sizing via the
// shared estimator, and the spendability policy (minConfirmations, coinbase
// maturity, isLocked).

import { describe, expect, it } from "vitest";
import { selectCoins } from "../tx/coin-selection";
import { DUST_LIMIT_SATS, estimateP2wpkhFee } from "../tx/fee";
import type { Utxo } from "../types/transaction";

let counter = 0;

/** Build a throwaway spendable UTXO; override only what a test cares about. */
function makeUtxo(over: Partial<Utxo> = {}): Utxo {
  counter += 1;
  return {
    txid: counter.toString(16).padStart(64, "0"),
    vout: 0,
    amountSatoshis: 100000n,
    scriptPubKey: "0014" + "00".repeat(20),
    address: "tb1qexampleexampleexampleexampleexampleex",
    derivationPath: "m/84'/0'/0'/0/0",
    confirmations: 10,
    isLocked: false,
    blockHeight: 100,
    isCoinbase: false,
    ...over,
  };
}

describe("selectCoins — happy path", () => {
  it("selects a single sufficient UTXO and creates change", () => {
    const utxos = [makeUtxo({ amountSatoshis: 200000n })];
    const res = selectCoins({
      utxos,
      targetSatoshis: 50000n,
      feeRateSatPerVb: 1,
    });

    expect(res.selectedUtxos).toHaveLength(1);
    expect(res.hasChange).toBe(true);
    expect(res.numOutputs).toBe(2);

    const expectedFee = estimateP2wpkhFee(1, 2, 1);
    expect(res.feeSatoshis).toBe(expectedFee);
    expect(res.changeSatoshis).toBe(200000n - 50000n - expectedFee);
    expect(res.totalInputSatoshis).toBe(200000n);
  });

  it("satisfies the builder balance identity: input = target + fee + change", () => {
    const utxos = [makeUtxo({ amountSatoshis: 200000n })];
    const res = selectCoins({
      utxos,
      targetSatoshis: 50000n,
      feeRateSatPerVb: 3,
    });
    expect(50000n + res.feeSatoshis + res.changeSatoshis).toBe(
      res.totalInputSatoshis,
    );
  });

  it("accumulates multiple UTXOs largest-first", () => {
    const utxos = [
      makeUtxo({ amountSatoshis: 30000n }),
      makeUtxo({ amountSatoshis: 40000n }),
      makeUtxo({ amountSatoshis: 10000n }),
    ];
    const res = selectCoins({
      utxos,
      targetSatoshis: 60000n,
      feeRateSatPerVb: 1,
    });

    expect(res.selectedUtxos).toHaveLength(2);
    expect(res.selectedUtxos.map((u) => u.amountSatoshis)).toEqual([
      40000n,
      30000n,
    ]);
    expect(res.totalInputSatoshis).toBe(70000n);
    expect(res.hasChange).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const utxos = [
      makeUtxo({ amountSatoshis: 40000n }),
      makeUtxo({ amountSatoshis: 30000n }),
    ];
    const a = selectCoins({ utxos, targetSatoshis: 60000n, feeRateSatPerVb: 1 });
    const b = selectCoins({ utxos, targetSatoshis: 60000n, feeRateSatPerVb: 1 });
    expect(a).toEqual(b);
  });
});

describe("selectCoins — change folding", () => {
  it("folds sub-dust change into the fee (no change output)", () => {
    // feeNoChange(1,1,1) = 110. Pick an input that leaves a tiny remainder so
    // a change output would be sub-dust → folded.
    const utxos = [makeUtxo({ amountSatoshis: 50210n })];
    const res = selectCoins({
      utxos,
      targetSatoshis: 50000n,
      feeRateSatPerVb: 1,
    });

    expect(res.hasChange).toBe(false);
    expect(res.changeSatoshis).toBe(0n);
    expect(res.numOutputs).toBe(1);
    // Entire remainder folded: fee = 50210 - 50000 = 210.
    expect(res.feeSatoshis).toBe(50210n - 50000n);
    // The folded remainder is sub-dust by construction.
    expect(res.feeSatoshis - estimateP2wpkhFee(1, 1, 1)).toBeLessThanOrEqual(
      DUST_LIMIT_SATS,
    );
  });
});

describe("selectCoins — spendability policy", () => {
  it("skips locked UTXOs", () => {
    const utxos = [
      makeUtxo({ amountSatoshis: 300000n, isLocked: true }),
      makeUtxo({ amountSatoshis: 200000n, isLocked: false }),
    ];
    const res = selectCoins({
      utxos,
      targetSatoshis: 50000n,
      feeRateSatPerVb: 1,
    });
    expect(res.selectedUtxos).toHaveLength(1);
    expect(res.selectedUtxos[0]?.amountSatoshis).toBe(200000n);
    expect(res.selectedUtxos[0]?.isLocked).toBe(false);
  });

  it("skips immature coinbase UTXOs (< maturity confirmations)", () => {
    const utxos = [
      makeUtxo({ amountSatoshis: 300000n, isCoinbase: true, confirmations: 50 }),
      makeUtxo({ amountSatoshis: 200000n, isCoinbase: false }),
    ];
    const res = selectCoins({
      utxos,
      targetSatoshis: 50000n,
      feeRateSatPerVb: 1,
    });
    expect(res.selectedUtxos).toHaveLength(1);
    expect(res.selectedUtxos[0]?.amountSatoshis).toBe(200000n);
    expect(res.selectedUtxos[0]?.isCoinbase).toBe(false);
  });

  it("includes mature coinbase UTXOs (>= maturity, boundary inclusive)", () => {
    const utxos = [
      makeUtxo({ amountSatoshis: 300000n, isCoinbase: true, confirmations: 100 }),
    ];
    const res = selectCoins({
      utxos,
      targetSatoshis: 50000n,
      feeRateSatPerVb: 1,
    });
    expect(res.selectedUtxos).toHaveLength(1);
    expect(res.selectedUtxos[0]?.isCoinbase).toBe(true);
  });

  it("honors a custom coinbaseMaturity", () => {
    const utxos = [
      makeUtxo({ amountSatoshis: 300000n, isCoinbase: true, confirmations: 60 }),
    ];
    const res = selectCoins({
      utxos,
      targetSatoshis: 50000n,
      feeRateSatPerVb: 1,
      coinbaseMaturity: 50,
    });
    expect(res.selectedUtxos).toHaveLength(1);
  });

  it("skips UTXOs below the default min confirmations (mempool)", () => {
    const utxos = [makeUtxo({ amountSatoshis: 200000n, confirmations: 0 })];
    expect(() =>
      selectCoins({ utxos, targetSatoshis: 50000n, feeRateSatPerVb: 1 }),
    ).toThrow(/insufficient/i);
  });

  it("includes mempool UTXOs when minConfirmations is 0", () => {
    const utxos = [makeUtxo({ amountSatoshis: 200000n, confirmations: 0 })];
    const res = selectCoins({
      utxos,
      targetSatoshis: 50000n,
      feeRateSatPerVb: 1,
      minConfirmations: 0,
    });
    expect(res.selectedUtxos).toHaveLength(1);
  });
});

describe("selectCoins — validation", () => {
  it("throws on insufficient funds", () => {
    const utxos = [makeUtxo({ amountSatoshis: 1000n })];
    expect(() =>
      selectCoins({ utxos, targetSatoshis: 50000n, feeRateSatPerVb: 1 }),
    ).toThrow(/insufficient/i);
  });

  it("throws on a dust-sized target", () => {
    const utxos = [makeUtxo({ amountSatoshis: 200000n })];
    expect(() =>
      selectCoins({ utxos, targetSatoshis: 100n, feeRateSatPerVb: 1 }),
    ).toThrow(/dust limit/i);
  });

  it("throws on a non-positive target", () => {
    const utxos = [makeUtxo({ amountSatoshis: 200000n })];
    expect(() =>
      selectCoins({ utxos, targetSatoshis: 0n, feeRateSatPerVb: 1 }),
    ).toThrow(/positive/i);
  });

  it("throws on a non-positive fee rate", () => {
    const utxos = [makeUtxo({ amountSatoshis: 200000n })];
    expect(() =>
      selectCoins({ utxos, targetSatoshis: 50000n, feeRateSatPerVb: 0 }),
    ).toThrow(/positive/i);
  });
});
