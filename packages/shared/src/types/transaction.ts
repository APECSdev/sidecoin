// packages/shared/src/types/transaction.ts
//
// Shared transaction types for the mainchain UTXO model.
// These are intentionally kept generic enough to be used
// across web, mobile, and desktop without platform-specific imports.

import type { SidechainSlot } from "./sidechain";

/**
 * Supported address formats for display and validation.
 */
export type AddressFormat =
  | "p2pkh"    // Legacy 1... addresses
  | "p2sh"     // Script 3... addresses
  | "p2wpkh"   // Native SegWit bech32 bc1q...
  | "p2wsh"    // SegWit script bc1q...
  | "p2tr"     // Taproot bc1p...
  | "unknown";

/**
 * Direction of a transaction relative to the wallet.
 */
export type TransactionDirection = "incoming" | "outgoing" | "self";

/**
 * Confirmation status of a transaction.
 */
export type TransactionStatus =
  | "pending"     // In mempool, 0 confirmations
  | "confirming"  // 1–5 confirmations (configurable threshold)
  | "confirmed"   // >= 6 confirmations (or user-configured threshold)
  | "failed";     // Double-spent or otherwise invalidated

/**
 * Represents a single unspent transaction output (UTXO) in the wallet.
 */
export interface Utxo {
  /** Transaction ID (hex, 64 chars) */
  readonly txid: string;

  /** Output index within the transaction */
  readonly vout: number;

  /** Value in satoshis */
  readonly amountSatoshis: bigint;

  /** Locking script (scriptPubKey) as hex */
  readonly scriptPubKey: string;

  /** Address derived from the scriptPubKey, if decodable */
  readonly address: string;

  /** BIP-32 derivation path that controls this UTXO, e.g. "m/84'/0'/0'/0/7" */
  readonly derivationPath: string;

  /** Number of confirmations. 0 = mempool. */
  readonly confirmations: number;

  /**
   * Whether this UTXO is currently reserved (locked) for a pending
   * transaction that hasn't been broadcast or confirmed yet.
   */
  readonly isLocked: boolean;

  /**
   * Block height at which this UTXO was confirmed.
   * -1 if still in the mempool.
   */
  readonly blockHeight: number;

  /**
   * Whether this UTXO originates from a coinbase transaction (the block's
   * reward output). Maps from the indexer's snake_case `coinbase` field.
   *
   * Coinbase outputs are consensus-unspendable until ConsensusParams
   * .coinbaseMaturity (100) confirmations; coin-selection MUST exclude any
   * coinbase UTXO with confirmations < coinbaseMaturity, or the signed tx
   * will be rejected at broadcast (bad-txns-premature-spend-of-coinbase).
   */
  readonly isCoinbase: boolean;
}

/**
 * A wallet-level transaction record combining on-chain data
 * with wallet-specific metadata (labels, direction, etc.).
 */
export interface WalletTransaction {
  /** Transaction ID (hex) */
  readonly txid: string;

  /** Direction relative to this wallet */
  readonly direction: TransactionDirection;

  /** Current confirmation status */
  readonly status: TransactionStatus;

  /** Number of confirmations */
  readonly confirmations: number;

  /** Block height (-1 if unconfirmed) */
  readonly blockHeight: number;

  /** Block timestamp as Unix seconds (-1 if unconfirmed) */
  readonly blockTimestamp: number;

  /** Total amount sent/received in satoshis (absolute value, always positive) */
  readonly amountSatoshis: bigint;

  /** Fee paid in satoshis (0 for incoming transactions) */
  readonly feeSatoshis: bigint;

  /**
   * For outgoing: the destination address(es).
   * For incoming: the receiving address(es) belonging to this wallet.
   */
  readonly addresses: readonly string[];

  /**
   * User-defined label/memo for this transaction.
   * Stored locally, never broadcast.
   */
  readonly label: string;

  /**
   * If this transaction is a BIP-300 sidechain deposit,
   * the target sidechain slot. -1 if not a sidechain deposit.
   */
  readonly sidechainDepositSlot: number;

  /**
   * Raw transaction hex, stored for potential re-broadcast or debugging.
   * May be empty string if the wallet only tracks metadata.
   */
  readonly rawHex: string;
}

/**
 * Parameters for constructing a new transaction.
 * Used by the transaction builder across all platforms.
 */
export interface TransactionBuildParams {
  /** Destination address */
  readonly toAddress: string;

  /** Amount to send in satoshis */
  readonly amountSatoshis: bigint;

  /**
   * Fee rate in satoshis per virtual byte (sat/vB).
   * If not provided, the wallet should estimate from the mempool.
   */
  readonly feeRateSatPerVb?: number;

  /**
   * Optional: manually selected UTXOs to spend.
   * If empty/undefined, the wallet performs automatic coin selection.
   */
  readonly selectedUtxos?: readonly Utxo[];

  /**
   * Whether to enable Replace-By-Fee (BIP-125) signaling.
   * Defaults to true for better fee-bumping UX.
   */
  readonly enableRbf?: boolean;

  /**
   * Optional user label/memo to attach to the transaction record.
   */
  readonly label?: string;

  /**
   * If this transaction is a BIP-300 sidechain deposit,
   * specify the target slot and sidechain deposit data.
   */
  readonly sidechainDeposit?: {
    readonly slot: SidechainSlot;
    readonly depositData: string;
  };
}
