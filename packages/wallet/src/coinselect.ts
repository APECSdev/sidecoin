// packages/wallet/src/coinselect.ts
//
// Pure, deterministic coin selection for funding a signet transaction.
//
// This module is SELECTION ONLY: it chooses which UTXOs to spend and computes
// the fee/change split. It does NOT build, sign, or broadcast a transaction
// (signing/key-derivation does not exist in the keystore yet) — those layers
// will consume SelectionResult.inputs when they land.
//
// Operates on the wallet's Utxo type (re-exported from the frozen api-client).
// All math is bigint sats — never floating point — mirroring the precision
// discipline of coerceSats/satsToBtc.

import type { Utxo } from "./api";

// ---------------------------------------------------------------------------
// Consensus / policy constants
// ---------------------------------------------------------------------------

/**
 * Coinbase maturity in confirmations. A coinbase (block-reward) output is
 * consensus-unspendable until it reaches this depth; 100 on Bitcoin/signet.
 * The adapter/upstream reports the per-UTXO isCoinbase flag but does NOT
 * pre-filter maturity (by design), so selection MUST enforce it here.
 */
export const COINBASE_MATURITY = 100;

/** Default fee rate when the caller doesn't specify one (sats per vByte). */
export const DEFAULT_FEE_RATE_SATS_PER_VBYTE = 1n;

/**
 * Change-output dust threshold (sats). Change below this is uneconomical to
 * spend, so instead of creating a dust output we fold it into the fee (the
 * standard "donate dust to miner" behavior). 294 is the conventional P2WPKH
 * dust limit.
 */
export const DUST_THRESHOLD_SATS = 294n;

// ---------------------------------------------------------------------------
// vByte size model (P2WPKH, the only script the signet test wallet produces)
// ---------------------------------------------------------------------------

/**
 * Fixed transaction overhead in vBytes: 4 version + 4 locktime + ~1 input
 * count + ~1 output count + 0.5 segwit marker/flag + 0.5 rounding ≈ 11.
 */
const TX_OVERHEAD_VBYTES = 11n;

/** A single P2WPKH input contributes ~68 vBytes (outpoint + sequence + witness). */
const P2WPKH_INPUT_VBYTES = 68n;

/** A single P2WPKH output contributes ~31 vBytes (value + script). */
const P2WPKH_OUTPUT_VBYTES = 31n;

/** Estimate the vsize of a P2WPKH tx with the given input/output counts. */
export function estimateVsize(numInputs: number, numOutputs: number): bigint {
  return (
    TX_OVERHEAD_VBYTES +
    P2WPKH_INPUT_VBYTES * BigInt(numInputs) +
    P2WPKH_OUTPUT_VBYTES * BigInt(numOutputs)
  );
}

/** Absolute fee in sats for a tx of the given shape at the given rate. */
function feeForShape(
  numInputs: number,
  numOutputs: number,
  feeRate: bigint,
): bigint {
  return estimateVsize(numInputs, numOutputs) * feeRate;
}

// ---------------------------------------------------------------------------
// Selection API
// ---------------------------------------------------------------------------

export interface SelectionParams {
  /** Candidate UTXOs (typically a UtxosResult.utxos array). */
  utxos: Utxo[];
  /** Amount to send to the recipient, in sats. */
  targetSats: bigint;
  /** Fee rate in sats per vByte (defaults to DEFAULT_FEE_RATE_SATS_PER_VBYTE). */
  feeRateSatsPerVByte?: bigint;
  /**
   * Whether the candidate set was truncated upstream (UtxosResult.truncated).
   * Carried through to an insufficient_funds result so callers can warn that
   * the wallet may actually have more spendable coins than were considered.
   */
  truncated?: boolean;
  /** Override the coinbase maturity threshold (defaults to COINBASE_MATURITY). */
  coinbaseMaturity?: number;
}

/** A successful selection: inputs cover target + fee, with optional change. */
export interface SelectionOk {
  kind: "ok";
  /** The chosen UTXOs, in selection (largest-first) order. */
  inputs: Utxo[];
  /** Sum of the chosen inputs' values. */
  totalInSats: bigint;
  /** Absolute fee paid (sats). When hasChange is false this absorbs sub-dust change. */
  feeSats: bigint;
  /** Change returned to the wallet (0n when hasChange is false). */
  changeSats: bigint;
  /** Whether a change output is present (false when change would be dust). */
  hasChange: boolean;
}

