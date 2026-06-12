// packages/shared/src/tx/fee.ts
//
// Fee + virtual-size estimation for native-SegWit (P2WPKH) transactions.
//
// These helpers are PURE arithmetic — no key material, no network. They let
// coin-selection (step 3) and the SendView preview compute a fee BEFORE the
// transaction is built, then hand an explicit feeSatoshis to the builder so
// the builder itself stays deterministic and trivially testable.
//
// vsize model (BIP-141 weight units / 4, rounded up):
//   fixed overhead : 4 (version) + 4 (locktime) + ~1 (in count) + ~1 (out
//                    count) + 0.5 (segwit marker+flag, weight 2 / 4) ≈ 10.75 vB
//   per P2WPKH in  : 36 (outpoint) + 1 (empty scriptSig len) + 4 (sequence)
//                    + witness(1 items + ~72 sig + ~33 pubkey)/4 ≈ 68 vB
//   per P2WPKH out : 8 (value) + 1 (script len) + 22 (script) = 31 vB
//
// These are the widely-used conservative constants; a real signature can be
// 1 byte shorter (low-S/DER length variance), so actual vsize may come in at
// or just under the estimate. We round UP so we never under-pay relay fee.

/** Standard P2WPKH dust threshold in satoshis (outputs below this are spam). */
export const DUST_LIMIT_SATS = 546n;

/** Estimated overhead vbytes for a segwit transaction (excludes in/outputs). */
export const TX_OVERHEAD_VBYTES = 10.75;

/** Estimated vbytes contributed by a single P2WPKH input. */
export const P2WPKH_INPUT_VBYTES = 68;

/** Estimated vbytes contributed by a single P2WPKH output. */
export const P2WPKH_OUTPUT_VBYTES = 31;

/**
 * Estimate the virtual size (vbytes) of a P2WPKH-only transaction.
 *
 * @param numInputs  - Number of P2WPKH inputs being spent
 * @param numOutputs - Number of outputs (recipient + optional change)
 * @returns Estimated vsize in vbytes, rounded up
 */
export function estimateP2wpkhVsize(
  numInputs: number,
  numOutputs: number,
): number {
  if (!Number.isInteger(numInputs) || numInputs < 1) {
    throw new Error(`numInputs must be a positive integer, got ${numInputs}.`);
  }
  if (!Number.isInteger(numOutputs) || numOutputs < 1) {
    throw new Error(`numOutputs must be a positive integer, got ${numOutputs}.`);
  }

  return Math.ceil(
    TX_OVERHEAD_VBYTES +
      P2WPKH_INPUT_VBYTES * numInputs +
      P2WPKH_OUTPUT_VBYTES * numOutputs,
  );
}

/**
 * Estimate the absolute fee (satoshis) for a P2WPKH-only transaction.
 *
 * @param numInputs       - Number of P2WPKH inputs
 * @param numOutputs      - Number of outputs (recipient + optional change)
 * @param feeRateSatPerVb - Desired fee rate in sat/vB
 * @returns Fee in satoshis as a bigint, rounded up
 */
export function estimateP2wpkhFee(
  numInputs: number,
  numOutputs: number,
  feeRateSatPerVb: number,
): bigint {
  if (!Number.isFinite(feeRateSatPerVb) || feeRateSatPerVb <= 0) {
    throw new Error(
      `feeRateSatPerVb must be a positive number, got ${feeRateSatPerVb}.`,
    );
  }

  const vsize = estimateP2wpkhVsize(numInputs, numOutputs);
  return BigInt(Math.ceil(vsize * feeRateSatPerVb));
}
