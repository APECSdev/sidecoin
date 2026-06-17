// packages/shared/src/tx/coin-selection.ts
//
// Coin selection for native-SegWit (P2WPKH) spends.
//
// PURE: no key material, no network. Given a candidate UTXO set, a target
// amount, and a fee rate, it picks inputs and computes the fee + change so
// the result can be handed straight to buildAndSignP2wpkhTransaction().
//
// The fee here is computed with the SAME estimator the builder's preview path
// uses (fee.ts), and the change rule mirrors the builder EXACTLY:
//   change is created only when it strictly exceeds DUST_LIMIT_SATS; otherwise
//   the sub-dust remainder is folded into the fee (no change output).
// Because of that mirroring, the {selectedUtxos, feeSatoshis, target} this
// returns reproduce byte-for-byte the same input/output shape the builder will
// finalize — see the balance identity asserted in the test suite.
//
// POLICY enforced here (the indexer reports facts, we apply policy):
//   - confirmations  >= minConfirmations          (default 1; mempool opt-in)
//   - coinbase outputs must be MATURE              (confirmations >= maturity)
//     i.e. skip { isCoinbase: true, confirmations < coinbaseMaturity }.
//     This is the surgical, per-UTXO guard SupaQt's /utxos endpoint expects;
//     without it a selected immature coinbase yields a tx the node rejects
//     with bad-txns-premature-spend-of-coinbase.
//   - isLocked outputs are never spent (reserved for a pending tx).
//
// Strategy: largest-first (descending value). Simple, deterministic, and
// minimizes input count for typical spends. The fee is re-estimated as each
// input is added, because every added P2WPKH input grows the vsize (~68 vB)
// and therefore the required fee.

import type { Utxo } from "../types/transaction";
import { DUST_LIMIT_SATS, estimateOpReturnFee, estimateP2wpkhFee } from "./fee";

/** Default minimum confirmations for a UTXO to be spendable. */
export const DEFAULT_MIN_CONFIRMATIONS = 1;

/**
 * Default coinbase maturity in confirmations. Mirrors
 * ConsensusParams.coinbaseMaturity (100) in network.ts.
 */
export const DEFAULT_COINBASE_MATURITY = 100;

/** Parameters for selecting coins for a P2WPKH spend. */
export interface CoinSelectionParams {
  /** Candidate UTXOs (typically the wallet's full unspent set). */
  readonly utxos: readonly Utxo[];

  /** Amount to send to the recipient, in satoshis. */
  readonly targetSatoshis: bigint;

  /** Fee rate in sat/vB used to size the fee as inputs are added. */
  readonly feeRateSatPerVb: number;

  /** Minimum confirmations to consider a UTXO spendable. Default 1. */
  readonly minConfirmations?: number;

  /** Confirmations required for a coinbase UTXO to be mature. Default 100. */
  readonly coinbaseMaturity?: number;
}

/** The chosen inputs plus the fee/change accounting for the builder + UI. */
export interface CoinSelectionResult {
  /** UTXOs to spend, in selection order (largest-first). */
  readonly selectedUtxos: readonly Utxo[];

  /**
   * Absolute fee in satoshis to pass to buildAndSignP2wpkhTransaction().
   * For the no-change case this already includes any folded sub-dust remainder
   * (it equals totalInput - target), so the builder reproduces it exactly.
   */
  readonly feeSatoshis: bigint;

  /** Change output value, or 0 when change was folded into the fee. */
  readonly changeSatoshis: bigint;

  /** Whether a change output will be created. */
  readonly hasChange: boolean;

  /** Sum of all selected input values, in satoshis. */
  readonly totalInputSatoshis: bigint;

  /** Output count used to size the fee (1 = recipient only, 2 = + change). */
  readonly numOutputs: number;
}

/**
 * Select P2WPKH coins for a spend.
 *
 * @throws If the target is non-positive or below dust, if the fee rate is
 *         non-positive, or if no combination of spendable UTXOs covers
 *         target + fee (insufficient funds).
 */
