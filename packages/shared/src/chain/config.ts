// packages/shared/src/chain/config.ts
//
// Central chain configuration constants for the eCash hard fork.
//
// These values define the consensus rules, address formats, and
// network parameters for the Sidecoin wallet. They are derived from:
//
//   - https://ecash.com (fork announcement and countdown)
//   - BIP-300 / BIP-301 specifications
//   - Bitcoin Core defaults (inherited at the fork point)
//
// Any value marked with "CONFIRM PRE-FORK" requires verification against
// the final eCash node software release before mainnet launch.

import type { ChainConfig } from "../types/network";

// ---------------------------------------------------------------------------
// eCash Mainnet
// ---------------------------------------------------------------------------

export const ECASH_MAINNET: ChainConfig = {
  network: {
    id: "mainnet",
    displayName: "eCash Mainnet",
    shortName: "main",
    isProduction: true,
  },

  //
  // Address version bytes — inherited from Bitcoin at the fork point.
  //
  // CONFIRM PRE-FORK: The eCash project may introduce distinct version
  // bytes to prevent accidental cross-chain sends. Monitor the eCash
  // node release for any changes to these values.
  //
  addressVersions: {
    p2pkh: 0x00,   // '1...' addresses
    p2sh: 0x05,    // '3...' addresses
    xpub: 0x0488b21e,  // xpub...
    xprv: 0x0488ade4,  // xprv...
  },

  //
  // Bech32 human-readable part.
  //
  // CONFIRM PRE-FORK: If eCash uses a distinct HRP (e.g. "ec" instead
  // of "bc"), update this value. Using "bc" at launch would make eCash
  // addresses indistinguishable from Bitcoin addresses, which is risky.
  //
  bech32: {
    hrp: "bc",
  },

  //
  // P2P network parameters.
  //
  // CONFIRM PRE-FORK: Network magic bytes, default ports, and DNS seeds
  // will be published in the eCash node software. The placeholder magic
  // below is intentionally distinct from Bitcoin's 0xf9beb4d9.
  //
  networkParams: {
    magic: "e3e1f3e8",    // Placeholder — MUST be updated from eCash node source
    defaultPort: 8333,     // May change to avoid conflict with Bitcoin Core
    rpcPort: 8332,         // May change to avoid conflict with Bitcoin Core
    dnsSeeds: [
      // Placeholder seeds — replace with eCash DNS seeds before launch
      // "seed.ecash.com",
      // "dnsseed.ecash.com",
    ],
  },

  consensus: {
    powAlgorithm: "sha256d",
    targetBlockTimeSeconds: 600,                // 10 minutes
    difficultyAdjustmentInterval: 2016,         // ~2 weeks
    initialSubsidySatoshis: BigInt("312500000"), // 3.125 BTC (post-4th-halving)
    halvingInterval: 210_000,
    maxBlockWeight: 4_000_000,                  // SegWit weight units
    coinbaseMaturity: 100,
  },

  fork: {
    activationBlockHeight: 964_000,
    activationTimestampUtc: "2026-08-21T15:00:00Z",
    bip300Active: true,
    bip301Active: true,
    sidechainsAtLaunch: 7,
  },
};

// ---------------------------------------------------------------------------
// eCash Testnet
// ---------------------------------------------------------------------------

export const ECASH_TESTNET: ChainConfig = {
  network: {
    id: "testnet",
    displayName: "eCash Testnet",
    shortName: "test",
    isProduction: false,
  },

  addressVersions: {
    p2pkh: 0x6f,   // 'm' or 'n' addresses
    p2sh: 0xc4,    // '2...' addresses
    xpub: 0x043587cf,
    xprv: 0x04358394,
  },

  bech32: {
    hrp: "tb",  // CONFIRM PRE-FORK: may use a distinct testnet HRP
  },

  networkParams: {
    magic: "0b110907",  // Bitcoin testnet magic as placeholder
    defaultPort: 18333,
    rpcPort: 18332,
    dnsSeeds: [],
  },

  consensus: {
    powAlgorithm: "sha256d",
    targetBlockTimeSeconds: 600,
    difficultyAdjustmentInterval: 2016,
    initialSubsidySatoshis: BigInt("312500000"),
    halvingInterval: 210_000,
    maxBlockWeight: 4_000_000,
    coinbaseMaturity: 100,
  },

  fork: {
    activationBlockHeight: 964_000,
    activationTimestampUtc: "2026-08-21T15:00:00Z",
    bip300Active: true,
    bip301Active: true,
    sidechainsAtLaunch: 7,
  },
};

