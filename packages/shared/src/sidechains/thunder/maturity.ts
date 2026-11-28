// packages/shared/src/sidechains/thunder/maturity.ts
//
// Thunder consensus maturity constants (thunder-rust
// types/transaction/outpoint.rs):
//
//   COINBASE_MATURITY = 50 — a coinbase output becomes spendable when the
//     sidechain tip is ≥ 50 blocks past the sidechain block that created it.
//   DEPOSIT_MATURITY  = 50 — a deposit output becomes spendable when the
//     MAINCHAIN tip is ≥ 50 blocks past the mainchain block that carried the
//     M5 deposit transaction.

export const COINBASE_MATURITY_BLOCKS = 50;
export const DEPOSIT_MATURITY_BLOCKS = 50;
