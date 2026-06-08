// packages/shared/src/chain/utils.ts
//
// Utility functions for chain-related calculations:
// fork countdown, subsidy schedule, sidechain deposit
// thresholds, and address format detection.

import type { ChainConfig, AddressFormat } from "../types";

// ---------------------------------------------------------------------------
// Satoshi / Coin Conversion
// ---------------------------------------------------------------------------

/** Number of satoshis per whole coin (1 BTC = 100,000,000 sat) */
export const SATOSHIS_PER_COIN = BigInt("100000000");

/**
 * Convert a satoshi amount to a human-readable coin string.
 *
 * @param satoshis - Amount in satoshis
 * @param decimals - Number of decimal places to display (default: 8)
 * @returns Formatted string, e.g. "0.00312500"
 */
export function satoshisToCoin(satoshis: bigint, decimals: number = 8): string {
  const isNegative = satoshis < BigInt(0);
  const absSatoshis = isNegative ? -satoshis : satoshis;

  const whole = absSatoshis / SATOSHIS_PER_COIN;
  const fraction = absSatoshis % SATOSHIS_PER_COIN;

  // Pad fractional part to 8 digits, then truncate to requested precision
  const fractionStr = fraction.toString().padStart(8, "0").slice(0, decimals);

  const sign = isNegative ? "-" : "";

  if (decimals === 0) {
    return `${sign}${whole.toString()}`;
  }

  return `${sign}${whole.toString()}.${fractionStr}`;
}

/**
 * Convert a coin amount string to satoshis.
 *
 * @param coinStr - Amount as a decimal string, e.g. "0.5" or "1.00000001"
 * @returns Amount in satoshis
 * @throws Error if the string cannot be parsed
 */
