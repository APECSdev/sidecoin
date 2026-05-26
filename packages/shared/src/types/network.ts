// packages/shared/src/types/network.ts
//
// Core type definitions for network configuration and chain parameters.
// These types are consumed by every platform client and the Rust backend
// (via the specta type-gen pipeline for desktop).

/**
 * Identifies which network environment the wallet is targeting.
 *
 * - mainnet: The live eCash hard-fork chain (post block ~964,000)
 * - testnet: Public test network for pre-fork integration testing
 * - signet: The signet instance referenced on ecash.com ("signet live")
 * - regtest: Local regression testing (single-node, instant blocks)
 */
export type NetworkId = "mainnet" | "testnet" | "signet" | "regtest";

/**
 * Human-readable network metadata used for display in the UI
 * and for user-facing network selection.
 */
export interface NetworkMeta {
  /** Machine-readable identifier */
  readonly id: NetworkId;

  /** Human-readable display name, e.g. "eCash Mainnet" */
  readonly displayName: string;

  /** Short label for compact UI contexts, e.g. "main" */
  readonly shortName: string;

  /** Whether this is a production network carrying real value */
  readonly isProduction: boolean;
}

/**
 * Version bytes used for Base58Check address encoding.
 *
 * eCash is a Bitcoin hard fork; at launch it inherits Bitcoin's
 * address version bytes. These may diverge post-fork if the eCash
 * project introduces distinct prefixes to prevent cross-chain sends.
 *
 * Track: https://ecash.com/faq for any announced address format changes.
 */
export interface AddressVersions {
  /** P2PKH address prefix byte (0x00 for Bitcoin mainnet = '1...' addresses) */
  readonly p2pkh: number;

  /** P2SH address prefix byte (0x05 for Bitcoin mainnet = '3...' addresses) */
  readonly p2sh: number;

  /** BIP-32 extended public key version bytes (xpub) */
  readonly xpub: number;

  /** BIP-32 extended private key version bytes (xprv) */
  readonly xprv: number;
}

/**
 * Bech32/Bech32m human-readable part configuration.
 *
 * Used for native SegWit addresses (P2WPKH, P2WSH, P2TR).
 * Bitcoin mainnet uses "bc", testnet uses "tb".
 * eCash may adopt a distinct HRP post-fork.
 */
export interface Bech32Config {
  /** Human-readable part for bech32 addresses */
  readonly hrp: string;
}

/**
 * Network-layer constants: magic bytes for the P2P protocol,
 * default ports, and DNS seeds for peer discovery.
 */
export interface NetworkParams {
  /**
   * 4-byte network magic used in the P2P message header.
   * Stored as a hex string for readability (e.g. "f9beb4d9" for Bitcoin mainnet).
   *
   * eCash MUST use distinct magic bytes to avoid cross-pollinating
   * peer connections with the Bitcoin network. These will be confirmed
   * closer to fork activation.
   */
  readonly magic: string;

  /** Default P2P port for full nodes */
  readonly defaultPort: number;

  /** Default RPC port for JSON-RPC interface */
  readonly rpcPort: number;

  /**
   * DNS seed hostnames for initial peer discovery.
   * Empty array is valid for regtest/signet where peers are manually configured.
   */
  readonly dnsSeeds: readonly string[];
}

/**
 * Consensus-critical parameters for the chain.
 */
export interface ConsensusParams {
  /**
   * Proof-of-Work algorithm identifier.
   * eCash uses SHA-256d (double SHA-256), same as Bitcoin.
   */
  readonly powAlgorithm: "sha256d";

  /**
   * Target block interval in seconds.
   * Bitcoin/eCash: 600 seconds (10 minutes).
   */
  readonly targetBlockTimeSeconds: number;

  /**
   * Difficulty adjustment interval in blocks.
   * Bitcoin: every 2016 blocks (~2 weeks).
   */
  readonly difficultyAdjustmentInterval: number;

  /**
   * Initial subsidy per block in satoshis.
   * At block ~964,000 Bitcoin's subsidy is 3.125 BTC (post 4th halving).
   * eCash inherits this subsidy schedule from the fork point.
   */
  readonly initialSubsidySatoshis: bigint;

  /**
   * Halving interval in blocks (210,000 for Bitcoin).
   */
  readonly halvingInterval: number;

  /**
   * Maximum block weight in weight units (4,000,000 for Bitcoin post-SegWit).
   */
  readonly maxBlockWeight: number;

  /**
   * Coin maturity — number of confirmations before a coinbase
   * transaction's outputs become spendable (100 for Bitcoin).
   */
  readonly coinbaseMaturity: number;
}

/**
 * Fork-specific parameters describing the eCash hard fork event itself.
 */
export interface ForkParams {
  /**
   * Approximate block height at which the hard fork activates.
   * From ecash.com: target block ~964,000.
   */
  readonly activationBlockHeight: number;

  /**
   * UTC timestamp for the planned fork activation.
   * From ecash.com: 2026-08-21T15:00:00Z
   */
  readonly activationTimestampUtc: string;

  /**
   * Whether BIP-300 (Hashrate Escrows / Drivechains) is active at fork.
   */
  readonly bip300Active: boolean;

  /**
   * Whether BIP-301 (Blind Merged Mining) is active at fork.
   */
  readonly bip301Active: boolean;

  /**
   * The number of sidechains expected to be available at launch.
   * From ecash.com: 8 sidechains at launch.
   */
  readonly sidechainsAtLaunch: number;
}

/**
 * Complete chain configuration combining all parameter groups.
 * One instance per supported network (mainnet, testnet, signet, regtest).
 */
export interface ChainConfig {
  readonly network: NetworkMeta;
  readonly addressVersions: AddressVersions;
  readonly bech32: Bech32Config;
  readonly networkParams: NetworkParams;
  readonly consensus: ConsensusParams;
  readonly fork: ForkParams;
}
