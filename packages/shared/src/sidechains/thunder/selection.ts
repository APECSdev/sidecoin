// packages/shared/src/sidechains/thunder/selection.ts
//
// Coin selection for Thunder sends — a client-side policy (the node serves
// UTXOs and relays; it does not select). Mirrors thunder-rust's own wallet
// rule (lib/wallet/mod.rs::select_coins, MIT):
//
//   - sort UTXos ascending by value, accumulate smallest-first until the
//     running total exceeds the target, then stop;
//   - SKIP immature coinbase outputs (sidechain tip must be ≥
//     COINBASE_MATURITY = 50 blocks past the coinbase's block);
//   - SKIP immature deposit outputs (mainchain tip must be ≥
//     DEPOSIT_MATURITY = 50 blocks past the deposit's mainchain block);
//   - SKIP outputs with withdrawal content (consensus forbids spending
//     them — thunder-rust f585f25; they are also excluded from balance);
//   - NotEnoughFunds if the total never reaches the target.
//
// Fee model: Thunder's ONLY consensus rule is value_in ≥ value_out
// (NotEnoughValueIn) — no min-relay floor, no vbyte/weight concept. The fee
// is priced off the transaction's exact canonical Borsh size (every field
// fixed-width) × the requested sat/byte, with a 1-sat floor so a free
// transaction is never submitted. Change worth less than the output it
// would occupy is folded into the fee instead of creating dust.

import {
  COINBASE_MATURITY_BLOCKS,
  DEPOSIT_MATURITY_BLOCKS,
} from "./maturity";
import {
  contentValueSats,
  transactionBorshSize,
  type ThunderContent,
  type ThunderPointedOutput,
} from "./transaction";

/** Never emit a zero-fee transaction, whatever the rate rounds to. */
export const MINIMUM_FEE_SATS = 1n;

/** Fee for a transaction of `inputCount` inputs and exactly these outputs. */
export function thunderFeeSats(
  inputCount: number,
  outputs: ThunderContent[],
  satPerByte: bigint,
): bigint {
  const size = BigInt(transactionBorshSize(inputCount, outputs));
  const fee = size * satPerByte;
  return fee < MINIMUM_FEE_SATS ? MINIMUM_FEE_SATS : fee;
}

/** The result of choosing which UTXOs to spend. The fee is implicit —
 * value_in − value_out — so it is the gap we must leave, not a field. */
export interface ThunderCoinSelection {
  inputs: ThunderPointedOutput[];
  changeSats: bigint;
  feeSats: bigint;
  totalInputSats: bigint;
}

/**
 * Whether a UTXO is spendable at the given heights. Coinbase outputs need
 * sidechain tip ≥ coinbase_height + 50; deposit outputs need mainchain tip
 * ≥ deposit_height + 50; withdrawal-content outputs are never spendable.
 * The heights are passed in by the caller (the wallet service knows the
 * sidechain tip; deposit/coinbase heights come from the backend rows —
 * callers without that data pass null and immature-relevant outputs are
 * conservatively skipped only when their height is known).
 */
export function isSpendable(
  utxo: ThunderPointedOutput,
  sidechainTipHeight: number | null,
  mainchainTipHeight: number | null,
  utxoHeights: { coinbaseHeight?: number; depositMainchainHeight?: number } | undefined,
): boolean {
  if (utxo.output.content.kind === "withdrawal") {
    return false;
  }
  switch (utxo.outPoint.kind) {
    case "coinbase": {
      const h = utxoHeights?.coinbaseHeight;
      if (h === undefined) return false; // unknown maturity → cannot spend
      return sidechainTipHeight !== null && sidechainTipHeight >= h + COINBASE_MATURITY_BLOCKS;
    }
    case "deposit": {
      const h = utxoHeights?.depositMainchainHeight;
      if (h === undefined) return false;
      return mainchainTipHeight !== null && mainchainTipHeight >= h + DEPOSIT_MATURITY_BLOCKS;
    }
    default:
      return true;
  }
}

/**
 * Select coins to pay `payment` (a value output or a withdrawal — a
 * withdrawal removes BOTH the payout and its mainchain fee from the
 * sidechain, so both count toward the target) plus a fee priced on the real
 * output sizes, locking as little of the balance as possible: coins parked
 * by a spend (including change) are unspendable until the next block.
 *
 * 1. the smallest single coin that covers payment + fee on its own, else
 * 2. coins smallest-first until they cover it.
 * Leftover change worth less than the output it would occupy is dropped
 * into the fee. Insufficient funds throws.
 */
export function selectCoins(
  utxos: ThunderPointedOutput[],
  payment: ThunderContent,
  satPerByte: bigint,
): ThunderCoinSelection {
  const target = contentValueSats(payment);
  const available = utxos.reduce((sum, u) => sum + contentValueSats(u.output.content), 0n);

  const ascending = [...utxos].sort((a, b) => {
    const av = contentValueSats(a.output.content);
    const bv = contentValueSats(b.output.content);
    if (av !== bv) return av < bv ? -1 : 1;
    return 0;
  });

  // 1. Smallest single coin that pays for everything by itself.
  for (const utxo of ascending) {
    const settled = settle([utxo], payment, satPerByte);
    if (settled) return settled;
  }
  // 2. No single coin is enough: accumulate smallest-first.
  const selected: ThunderPointedOutput[] = [];
  for (const utxo of ascending) {
    selected.push(utxo);
    const settled = settle(selected, payment, satPerByte);
    if (settled) return settled;
  }

  throw new Error(
    `Thunder: insufficient funds — needed ${target} sats (plus fee), available ${available} sats`,
  );
}

/** `selected` as a finished selection, or null if it cannot cover payment +
 * fee. Priced as payment + change; change cheaper than its own output is
 * folded into the fee. */
function settle(
  selected: ThunderPointedOutput[],
  payment: ThunderContent,
  satPerByte: bigint,
): ThunderCoinSelection | null {
  const target = contentValueSats(payment);
  const total = selected.reduce((sum, u) => sum + contentValueSats(u.output.content), 0n);
  const feeWithChange = thunderFeeSats(selected.length, [payment, { kind: "value", sats: 0n }], satPerByte);
  if (total < target || total - target < feeWithChange) return null;

  const change = total - target - feeWithChange;
  const feeWithoutChange = thunderFeeSats(selected.length, [payment], satPerByte);
  if (change <= feeWithChange - feeWithoutChange) {
    // Cheaper to hand the dust to the fee than to create the output.
    return { inputs: selected, changeSats: 0n, feeSats: total - target, totalInputSats: total };
  }
  return { inputs: selected, changeSats: change, feeSats: feeWithChange, totalInputSats: total };
}

/**
 * Drain every spendable UTXO to a single output — the true "Max"/sweep.
 * The amount sent is whatever is left after the fee; there is no change.
 */
export function selectAllCoins(
  utxos: ThunderPointedOutput[],
  satPerByte: bigint,
): ThunderCoinSelection {
  if (utxos.length === 0) {
    throw new Error("Thunder: insufficient funds — no spendable UTXOs");
  }
  const total = utxos.reduce((sum, u) => sum + contentValueSats(u.output.content), 0n);
  const fee = thunderFeeSats(utxos.length, [{ kind: "value", sats: 0n }], satPerByte);
  if (total <= fee) {
    throw new Error(`Thunder: insufficient funds — ${total} sats available, fee is ${fee}`);
  }
  return { inputs: utxos, changeSats: 0n, feeSats: fee, totalInputSats: total };
}
