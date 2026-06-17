// packages/shared/src/__tests__/opreturn-coin-selection.test.ts
//
// Pure tests for OP_RETURN fee estimation and coin selection.

import { describe, expect, it } from "vitest";
import { buildOpReturnScript, encodeCoinNewsV2 } from "../tx/coin-news";
import { selectCoinsForOpReturn } from "../tx/coin-selection";
import {
  DUST_LIMIT_SATS,
  estimateOpReturnFee,
  estimateOpReturnOutputVbytes,
  estimateOpReturnVsize,
} from "../tx/fee";
import type { Utxo } from "../types/transaction";

let counter = 0;

const OP_RETURN_SCRIPT = buildOpReturnScript(
  encodeCoinNewsV2({
    feed: "us-weekly",
    title: "Hello",
  }),
);

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

describe("OP_RETURN fee estimators", () => {
  it("sizes a small OP_RETURN output as value + script length varint + script", () => {
    expect(estimateOpReturnOutputVbytes(10)).toBe(19);
  });

  it("sizes an OP_RETURN tx without change", () => {
    const vsize = estimateOpReturnVsize(1, OP_RETURN_SCRIPT.length, false);

    expect(vsize).toBe(
      Math.ceil(10.75 + 68 + 8 + 1 + OP_RETURN_SCRIPT.length),
    );
  });

  it("sizes an OP_RETURN tx with change", () => {
    const noChange = estimateOpReturnVsize(1, OP_RETURN_SCRIPT.length, false);
    const withChange = estimateOpReturnVsize(1, OP_RETURN_SCRIPT.length, true);

    expect(withChange).toBe(noChange + 31);
  });

  it("scales OP_RETURN fee with fee rate", () => {
    const at1 = estimateOpReturnFee(1, OP_RETURN_SCRIPT.length, true, 1);
    const at2 = estimateOpReturnFee(1, OP_RETURN_SCRIPT.length, true, 2);

    expect(at2).toBe(at1 * 2n);
  });

  it("rejects invalid OP_RETURN script length", () => {
    expect(() => estimateOpReturnVsize(1, 0, false)).toThrow(/positive integer/i);
  });

  it("rejects invalid fee rate", () => {
    expect(() => estimateOpReturnFee(1, OP_RETURN_SCRIPT.length, true, 0)).toThrow(
      /positive number/i,
    );
  });
});