export function selectCoins(params: CoinSelectionParams): CoinSelectionResult {
  const {
    utxos,
    targetSatoshis,
    feeRateSatPerVb,
    minConfirmations = DEFAULT_MIN_CONFIRMATIONS,
    coinbaseMaturity = DEFAULT_COINBASE_MATURITY,
  } = params;

  // ----- validation -------------------------------------------------------
  if (targetSatoshis <= 0n) {
    throw new Error(`Target amount must be positive, got ${targetSatoshis}.`);
  }
  if (targetSatoshis < DUST_LIMIT_SATS) {
    throw new Error(
      `Target amount ${targetSatoshis} is below the dust limit ` +
        `${DUST_LIMIT_SATS}.`,
    );
  }
  if (!Number.isFinite(feeRateSatPerVb) || feeRateSatPerVb <= 0) {
    throw new Error(
      `feeRateSatPerVb must be a positive number, got ${feeRateSatPerVb}.`,
    );
  }

  // ----- filter to spendable UTXOs (apply policy) -------------------------
  const spendable = utxos.filter((u) => {
    if (u.isLocked) return false;
    if (u.confirmations < minConfirmations) return false;
    // Coinbase maturity is independent of (and stricter than) the general
    // min-confirmations floor: a coinbase needs >= coinbaseMaturity confs.
    if (u.isCoinbase && u.confirmations < coinbaseMaturity) return false;
    return true;
  });

  // ----- largest-first accumulation ---------------------------------------
  const sorted = [...spendable].sort((a, b) =>
    a.amountSatoshis < b.amountSatoshis
      ? 1
      : a.amountSatoshis > b.amountSatoshis
        ? -1
        : 0,
  );

  const selected: Utxo[] = [];
  let totalInputSatoshis = 0n;

  for (const utxo of sorted) {
    selected.push(utxo);
    totalInputSatoshis += utxo.amountSatoshis;
    const numInputs = selected.length;

    // Case 1 — try WITH a change output (recipient + change = 2 outputs).
    const feeWithChange = estimateP2wpkhFee(numInputs, 2, feeRateSatPerVb);
    if (totalInputSatoshis >= targetSatoshis + feeWithChange) {
      const change = totalInputSatoshis - targetSatoshis - feeWithChange;
      // Mirror the builder: change only if it strictly clears dust.
      if (change > DUST_LIMIT_SATS) {
        return {
          selectedUtxos: selected,
          feeSatoshis: feeWithChange,
          changeSatoshis: change,
          hasChange: true,
          totalInputSatoshis,
          numOutputs: 2,
        };
      }
    }

    // Case 2 — no worthwhile change: recipient only (1 output). If we can
    // afford that, fold any sub-dust remainder into the fee, exactly as the
    // builder does. feeSatoshis = totalInput - target makes the builder's
    // rawChange 0, so it produces the identical no-change shape.
    const feeNoChange = estimateP2wpkhFee(numInputs, 1, feeRateSatPerVb);
    if (totalInputSatoshis >= targetSatoshis + feeNoChange) {
      return {
        selectedUtxos: selected,
        feeSatoshis: totalInputSatoshis - targetSatoshis,
        changeSatoshis: 0n,
        hasChange: false,
        totalInputSatoshis,
        numOutputs: 1,
      };
    }

    // Otherwise this prefix can't even fund the cheapest (no-change) tx — add
    // the next-largest input and try again.
  }

  // ----- insufficient funds -----------------------------------------------
  let available = 0n;
  for (const u of spendable) available += u.amountSatoshis;
  throw new Error(
    `Insufficient funds: ${spendable.length} spendable UTXO(s) totalling ` +
      `${available} sat cannot cover target ${targetSatoshis} plus fee at ` +
      `${feeRateSatPerVb} sat/vB.`,
  );
}


/** Parameters for selecting coins for a zero-value OP_RETURN metadata spend. */
export interface OpReturnCoinSelectionParams {
  /** Candidate UTXOs (typically the wallet's full unspent set). */
  readonly utxos: readonly Utxo[];

  /** Full OP_RETURN scriptPubKey length in bytes. */
  readonly opReturnScriptLength: number;

  /** Fee rate in sat/vB used to size the fee as inputs are added. */
  readonly feeRateSatPerVb: number;

  /** Minimum confirmations to consider a UTXO spendable. Default 1. */
  readonly minConfirmations?: number;

  /** Confirmations required for a coinbase UTXO to be mature. Default 100. */
  readonly coinbaseMaturity?: number;
}

/** The chosen inputs plus fee/change accounting for OP_RETURN tx building. */
export interface OpReturnCoinSelectionResult {
  /** UTXOs to spend, in selection order (largest-first). */
  readonly selectedUtxos: readonly Utxo[];

