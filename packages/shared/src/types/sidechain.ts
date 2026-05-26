// packages/shared/src/types/sidechain.ts
//
// Type definitions for BIP-300/301 sidechains (Drivechains).
// The eCash fork launches with 8 sidechains.

/**
 * Unique sidechain slot number (0–255 per BIP-300).
 * Each sidechain occupies exactly one slot.
 */
export type SidechainSlot = number;

/**
 * Current operational status of a sidechain from the mainchain's perspective.
 */
export type SidechainStatus =
  | "active"      // Sidechain is live and accepting deposits/withdrawals
  | "proposed"    // Sidechain proposal is pending activation threshold
  | "inactive"    // Sidechain exists but is not currently producing blocks
  | "failed";     // Sidechain proposal failed to reach activation

/**
 * Descriptor for a single sidechain registered on the mainchain.
 */
export interface SidechainDescriptor {
  /** BIP-300 slot number (0-based) */
  readonly slot: SidechainSlot;

  /** Machine-readable identifier, e.g. "thunder", "zside" */
  readonly id: string;

  /** Human-readable display name, e.g. "Thunder Network" */
  readonly displayName: string;

  /**
   * Short description of the sidechain's purpose.
   * Shown in the wallet UI when browsing available sidechains.
   */
  readonly description: string;

  /** Current status on the mainchain */
  readonly status: SidechainStatus;

  /**
   * The sidechain's key hash as registered in the BIP-300 proposal.
   * Hex-encoded 256-bit hash. Empty string if not yet confirmed.
   */
  readonly keyHash: string;

  /**
   * Whether this sidechain supports Blind Merged Mining (BIP-301).
   * All 8 launch sidechains are expected to support BMM.
   */
  readonly supportsBmm: boolean;

  /**
   * Optional external URL for the sidechain's project page / documentation.
   */
  readonly infoUrl: string;
}

/**
 * Represents a BIP-300 deposit from the mainchain into a sidechain.
 */
export interface SidechainDeposit {
  /** Mainchain transaction ID containing the deposit */
  readonly mainchainTxid: string;

  /** Target sidechain slot */
  readonly slot: SidechainSlot;

  /** Amount in mainchain satoshis */
  readonly amountSatoshis: bigint;

  /** Sidechain-specific deposit address or script (hex) */
  readonly sidechainDepositData: string;

  /** Number of mainchain confirmations */
  readonly confirmations: number;

  /** Unix timestamp (seconds) of the mainchain block containing this deposit */
  readonly blockTimestamp: number;
}

/**
 * Represents a BIP-300 withdrawal bundle (WT^) being assembled or voted on.
 *
 * Withdrawals from a sidechain back to the mainchain require a
 * multi-block voting period where miners signal ACK/NACK on the bundle.
 */
export interface WithdrawalBundle {
  /** Unique identifier for this bundle (hash of the bundle transaction) */
  readonly bundleHash: string;

  /** Sidechain slot this bundle originates from */
  readonly slot: SidechainSlot;

  /**
   * Current ACK count from miners.
   * Bundle succeeds when acks >= threshold (typically 13,150 blocks / ~3 months).
   */
  readonly ackCount: number;

  /**
   * Current NACK count.
   * Bundle fails permanently if nacks exceed the failure threshold.
   */
  readonly nackCount: number;

  /**
   * Total number of blocks in the voting window that have passed.
   */
  readonly votingBlocksElapsed: number;

  /**
   * Total voting window length in blocks.
   * BIP-300 specifies 26,300 blocks (~6 months) for the withdrawal voting period.
   */
  readonly votingWindowBlocks: number;

  /**
   * The set of individual withdrawal outputs in this bundle.
   */
  readonly outputs: readonly WithdrawalOutput[];
}

/**
 * A single output within a withdrawal bundle, paying a mainchain address.
 */
export interface WithdrawalOutput {
  /** Mainchain destination address (base58 or bech32) */
  readonly destinationAddress: string;

  /** Amount in mainchain satoshis */
  readonly amountSatoshis: bigint;
}
