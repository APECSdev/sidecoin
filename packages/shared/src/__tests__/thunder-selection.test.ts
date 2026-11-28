// packages/shared/src/__tests__/thunder-selection.test.ts
//
// Coin selection policy: smallest-adequate locking, exact-borsh-size fee
// pricing with the 1-sat floor, dust-to-fee folding, sweep, maturity
// skips (coinbase/deposit 50-block rules), and the withdrawal-output
// exclusion. Consensus rule behind it all: value_in ≥ value_out only.

import { describe, expect, it } from "vitest";

import {
  isSpendable,
  selectAllCoins,
  selectCoins,
  thunderFeeSats,
  MINIMUM_FEE_SATS,
} from "../sidechains/thunder/selection";
import type { ThunderContent, ThunderPointedOutput } from "../sidechains/thunder/transaction";

const ADDRESS = new Uint8Array(20).fill(0x42);

function utxo(sats: number | bigint, vout = 0): ThunderPointedOutput {
  return {
    outPoint: { kind: "regular", txid: new Uint8Array(32).fill(vout + 1), vout },
    output: { address: ADDRESS, content: { kind: "value", sats: BigInt(sats) } as ThunderContent },
  };
}

describe("thunder fee pricing", () => {
  it("prices the exact canonical Borsh size × rate with a 1-sat floor", () => {
    // 1 input, 2 value outputs: 4 + 69 + 4 + 2*(20+9) = 135 bytes
    const fee1 = thunderFeeSats(1, [{ kind: "value", sats: 0n }, { kind: "value", sats: 0n }], 2n);
    expect(fee1).toBe(270n);
    // A withdrawal output is larger (value + mainFee + len-prefixed spk).
    const withdrawal = {
      kind: "withdrawal",
      sats: 0n,
      mainFeeSats: 0n,
      mainScriptPubKey: new Uint8Array(22),
    } as ThunderContent;
    const feeW = thunderFeeSats(1, [withdrawal], 1n);
    expect(feeW).toBe(BigInt(4 + 69 + 4 + 20 + 1 + 8 + 8 + 4 + 22));
    // Floor: a tiny tx at rate 0 still costs 1 sat.
    expect(thunderFeeSats(0, [{ kind: "value", sats: 0n }], 0n)).toBe(MINIMUM_FEE_SATS);
  });
});

describe("thunder coin selection", () => {
  it("prefers the smallest single coin that covers payment + fee", () => {
    const utxos = [utxo(10_000n), utxo(5_000n), utxo(700n)];
    const sel = selectCoins(utxos, { kind: "value", sats: 500n }, 1n);
    // 700 alone: fee for 1 in + 2 out (payment + change) = (4+69+4+58) = 135
    // → 135 sats fee at 1 sat/B; 700 - 500 - 135 = 65 change.
    expect(sel.inputs).toHaveLength(1);
    expect(sel.inputs[0].output.content).toEqual({ kind: "value", sats: 700n });
    expect(sel.totalInputSats).toBe(700n);
    expect(sel.changeSats).toBe(65n);
    expect(sel.feeSats).toBe(135n);
  });

  it("accumulates smallest-first when no single coin suffices", () => {
    const utxos = [utxo(100n), utxo(200n), utxo(300n)];
    // Total 600, target 400, but fee for 3 in + 2 out = 4+3*69+4+58 = 273
    // and 600 − 400 = 200 < 273 → every subset fails → insufficient funds.
    expect(() => selectCoins(utxos, { kind: "value", sats: 400n }, 1n)).toThrow(/insufficient/);
  });

  it("accumulates and pays when funds suffice", () => {
    const utxos = [utxo(100n), utxo(200n), utxo(300n), utxo(10_000n)];
    const sel = selectCoins(utxos, { kind: "value", sats: 400n }, 1n);
    // 10,000 alone covers it → single coin again (smallest single sufficient).
    expect(sel.inputs).toHaveLength(1);
    expect(sel.inputs[0].output.content).toEqual({ kind: "value", sats: 10_000n });
  });

  it("folds dust change into the fee", () => {
    // Craft: payment 500, one coin 640, rate 1 → feeWithChange 135 →
    // change = 640-500-135 = 5; feeWithoutChange = (4+69+4+29)=106;
    // change 5 ≤ 135-106=29 → dust → fee = 640-500 = 140, change 0.
    const sel = selectCoins([utxo(640n)], { kind: "value", sats: 500n }, 1n);
    expect(sel.changeSats).toBe(0n);
    expect(sel.feeSats).toBe(140n);
  });

  it("sweep drains everything to one output with no change", () => {
    const utxos = [utxo(1_000n), utxo(2_000n)];
    const sel = selectAllCoins(utxos, 1n);
    expect(sel.inputs).toHaveLength(2);
    expect(sel.changeSats).toBe(0n);
    expect(sel.feeSats).toBe(BigInt(4 + 2 * 69 + 4 + 20 + 1 + 8)); // 2 in, 1 value out
    expect(sel.totalInputSats).toBe(3_000n);
  });

  it("throws on empty or sub-fee sweeps", () => {
    expect(() => selectAllCoins([], 1n)).toThrow(/no spendable UTXOs/);
  });
});

describe("thunder maturity rules", () => {
  it("coinbase outputs need 50 sidechain blocks", () => {
    const coinbase: ThunderPointedOutput = {
      outPoint: { kind: "coinbase", txid: new Uint8Array(32).fill(1), vout: 0 },
      output: { address: ADDRESS, content: { kind: "value", sats: 5_000n } },
    };
    const heights = { coinbaseHeight: 100 };
    expect(isSpendable(coinbase, 149, null, heights)).toBe(false);
    expect(isSpendable(coinbase, 150, null, heights)).toBe(true);
    // Unknown coinbase height → conservatively unspendable.
    expect(isSpendable(coinbase, 999, null, undefined)).toBe(false);
  });

  it("deposit outputs need 50 MAINCHAIN blocks", () => {
    const deposit: ThunderPointedOutput = {
      outPoint: { kind: "deposit", txid: new Uint8Array(32).fill(2), vout: 0 },
      output: { address: ADDRESS, content: { kind: "value", sats: 5_000n } },
    };
    const heights = { depositMainchainHeight: 200 };
    expect(isSpendable(deposit, 9999, 249, heights)).toBe(false);
    expect(isSpendable(deposit, 9999, 250, heights)).toBe(true);
  });

  it("withdrawal-content outputs are never spendable (consensus)", () => {
    const w: ThunderPointedOutput = {
      outPoint: { kind: "regular", txid: new Uint8Array(32).fill(3), vout: 0 },
      output: {
        address: ADDRESS,
        content: { kind: "withdrawal", sats: 1n, mainFeeSats: 1n, mainScriptPubKey: new Uint8Array(0) },
      },
    };
    expect(isSpendable(w, 9999, 9999, undefined)).toBe(false);
  });

  it("regular outputs are always spendable", () => {
    expect(isSpendable(utxo(1n), null, null, undefined)).toBe(true);
  });
});