describe("selectCoinsForOpReturn", () => {
  it("selects a single sufficient UTXO and creates change", () => {
    const utxos = [makeUtxo({ amountSatoshis: 200000n })];
    const res = selectCoinsForOpReturn({
      utxos,
      opReturnScriptLength: OP_RETURN_SCRIPT.length,
      feeRateSatPerVb: 1,
    });

    const expectedFee = estimateOpReturnFee(
      1,
      OP_RETURN_SCRIPT.length,
      true,
      1,
    );

    expect(res.selectedUtxos).toHaveLength(1);
    expect(res.hasChange).toBe(true);
    expect(res.numOutputs).toBe(2);
    expect(res.feeSatoshis).toBe(expectedFee);
    expect(res.changeSatoshis).toBe(200000n - expectedFee);
    expect(res.changeSatoshis + res.feeSatoshis).toBe(res.totalInputSatoshis);
  });

  it("folds sub-dust change into the fee", () => {
    const noChangeFee = estimateOpReturnFee(
      1,
      OP_RETURN_SCRIPT.length,
      false,
      1,
    );
    const utxos = [makeUtxo({ amountSatoshis: noChangeFee + 10n })];

    const res = selectCoinsForOpReturn({
      utxos,
      opReturnScriptLength: OP_RETURN_SCRIPT.length,
      feeRateSatPerVb: 1,
    });

    expect(res.hasChange).toBe(false);
    expect(res.changeSatoshis).toBe(0n);
    expect(res.numOutputs).toBe(1);
    expect(res.feeSatoshis).toBe(noChangeFee + 10n);
    expect(res.feeSatoshis - noChangeFee).toBeLessThanOrEqual(DUST_LIMIT_SATS);
  });

  it("accumulates multiple UTXOs largest-first", () => {
    const highRate = 10;
    const utxos = [
      makeUtxo({ amountSatoshis: 700n }),
      makeUtxo({ amountSatoshis: 900n }),
      makeUtxo({ amountSatoshis: 800n }),
    ];

    const res = selectCoinsForOpReturn({
      utxos,
      opReturnScriptLength: OP_RETURN_SCRIPT.length,
      feeRateSatPerVb: highRate,
    });

    expect(res.selectedUtxos.map((u) => u.amountSatoshis)).toEqual([
      900n,
      800n,
      700n,
    ]);
    expect(res.totalInputSatoshis).toBe(2400n);
  });

  it("is deterministic for identical inputs", () => {
    const utxos = [
      makeUtxo({ amountSatoshis: 40000n }),
      makeUtxo({ amountSatoshis: 30000n }),
    ];

    const a = selectCoinsForOpReturn({
      utxos,
      opReturnScriptLength: OP_RETURN_SCRIPT.length,
      feeRateSatPerVb: 1,
    });
    const b = selectCoinsForOpReturn({
      utxos,
      opReturnScriptLength: OP_RETURN_SCRIPT.length,
      feeRateSatPerVb: 1,
    });

    expect(a).toEqual(b);
  });

  it("skips locked UTXOs", () => {
    const utxos = [
      makeUtxo({ amountSatoshis: 300000n, isLocked: true }),
      makeUtxo({ amountSatoshis: 200000n, isLocked: false }),
    ];

    const res = selectCoinsForOpReturn({
      utxos,
      opReturnScriptLength: OP_RETURN_SCRIPT.length,
      feeRateSatPerVb: 1,
    });

    expect(res.selectedUtxos).toHaveLength(1);
    expect(res.selectedUtxos[0]?.amountSatoshis).toBe(200000n);
  });

  it("skips immature coinbase UTXOs", () => {
    const utxos = [
      makeUtxo({ amountSatoshis: 300000n, isCoinbase: true, confirmations: 50 }),
      makeUtxo({ amountSatoshis: 200000n, isCoinbase: false }),
    ];

    const res = selectCoinsForOpReturn({
      utxos,
      opReturnScriptLength: OP_RETURN_SCRIPT.length,
      feeRateSatPerVb: 1,
    });

    expect(res.selectedUtxos).toHaveLength(1);
    expect(res.selectedUtxos[0]?.isCoinbase).toBe(false);
  });

  it("includes mature coinbase UTXOs", () => {
    const utxos = [
      makeUtxo({ amountSatoshis: 300000n, isCoinbase: true, confirmations: 100 }),
    ];

    const res = selectCoinsForOpReturn({
      utxos,
      opReturnScriptLength: OP_RETURN_SCRIPT.length,
      feeRateSatPerVb: 1,
    });

    expect(res.selectedUtxos).toHaveLength(1);
    expect(res.selectedUtxos[0]?.isCoinbase).toBe(true);
  });

  it("honors minConfirmations", () => {
    const utxos = [makeUtxo({ amountSatoshis: 200000n, confirmations: 0 })];

    expect(() =>
      selectCoinsForOpReturn({
        utxos,
        opReturnScriptLength: OP_RETURN_SCRIPT.length,
        feeRateSatPerVb: 1,
      }),
    ).toThrow(/insufficient/i);

    const res = selectCoinsForOpReturn({
      utxos,
      opReturnScriptLength: OP_RETURN_SCRIPT.length,
      feeRateSatPerVb: 1,
      minConfirmations: 0,
    });

    expect(res.selectedUtxos).toHaveLength(1);
  });

  it("throws on insufficient funds", () => {
    const utxos = [makeUtxo({ amountSatoshis: 1n })];

    expect(() =>
      selectCoinsForOpReturn({
        utxos,
        opReturnScriptLength: OP_RETURN_SCRIPT.length,
        feeRateSatPerVb: 10,
      }),
    ).toThrow(/insufficient funds/i);
  });

  it("throws on invalid OP_RETURN script length", () => {
    expect(() =>
      selectCoinsForOpReturn({
        utxos: [makeUtxo()],
        opReturnScriptLength: 0,
        feeRateSatPerVb: 1,
      }),
    ).toThrow(/positive integer/i);
  });

  it("throws on invalid fee rate", () => {
    expect(() =>
      selectCoinsForOpReturn({
        utxos: [makeUtxo()],
        opReturnScriptLength: OP_RETURN_SCRIPT.length,
        feeRateSatPerVb: 0,
      }),
    ).toThrow(/positive number/i);
  });
});