  /**
   * Absolute fee in satoshis to pass to buildAndSignOpReturnTransaction().
   * For the no-change case this equals totalInputSatoshis because the entire
   * selected input value is paid as fee with only a zero-value OP_RETURN output.
   */
  readonly feeSatoshis: bigint;

  /** Change output value, or 0 when change was folded into the fee. */
  readonly changeSatoshis: bigint;

  /** Whether a change output will be created. */
  readonly hasChange: boolean;

  /** Sum of all selected input values, in satoshis. */
  readonly totalInputSatoshis: bigint;

  /** Output count used to size the fee (1 = OP_RETURN, 2 = + change). */
  readonly numOutputs: number;
}

/**
 * Select P2WPKH coins for a metadata-only OP_RETURN transaction.
 *
 * The OP_RETURN output carries zero value. Inputs fund only the relay fee and
 * optional wallet change. If the remainder does not strictly exceed dust, no
 * change output is created and the entire selected input value becomes fee.
 */
export function selectCoinsForOpReturn(
  params: OpReturnCoinSelectionParams,
): OpReturnCoinSelectionResult {
  const {
    utxos,
    opReturnScriptLength,
    feeRateSatPerVb,
    minConfirmations = DEFAULT_MIN_CONFIRMATIONS,
    coinbaseMaturity = DEFAULT_COINBASE_MATURITY,
  } = params;

  // ----- validation -------------------------------------------------------
  if (!Number.isInteger(opReturnScriptLength) || opReturnScriptLength < 1) {
    throw new Error(
      `opReturnScriptLength must be a positive integer, got ${opReturnScriptLength}.`,
    );
  }
  if (!Number.isFinite(feeRateSatPerVb) || feeRateSatPerVb <= 0) {
    throw new Error(
      `feeRateSatPerVb must be a positive number, got ${feeRateSatPerVb}.`,
    );
  }

  // ----- filter to spendable UTXOs (apply policy) -------------------------
  const spendable = utxos.filter((u) => {
    if (u.isLocked) return false;
    if (u.confirmations < minConfirmations) return false;
    // Coinbase maturity is independent of (and stricter than) the general
    // min-confirmations floor: a coinbase needs >= coinbaseMaturity confs.
    if (u.isCoinbase && u.confirmations < coinbaseMaturity) return false;
    return true;
  });

  // ----- largest-first accumulation ---------------------------------------
  const sorted = [...spendable].sort((a, b) =>
    a.amountSatoshis < b.amountSatoshis
      ? 1
      : a.amountSatoshis > b.amountSatoshis
        ? -1
        : 0,
  );

  const selected: Utxo[] = [];
  let totalInputSatoshis = 0n;

  for (const utxo of sorted) {
    selected.push(utxo);
    totalInputSatoshis += utxo.amountSatoshis;
    const numInputs = selected.length;

    // Case 1 — try WITH a change output (OP_RETURN + change = 2 outputs).
    const feeWithChange = estimateOpReturnFee(
      numInputs,
      opReturnScriptLength,
      true,
      feeRateSatPerVb,
    );
    if (totalInputSatoshis >= feeWithChange) {
      const change = totalInputSatoshis - feeWithChange;
      // Mirror the builder: change only if it strictly clears dust.
      if (change > DUST_LIMIT_SATS) {
        return {
          selectedUtxos: selected,
          feeSatoshis: feeWithChange,
          changeSatoshis: change,
          hasChange: true,
          totalInputSatoshis,
          numOutputs: 2,
        };
      }
    }

    // Case 2 — no worthwhile change: OP_RETURN only. If we can afford the
    // relay-sized fee, fold the whole selected input into the effective fee.
    const feeNoChange = estimateOpReturnFee(
      numInputs,
      opReturnScriptLength,
      false,
      feeRateSatPerVb,
    );
    if (totalInputSatoshis >= feeNoChange) {
      return {
        selectedUtxos: selected,
        feeSatoshis: totalInputSatoshis,
        changeSatoshis: 0n,
        hasChange: false,
        totalInputSatoshis,
        numOutputs: 1,
      };
    }

    // Otherwise this prefix cannot fund even the no-change metadata tx — add
    // the next-largest input and try again.
  }

  // ----- insufficient funds -----------------------------------------------
  let available = 0n;
  for (const u of spendable) available += u.amountSatoshis;
  throw new Error(
    `Insufficient funds: ${spendable.length} spendable UTXO(s) totalling ` +
      `${available} sat cannot cover OP_RETURN fee at ` +
      `${feeRateSatPerVb} sat/vB.`,
  );
}