export function coinToSatoshis(coinStr: string): bigint {
  const trimmed = coinStr.trim();

  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid coin amount: "${coinStr}"`);
  }

  const isNegative = trimmed.startsWith("-");
  const absolute = isNegative ? trimmed.slice(1) : trimmed;

  const parts = absolute.split(".");
  const wholePart = parts[0] || "0";
  const fracPart = (parts[1] || "").padEnd(8, "0").slice(0, 8);

  const totalSatoshis = BigInt(wholePart) * SATOSHIS_PER_COIN + BigInt(fracPart);

  return isNegative ? -totalSatoshis : totalSatoshis;
}

// ---------------------------------------------------------------------------
// Fork Countdown
// ---------------------------------------------------------------------------

/**
 * Calculate the time remaining until the eCash hard fork activation.
 *
 * @param config - The chain configuration containing fork parameters
 * @param now - Current time (defaults to Date.now() for testability)
 * @returns Object with days, hours, minutes, seconds remaining; negative if past
 */
export function getForkCountdown(
  config: ChainConfig,
  now: number = Date.now()
): {
  totalMilliseconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
} {
  const activationMs = new Date(config.fork.activationTimestampUtc).getTime();
  const totalMilliseconds = activationMs - now;
  const isPast = totalMilliseconds <= 0;

  const absDiff = Math.abs(totalMilliseconds);

  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

  return { totalMilliseconds, days, hours, minutes, seconds, isPast };
}

// ---------------------------------------------------------------------------
// Block Subsidy Schedule
// ---------------------------------------------------------------------------

/**
 * Calculate the block subsidy (coinbase reward) at a given block height.
 *
 * Follows Bitcoin's halving schedule: subsidy halves every `halvingInterval` blocks.
 *
 * @param config - The chain configuration
 * @param blockHeight - The block height to calculate the subsidy for
 * @returns Subsidy in satoshis
 */
export function getBlockSubsidy(config: ChainConfig, blockHeight: number): bigint {
  //
  // For mainnet/testnet/signet, we need to account for the fact that
  // the fork starts at block ~964,000, which is already past several
  // halvings. The initial subsidy in the config represents the subsidy
  // at the fork point, not at block 0.
  //
  // For regtest, the config's initialSubsidySatoshis IS the block-0 subsidy,
  // and halvingInterval is typically 150.
  //

  if (config.network.id === "regtest") {
    // Regtest: straightforward halving from block 0
    const halvings = Math.floor(blockHeight / config.consensus.halvingInterval);

    // After 64 halvings the subsidy is 0 (shifted to nothing)
    if (halvings >= 64) {
      return BigInt(0);
    }

    return config.consensus.initialSubsidySatoshis >> BigInt(halvings);
  }

  // Non-regtest: calculate halvings relative to Bitcoin's genesis
  // (since the eCash fork inherits Bitcoin's full UTXO set and block height)
  const halvings = Math.floor(blockHeight / config.consensus.halvingInterval);

  if (halvings >= 64) {
    return BigInt(0);
  }

  // Bitcoin's original subsidy: 50 BTC = 5,000,000,000 satoshis
  const genesisSubsidy = BigInt("5000000000");

  return genesisSubsidy >> BigInt(halvings);
}

// ---------------------------------------------------------------------------
// BIP-300 Withdrawal Voting
// ---------------------------------------------------------------------------

/**
 * BIP-300 withdrawal bundle voting parameters.
 *
 * The voting window is 26,300 blocks (~6 months).
 * A bundle needs 13,150 ACKs to succeed.
 * A bundle fails if it receives > 13,150 NACKs (i.e., more than half
 * of the window passes without sufficient ACKs).
 */
export const BIP300_VOTING_WINDOW_BLOCKS = 26_300;
export const BIP300_ACK_THRESHOLD = 13_150;

/**
 * Calculate whether a withdrawal bundle is on track to succeed,
 * given the current ACK/NACK counts and elapsed voting blocks.
 *
 * @param ackCount - Current number of miner ACKs
 * @param _nackCount - Current number of miner NACKs (abstentions count as NACKs)
 * @param votingBlocksElapsed - How many blocks of the voting window have passed
 * @returns Analysis of the bundle's voting status
 */
export function analyzeWithdrawalVoting(
  ackCount: number,
  _nackCount: number,
  votingBlocksElapsed: number
): {
  isSucceeded: boolean;
  isFailed: boolean;
  isPending: boolean;
  acksNeeded: number;
  blocksRemaining: number;
  successProbability: number;  // 0.0 to 1.0, naive linear estimate
} {
  const blocksRemaining = Math.max(0, BIP300_VOTING_WINDOW_BLOCKS - votingBlocksElapsed);
  const acksNeeded = Math.max(0, BIP300_ACK_THRESHOLD - ackCount);

  const isSucceeded = ackCount >= BIP300_ACK_THRESHOLD;
  const isFailed = blocksRemaining < acksNeeded; // Can't possibly reach threshold
  const isPending = !isSucceeded && !isFailed;

  // Naive probability: if the current ACK rate continues, will it reach threshold?
  let successProbability = 0.0;

  if (isSucceeded) {
    successProbability = 1.0;
  } else if (isFailed) {
    successProbability = 0.0;
  } else if (votingBlocksElapsed > 0) {
    const ackRate = ackCount / votingBlocksElapsed;
    const projectedTotalAcks = ackCount + ackRate * blocksRemaining;
    successProbability = Math.min(1.0, projectedTotalAcks / BIP300_ACK_THRESHOLD);
  } else {
    // No blocks elapsed yet, can't estimate
    successProbability = 0.5;
  }

  return {
    isSucceeded,
    isFailed,
    isPending,
    acksNeeded,
    blocksRemaining,
    successProbability,
  };
}

// ---------------------------------------------------------------------------
// Address Format Detection
// ---------------------------------------------------------------------------

/**
 * Detect the address format from a raw address string.
 *
 * This is a lightweight heuristic for UI display purposes.
 * Full validation should be done by the crypto layer (Rust backend
 * or react-native-quick-crypto).
 *
 * @param address - The address string to analyze
 * @param config - The chain configuration (for bech32 HRP matching)
 * @returns The detected address format
 */
export function detectAddressFormat(
  address: string,
  config: ChainConfig
): AddressFormat {
  if (!address || address.length === 0) {
    return "unknown";
  }

  const hrp = config.bech32.hrp;

  // Taproot: bech32m, starts with HRP + "1p"
  if (address.toLowerCase().startsWith(`${hrp}1p`)) {
    return "p2tr";
  }

  // Native SegWit: bech32, starts with HRP + "1q"
  if (address.toLowerCase().startsWith(`${hrp}1q`)) {
    // P2WPKH is 42 chars, P2WSH is 62 chars (for "bc" HRP)
    // This is a rough heuristic; real validation belongs in the crypto layer
    if (address.length > 50) {
      return "p2wsh";
    }
    return "p2wpkh";
  }

  // Regtest bech32 uses "bcrt" HRP
  if (address.toLowerCase().startsWith("bcrt1p")) {
    return "p2tr";
  }
  if (address.toLowerCase().startsWith("bcrt1q")) {
    if (address.length > 55) {
      return "p2wsh";
    }
    return "p2wpkh";
  }

  // Legacy P2PKH: starts with '1' (mainnet) or 'm'/'n' (testnet/regtest)
  if (address.startsWith("1") || address.startsWith("m") || address.startsWith("n")) {
    return "p2pkh";
  }

  // P2SH: starts with '3' (mainnet) or '2' (testnet/regtest)
  if (address.startsWith("3") || address.startsWith("2")) {
    return "p2sh";
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Sidechain Deposit Helpers
// ---------------------------------------------------------------------------

/**
 * Minimum deposit amount for BIP-300 sidechain deposits, in satoshis.
 *
 * Dust-level deposits would be uneconomical to withdraw and could
 * bloat the sidechain's UTXO set. This value should be configurable
 * per-sidechain in a future iteration.
 *
 * CONFIRM PRE-FORK: Check if the eCash node enforces a protocol-level minimum.
 */
export const MINIMUM_SIDECHAIN_DEPOSIT_SATOSHIS = BigInt("10000"); // 0.0001 BTC

/**
 * Validate that a deposit amount meets the minimum threshold.
 *
 * @param amountSatoshis - The proposed deposit amount
 * @returns Object with validation result and reason
 */
export function validateSidechainDeposit(
  amountSatoshis: bigint
): { valid: boolean; reason: string } {
  if (amountSatoshis <= BigInt(0)) {
    return { valid: false, reason: "Deposit amount must be positive" };
  }

  if (amountSatoshis < MINIMUM_SIDECHAIN_DEPOSIT_SATOSHIS) {
    const minCoin = satoshisToCoin(MINIMUM_SIDECHAIN_DEPOSIT_SATOSHIS);
    return {
      valid: false,
      reason: `Deposit amount is below the minimum of ${minCoin} coins (${MINIMUM_SIDECHAIN_DEPOSIT_SATOSHIS.toString()} satoshis)`,
    };
  }

  return { valid: true, reason: "" };
}