// ---------------------------------------------------------------------------
// eCash Signet
//
// The ecash.com site references "signet live" — this is the pre-fork
// signet environment for integration testing.
// ---------------------------------------------------------------------------

export const ECASH_SIGNET: ChainConfig = {
  network: {
    id: "signet",
    displayName: "eCash Signet",
    shortName: "sig",
    isProduction: false,
  },

  addressVersions: {
    p2pkh: 0x6f,
    p2sh: 0xc4,
    xpub: 0x043587cf,
    xprv: 0x04358394,
  },

  bech32: {
    hrp: "tb",  // Signet typically shares testnet's HRP
  },

  networkParams: {
    magic: "0a03cf40",  // Bitcoin signet magic as placeholder
    defaultPort: 38333,
    rpcPort: 38332,
    dnsSeeds: [],
  },

  consensus: {
    powAlgorithm: "sha256d",
    targetBlockTimeSeconds: 600,
    difficultyAdjustmentInterval: 2016,
    initialSubsidySatoshis: BigInt("312500000"),
    halvingInterval: 210_000,
    maxBlockWeight: 4_000_000,
    coinbaseMaturity: 100,
  },

  fork: {
    activationBlockHeight: 964_000,
    activationTimestampUtc: "2026-08-21T15:00:00Z",
    bip300Active: true,
    bip301Active: true,
    sidechainsAtLaunch: 7,
  },
};

// ---------------------------------------------------------------------------
// eCash Regtest
//
// Local regression testing. Instant blocks, no peer discovery,
// trivial difficulty. Ideal for development and CI.
// ---------------------------------------------------------------------------

export const ECASH_REGTEST: ChainConfig = {
  network: {
    id: "regtest",
    displayName: "eCash Regtest",
    shortName: "reg",
    isProduction: false,
  },

  addressVersions: {
    p2pkh: 0x6f,
    p2sh: 0xc4,
    xpub: 0x043587cf,
    xprv: 0x04358394,
  },

  bech32: {
    hrp: "bcrt",  // Standard regtest HRP
  },

  networkParams: {
    magic: "fabfb5da",  // Bitcoin regtest magic as placeholder
    defaultPort: 18444,
    rpcPort: 18443,
    dnsSeeds: [],  // No DNS seeds for regtest — peers are manually configured
  },

  consensus: {
    powAlgorithm: "sha256d",
    targetBlockTimeSeconds: 600,
    difficultyAdjustmentInterval: 2016,
    initialSubsidySatoshis: BigInt("5000000000"),  // 50 BTC — regtest starts at block 0
    halvingInterval: 150,  // Regtest uses 150-block halving for rapid testing
    maxBlockWeight: 4_000_000,
    coinbaseMaturity: 100,
  },

  fork: {
    activationBlockHeight: 0,  // BIP-300/301 active from genesis on regtest
    activationTimestampUtc: "2024-01-01T00:00:00Z",
    bip300Active: true,
    bip301Active: true,
    sidechainsAtLaunch: 7,
  },
};

// ---------------------------------------------------------------------------
// eCash L2L Signet
//
// Layer-2-Labs signet environment — the network our wallet clients target
// today for drivechain (BIP-300) integration against the live indexer.
//
// The L1 withdrawal leg uses signet bech32, so we reuse the "tb" HRP.
// (Verified: a real withdrawal destination
// tb1qv4dnq23g8n0elcrn3yjjnp8e96yhu3r54tz7lf decodes as witness_v0_keyhash,
// confirming tb1 is the correct prefix.)
//
// This is NOT a production network (isProduction: false) and is NOT the
// default — DEFAULT_NETWORK_ID remains "signet" (see chain/networks.ts).
// ---------------------------------------------------------------------------

