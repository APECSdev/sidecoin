// packages/wallet/src/send.ts
//
// Pure helpers bridging the read API to the shared transaction layer for the
// Send flow. No I/O, no key material — trivially unit-testable.
//
//   parseCoinsToSats : decimal coin string ("0.005") -> bigint sats, lossless
//   toSpendableUtxo  : api-client read Utxo (valueSats) -> shared Utxo
//                      (amountSatoshis) consumed by selectCoins/the builder
//
// The shared Utxo type is imported as a TYPE ONLY, so this module has zero
// runtime dependency on @sidecoin/shared.

import type { Utxo as ReadUtxo } from "./api";
import type { Utxo as SpendableUtxo } from "@sidecoin/shared";

/** Satoshis per whole coin (1 coin = 100,000,000 sats). */
const SATS_PER_COIN = 100_000_000n;

/**
 * Parse a decimal coin amount into bigint satoshis, losslessly.
 *
 * Accepts a non-negative decimal with up to 8 fractional digits ("1", "1.5",
 * "0.00000001"). Rejects anything else (negative, multiple dots, non-digits,
 * or more than 8 decimal places) by throwing — never uses floating point.
 */
export function parseCoinsToSats(input: string): bigint {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(
      `Invalid amount "${input}": expected a non-negative decimal number.`,
    );
  }
  const [whole, frac = ""] = s.split(".");
  if (frac.length > 8) {
    throw new Error(
      `Amount "${input}" has more than 8 decimal places ` +
        `(the smallest unit is 1 sat).`,
    );
  }
  return BigInt(whole) * SATS_PER_COIN + BigInt(frac.padEnd(8, "0"));
}

/**
 * Map a read-API UTXO to the shared spendable UTXO shape.
 *
 * Field bridges: valueSats -> amountSatoshis (already bigint). isLocked has
 * no source in the read API (nothing is reserved) so it is false.
 * derivationPath is "" — the builder matches inputs to signing keys by
 * scriptPubKey, not by path, so the path is metadata only here.
 */
export function toSpendableUtxo(u: ReadUtxo): SpendableUtxo {
  return {
    txid: u.txid,
    vout: u.vout,
    amountSatoshis: u.valueSats,
    scriptPubKey: u.scriptPubKey,
    address: u.address,
    derivationPath: "",
    confirmations: u.confirmations,
    isLocked: false,
    blockHeight: u.blockHeight,
    isCoinbase: u.isCoinbase,
  };
}