/** Not enough mature, eligible value to cover target + fee. */
export interface SelectionInsufficient {
  kind: "insufficient_funds";
  /** Total eligible (mature) value available across all candidates. */
  availableSats: bigint;
  /**
   * Lower-bound requirement: target + the fee for a 1-output tx spending ALL
   * eligible UTXOs. A true funding would cost at least this much; it's a
   * floor, not the exact shortfall.
   */
  requiredSats: bigint;
  /** Echoes SelectionParams.truncated so the caller can soften the message. */
  truncated: boolean;
}

/** The target itself was invalid (non-positive or below the dust threshold). */
export interface SelectionInvalidTarget {
  kind: "invalid_target";
  message: string;
}

export type SelectionResult =
  | SelectionOk
  | SelectionInsufficient
  | SelectionInvalidTarget;

/**
 * Is this UTXO eligible to spend right now? Filters immature coinbase outputs
 * (the surgical per-UTXO maturity guard SupaQt's contract requires). Confirmed
 * non-coinbase outputs are always eligible; a global confirmations floor, if
 * desired, is applied upstream via the /utxos min_confirmations param.
 */
function isEligible(u: Utxo, coinbaseMaturity: number): boolean {
  if (u.isCoinbase && u.confirmations < coinbaseMaturity) return false;
  return true;
}

/**
 * Deterministic largest-first ordering. Sorts by value descending, then by
 * txid ascending, then vout ascending, so a given candidate set always yields
 * the same selection (important for reproducible tests and signing).
 */
function byLargestFirst(a: Utxo, b: Utxo): number {
  if (a.valueSats !== b.valueSats) return a.valueSats > b.valueSats ? -1 : 1;
  if (a.txid !== b.txid) return a.txid < b.txid ? -1 : 1;
  return a.vout - b.vout;
}

/**
 * Select UTXOs to fund `targetSats` using a largest-first strategy.
 *
 * Steps:
 *   1. Reject a non-positive or sub-dust target.
 *   2. Filter out immature coinbase UTXOs (consensus-unspendable).
 *   3. Sort the rest largest-first (deterministic tiebreak).
 *   4. Accumulate inputs until they cover target + fee (fee computed for the
 *      current input count plus recipient + change outputs).
 *   5. If the resulting change is below the dust threshold, drop the change
 *      output and fold the dust into the fee; otherwise return it as change.
 *
 * Returns a typed result rather than throwing, so callers can branch on
 * insufficient funds / invalid target without try/catch.
 */
export function selectCoins(params: SelectionParams): SelectionResult {
  const feeRate = params.feeRateSatsPerVByte ?? DEFAULT_FEE_RATE_SATS_PER_VBYTE;
  const maturity = params.coinbaseMaturity ?? COINBASE_MATURITY;
  const truncated = params.truncated ?? false;

  if (params.targetSats <= 0n) {
    return { kind: "invalid_target", message: "amount must be positive" };
  }
  if (params.targetSats < DUST_THRESHOLD_SATS) {
    return {
      kind: "invalid_target",
      message: `amount is below the dust threshold (${DUST_THRESHOLD_SATS} sats)`,
    };
  }

  const eligible = params.utxos
    .filter((u) => isEligible(u, maturity))
    .sort(byLargestFirst);

  const availableSats = eligible.reduce((acc, u) => acc + u.valueSats, 0n);

  const selected: Utxo[] = [];
  let total = 0n;

  for (const u of eligible) {
    selected.push(u);
    total += u.valueSats;

    // Fee assuming we still need a change output (recipient + change = 2).
    const feeWithChange = feeForShape(selected.length, 2, feeRate);

    if (total >= params.targetSats + feeWithChange) {
      const change = total - params.targetSats - feeWithChange;

      if (change >= DUST_THRESHOLD_SATS) {
        return {
          kind: "ok",
          inputs: selected,
          totalInSats: total,
          feeSats: feeWithChange,
          changeSats: change,
          hasChange: true,
        };
      }

      // Change would be dust: drop the change output (recipient only) and let
      // the leftover (target..total) be the fee. Since feeNoChange <
      // feeWithChange and total already covered target + feeWithChange, the
      // single-output tx is always affordable here.
      return {
        kind: "ok",
        inputs: selected,
        totalInSats: total,
        feeSats: total - params.targetSats,
        changeSats: 0n,
        hasChange: false,
      };
    }
  }

  // Couldn't cover target + fee even spending every eligible UTXO. Report the
  // floor requirement (target + fee for a 1-output tx over all eligible coins).
  const requiredSats =
    params.targetSats + feeForShape(eligible.length, 1, feeRate);

  return {
    kind: "insufficient_funds",
    availableSats,
    requiredSats,
    truncated,
  };
}