export const ECASH_L2L_SIGNET: ChainConfig = {
  network: {
    id: "l2l-signet",
    displayName: "eCash L2L Signet",
    shortName: "l2l",
    isProduction: false,
  },

  addressVersions: {
    p2pkh: 0x6f,
    p2sh: 0xc4,
    xpub: 0x043587cf,
    xprv: 0x04358394,
  },

  bech32: {
    hrp: "tb",  // L1 withdrawal leg uses signet bech32 (tb1...)
  },

  networkParams: {
    magic: "0a03cf40",  // Shares signet magic placeholder
    defaultPort: 38333,
    rpcPort: 38332,
    dnsSeeds: [],
  },

  consensus: {
    powAlgorithm: "sha256d",
    targetBlockTimeSeconds: 600,
    difficultyAdjustmentInterval: 2016,
    initialSubsidySatoshis: BigInt("312500000"),
    halvingInterval: 210_000,
    maxBlockWeight: 4_000_000,
    coinbaseMaturity: 100,
  },

  fork: {
    activationBlockHeight: 964_000,
    activationTimestampUtc: "2026-08-21T15:00:00Z",
    bip300Active: true,
    bip301Active: true,
    sidechainsAtLaunch: 7,
  },
};

// ---------------------------------------------------------------------------
// eCash Alphanet
//
// The ECX alpha "practice" network — a fork of mainnet with a PoW difficulty
// reset, used to rehearse the upcoming mainnet launch. Authoritative config:
// https://drivechain.dev/config (id "alphanet", family "ecash").
//
// Because alphanet forks the mainnet UTXO set, it inherits mainnet's address
// format verbatim: coin type 0, bech32 HRP "bc", P2PKH/P2SH version bytes
// 0x00/0x05. The same mnemonic produces the same addresses on both chains.
//
// Network parameters (magic, fork height, P2P port) come directly from the
// drivechain.dev config. This is NOT a production network (isProduction:false).
// ---------------------------------------------------------------------------

export const ECASH_ALPHANET: ChainConfig = {
  network: {
    id: "alphanet",
    displayName: "eCash Alphanet",
    shortName: "alpha",
    isProduction: false,
  },

  //
  // Address version bytes — inherited from mainnet (alphanet is a mainnet
  // fork with a shared UTXO set, so the address formats must match exactly).
  //
  addressVersions: {
    p2pkh: 0x00,   // '1...' addresses (same as mainnet)
    p2sh: 0x05,    // '3...' addresses (same as mainnet)
    xpub: 0x0488b21e,  // xpub... (same as mainnet)
    xprv: 0x0488ade4,  // xprv... (same as mainnet)
  },

  //
  // Bech32 human-readable part — "bc", same as mainnet. Alphanet addresses
  // are byte-identical to mainnet addresses; only the chain differs.
  //
  bech32: {
    hrp: "bc",
  },

  //
  // P2P network parameters — from the official drivechain.dev config.
  // network_magic "eca5a104", fork_height 963648, p2p seed port 8533.
  // rpcPort is not published in the drivechain.dev config; 8332 is the
  // mainnet default inherited by this mainnet fork.
  //
  networkParams: {
    magic: "eca5a104",    // From https://drivechain.dev/config (alphanet)
    defaultPort: 8533,     // From seed.alpha.ecash.ninja:8533
    rpcPort: 8332,         // Inherited from mainnet (not published in config)
    dnsSeeds: [
      "seed.alpha.ecash.ninja",
    ],
  },

  consensus: {
    powAlgorithm: "sha256d",
    targetBlockTimeSeconds: 600,                // 10 minutes
    difficultyAdjustmentInterval: 2016,         // ~2 weeks
    initialSubsidySatoshis: BigInt("312500000"), // 3.125 BTC (post-4th-halving)
    halvingInterval: 210_000,
    maxBlockWeight: 4_000_000,                  // SegWit weight units
    coinbaseMaturity: 100,
  },

  fork: {
    // From drivechain.dev config: alphanet forks mainnet at height 963648
    // with a PoW difficulty reset (the "practice" fork point).
    activationBlockHeight: 963_648,
    activationTimestampUtc: "2026-08-21T15:00:00Z",
    bip300Active: true,
    bip301Active: true,
    sidechainsAtLaunch: 0,   // No sidechains listed in the alphanet config yet
  },
};
