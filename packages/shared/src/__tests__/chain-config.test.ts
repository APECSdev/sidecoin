// packages/shared/src/__tests__/chain-config.test.ts
//
// Unit tests for chain configuration, network lookups,
// and utility functions.

import { describe, it, expect } from "vitest";

import {
  ECASH_MAINNET,
  ECASH_TESTNET,
  ECASH_SIGNET,
  ECASH_REGTEST,
} from "../chain/config";

import {
  NETWORKS,
  NETWORK_IDS,
  DEFAULT_NETWORK_ID,
  DEFAULT_NETWORK,
  getNetwork,
  getNetworkOrThrow,
  isValidNetworkId,
  getProductionNetworks,
  getTestNetworks,
} from "../chain/networks";

import {
  SATOSHIS_PER_COIN,
  satoshisToCoin,
  coinToSatoshis,
  getForkCountdown,
  getBlockSubsidy,
  BIP300_VOTING_WINDOW_BLOCKS,
  BIP300_ACK_THRESHOLD,
  analyzeWithdrawalVoting,
  detectAddressFormat,
  MINIMUM_SIDECHAIN_DEPOSIT_SATOSHIS,
  validateSidechainDeposit,
} from "../chain/utils";

// ---------------------------------------------------------------------------
// Chain Config Smoke Tests
// ---------------------------------------------------------------------------

describe("Chain Config", () => {
  it("mainnet has correct fork activation block", () => {
    expect(ECASH_MAINNET.fork.activationBlockHeight).toBe(964_000);
  });

  it("mainnet has correct fork activation timestamp", () => {
    expect(ECASH_MAINNET.fork.activationTimestampUtc).toBe("2026-08-21T15:00:00Z");
  });

  it("mainnet has BIP-300 and BIP-301 active", () => {
    expect(ECASH_MAINNET.fork.bip300Active).toBe(true);
    expect(ECASH_MAINNET.fork.bip301Active).toBe(true);
  });

  it("mainnet has 8 sidechains at launch", () => {
    expect(ECASH_MAINNET.fork.sidechainsAtLaunch).toBe(8);
  });

  it("mainnet uses SHA-256d PoW", () => {
    expect(ECASH_MAINNET.consensus.powAlgorithm).toBe("sha256d");
  });

  it("mainnet has 10 minute block time", () => {
    expect(ECASH_MAINNET.consensus.targetBlockTimeSeconds).toBe(600);
  });

  it("mainnet initial subsidy is 3.125 BTC (post-4th-halving)", () => {
    expect(ECASH_MAINNET.consensus.initialSubsidySatoshis).toBe(BigInt("312500000"));
  });

  it("mainnet is marked as production", () => {
    expect(ECASH_MAINNET.network.isProduction).toBe(true);
  });

  it("testnet is NOT marked as production", () => {
    expect(ECASH_TESTNET.network.isProduction).toBe(false);
  });

  it("signet is NOT marked as production", () => {
    expect(ECASH_SIGNET.network.isProduction).toBe(false);
  });

  it("regtest is NOT marked as production", () => {
    expect(ECASH_REGTEST.network.isProduction).toBe(false);
  });

  it("regtest has BIP-300/301 active from block 0", () => {
    expect(ECASH_REGTEST.fork.activationBlockHeight).toBe(0);
  });

  it("regtest has 150-block halving interval", () => {
    expect(ECASH_REGTEST.consensus.halvingInterval).toBe(150);
  });

  it("regtest initial subsidy is 50 BTC", () => {
    expect(ECASH_REGTEST.consensus.initialSubsidySatoshis).toBe(BigInt("5000000000"));
  });
});

// ---------------------------------------------------------------------------
// Network Registry
// ---------------------------------------------------------------------------

describe("Network Registry", () => {
  it("NETWORKS contains all 4 network IDs", () => {
    expect(Object.keys(NETWORKS)).toHaveLength(4);
    expect(NETWORKS.mainnet).toBeDefined();
    expect(NETWORKS.testnet).toBeDefined();
    expect(NETWORKS.signet).toBeDefined();
    expect(NETWORKS.regtest).toBeDefined();
  });

  it("NETWORK_IDS lists all 4 IDs in order", () => {
    expect(NETWORK_IDS).toEqual(["mainnet", "testnet", "signet", "regtest"]);
  });

  it("DEFAULT_NETWORK_ID is signet during pre-fork development", () => {
    expect(DEFAULT_NETWORK_ID).toBe("signet");
  });

  it("DEFAULT_NETWORK matches the signet config", () => {
    expect(DEFAULT_NETWORK).toBe(ECASH_SIGNET);
  });

  it("getNetwork returns config for valid ID", () => {
    expect(getNetwork("mainnet")).toBe(ECASH_MAINNET);
    expect(getNetwork("regtest")).toBe(ECASH_REGTEST);
  });

  it("getNetwork returns undefined for invalid ID", () => {
    expect(getNetwork("invalid")).toBeUndefined();
    expect(getNetwork("")).toBeUndefined();
  });

  it("getNetworkOrThrow returns config for valid ID", () => {
    expect(getNetworkOrThrow("mainnet")).toBe(ECASH_MAINNET);
  });

  it("getNetworkOrThrow throws for invalid ID", () => {
    expect(() => getNetworkOrThrow("invalid")).toThrow('Unknown network ID "invalid"');
  });

  it("isValidNetworkId correctly validates", () => {
    expect(isValidNetworkId("mainnet")).toBe(true);
    expect(isValidNetworkId("signet")).toBe(true);
    expect(isValidNetworkId("invalid")).toBe(false);
    expect(isValidNetworkId("")).toBe(false);
  });

  it("getProductionNetworks returns only mainnet", () => {
    const prod = getProductionNetworks();
    expect(prod).toHaveLength(1);
    expect(prod[0].network.id).toBe("mainnet");
  });

  it("getTestNetworks returns testnet, signet, regtest", () => {
    const test = getTestNetworks();
    expect(test).toHaveLength(3);
    const ids = test.map((n) => n.network.id);
    expect(ids).toContain("testnet");
    expect(ids).toContain("signet");
    expect(ids).toContain("regtest");
  });
});

// ---------------------------------------------------------------------------
// Satoshi / Coin Conversion
// ---------------------------------------------------------------------------

describe("Satoshi Conversion", () => {
  it("SATOSHIS_PER_COIN is 100,000,000", () => {
    expect(SATOSHIS_PER_COIN).toBe(BigInt("100000000"));
  });

  it("satoshisToCoin formats whole coins", () => {
    expect(satoshisToCoin(BigInt("100000000"))).toBe("1.00000000");
    expect(satoshisToCoin(BigInt("500000000"))).toBe("5.00000000");
  });

  it("satoshisToCoin formats fractional amounts", () => {
    expect(satoshisToCoin(BigInt("312500000"))).toBe("3.12500000");
    expect(satoshisToCoin(BigInt("1"))).toBe("0.00000001");
    expect(satoshisToCoin(BigInt("0"))).toBe("0.00000000");
  });

  it("satoshisToCoin handles negative amounts", () => {
    expect(satoshisToCoin(BigInt("-100000000"))).toBe("-1.00000000");
    expect(satoshisToCoin(BigInt("-1"))).toBe("-0.00000001");
  });

  it("satoshisToCoin respects decimals parameter", () => {
    expect(satoshisToCoin(BigInt("123456789"), 2)).toBe("1.23");
    expect(satoshisToCoin(BigInt("123456789"), 0)).toBe("1");
    expect(satoshisToCoin(BigInt("123456789"), 4)).toBe("1.2345");
  });

  it("coinToSatoshis parses whole coins", () => {
    expect(coinToSatoshis("1")).toBe(BigInt("100000000"));
    expect(coinToSatoshis("5")).toBe(BigInt("500000000"));
  });

  it("coinToSatoshis parses fractional amounts", () => {
    expect(coinToSatoshis("0.5")).toBe(BigInt("50000000"));
    expect(coinToSatoshis("3.125")).toBe(BigInt("312500000"));
    expect(coinToSatoshis("0.00000001")).toBe(BigInt("1"));
  });

  it("coinToSatoshis parses negative amounts", () => {
    expect(coinToSatoshis("-1")).toBe(BigInt("-100000000"));
  });

  it("coinToSatoshis throws for invalid input", () => {
    expect(() => coinToSatoshis("abc")).toThrow("Invalid coin amount");
    expect(() => coinToSatoshis("")).toThrow("Invalid coin amount");
    expect(() => coinToSatoshis("1.2.3")).toThrow("Invalid coin amount");
  });

  it("round-trip: satoshis -> coin -> satoshis", () => {
    const original = BigInt("312500000");
    const coinStr = satoshisToCoin(original);
    const backToSat = coinToSatoshis(coinStr);
    expect(backToSat).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// Fork Countdown
// ---------------------------------------------------------------------------

describe("Fork Countdown", () => {
  it("returns positive values before the fork", () => {
    // 2026-08-20T15:00:00Z = exactly 1 day before activation
    const oneDayBefore = new Date("2026-08-20T15:00:00Z").getTime();
    const countdown = getForkCountdown(ECASH_MAINNET, oneDayBefore);

    expect(countdown.isPast).toBe(false);
    expect(countdown.days).toBe(1);
    expect(countdown.hours).toBe(0);
    expect(countdown.minutes).toBe(0);
    expect(countdown.seconds).toBe(0);
    expect(countdown.totalMilliseconds).toBeGreaterThan(0);
  });

  it("returns isPast=true after the fork", () => {
    const afterFork = new Date("2026-09-01T00:00:00Z").getTime();
    const countdown = getForkCountdown(ECASH_MAINNET, afterFork);

    expect(countdown.isPast).toBe(true);
    expect(countdown.totalMilliseconds).toBeLessThan(0);
  });

  it("returns zeros at exact activation time", () => {
    const exact = new Date("2026-08-21T15:00:00Z").getTime();
    const countdown = getForkCountdown(ECASH_MAINNET, exact);

    expect(countdown.isPast).toBe(true); // totalMilliseconds === 0, which is <= 0
    expect(countdown.days).toBe(0);
    expect(countdown.hours).toBe(0);
    expect(countdown.minutes).toBe(0);
    expect(countdown.seconds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Block Subsidy
// ---------------------------------------------------------------------------

describe("Block Subsidy", () => {
  it("regtest block 0 has 50 BTC subsidy", () => {
    expect(getBlockSubsidy(ECASH_REGTEST, 0)).toBe(BigInt("5000000000"));
  });

  it("regtest block 150 has 25 BTC subsidy (first halving)", () => {
    expect(getBlockSubsidy(ECASH_REGTEST, 150)).toBe(BigInt("2500000000"));
  });

  it("regtest block 300 has 12.5 BTC subsidy (second halving)", () => {
    expect(getBlockSubsidy(ECASH_REGTEST, 300)).toBe(BigInt("1250000000"));
  });

  it("mainnet block 0 has 50 BTC subsidy", () => {
    expect(getBlockSubsidy(ECASH_MAINNET, 0)).toBe(BigInt("5000000000"));
  });

  it("mainnet block 210,000 has 25 BTC subsidy (1st halving)", () => {
    expect(getBlockSubsidy(ECASH_MAINNET, 210_000)).toBe(BigInt("2500000000"));
  });

  it("mainnet block 840,000 has 3.125 BTC subsidy (4th halving)", () => {
    expect(getBlockSubsidy(ECASH_MAINNET, 840_000)).toBe(BigInt("312500000"));
  });

  it("mainnet block 964,000 (fork point) has 3.125 BTC subsidy", () => {
    // Fork point is between 4th halving (840k) and 5th halving (1,050k)
    expect(getBlockSubsidy(ECASH_MAINNET, 964_000)).toBe(BigInt("312500000"));
  });

  it("mainnet block 1,050,000 has 1.5625 BTC subsidy (5th halving)", () => {
    expect(getBlockSubsidy(ECASH_MAINNET, 1_050_000)).toBe(BigInt("156250000"));
  });

  it("subsidy reaches 0 after 64 halvings", () => {
    expect(getBlockSubsidy(ECASH_MAINNET, 210_000 * 64)).toBe(BigInt(0));
  });
});

// ---------------------------------------------------------------------------
// BIP-300 Withdrawal Voting Analysis
// ---------------------------------------------------------------------------

describe("Withdrawal Voting Analysis", () => {
  it("BIP300 constants are correct", () => {
    expect(BIP300_VOTING_WINDOW_BLOCKS).toBe(26_300);
    expect(BIP300_ACK_THRESHOLD).toBe(13_150);
  });

  it("bundle with enough ACKs is succeeded", () => {
    const result = analyzeWithdrawalVoting(13_150, 0, 13_150);

    expect(result.isSucceeded).toBe(true);
    expect(result.isFailed).toBe(false);
    expect(result.isPending).toBe(false);
    expect(result.acksNeeded).toBe(0);
    expect(result.successProbability).toBe(1.0);
  });

  it("bundle that can't reach threshold is failed", () => {
    // 0 ACKs with only 100 blocks remaining
    const result = analyzeWithdrawalVoting(0, 26_200, 26_200);

    expect(result.isSucceeded).toBe(false);
    expect(result.isFailed).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.blocksRemaining).toBe(100);
    expect(result.acksNeeded).toBe(13_150);
    expect(result.successProbability).toBe(0.0);
  });

  it("bundle mid-voting is pending", () => {
    const result = analyzeWithdrawalVoting(5_000, 3_000, 10_000);

    expect(result.isSucceeded).toBe(false);
    expect(result.isFailed).toBe(false);
    expect(result.isPending).toBe(true);
    expect(result.blocksRemaining).toBe(16_300);
    expect(result.acksNeeded).toBe(8_150);
    expect(result.successProbability).toBeGreaterThan(0);
    expect(result.successProbability).toBeLessThanOrEqual(1.0);
  });

  it("no blocks elapsed gives 0.5 probability", () => {
    const result = analyzeWithdrawalVoting(0, 0, 0);

    expect(result.isPending).toBe(true);
    expect(result.successProbability).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Address Format Detection
// ---------------------------------------------------------------------------

describe("Address Format Detection", () => {
  it("detects P2PKH mainnet addresses", () => {
    expect(detectAddressFormat("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", ECASH_MAINNET)).toBe("p2pkh");
  });

  it("detects P2SH mainnet addresses", () => {
    expect(detectAddressFormat("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", ECASH_MAINNET)).toBe("p2sh");
  });

  it("detects P2WPKH mainnet addresses", () => {
    expect(detectAddressFormat("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", ECASH_MAINNET)).toBe("p2wpkh");
  });

  it("detects P2TR mainnet addresses", () => {
    expect(detectAddressFormat("bc1p5cyxnuxmeuwuvkwfem96lqzszee2457ngs7gaz8tlrqvlp5e0wfshg3vfq", ECASH_MAINNET)).toBe("p2tr");
  });

  it("detects P2PKH testnet addresses", () => {
    expect(detectAddressFormat("mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn", ECASH_TESTNET)).toBe("p2pkh");
  });

  it("detects P2SH testnet addresses", () => {
    expect(detectAddressFormat("2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc", ECASH_TESTNET)).toBe("p2sh");
  });

  it("detects regtest bech32 addresses", () => {
    expect(detectAddressFormat("bcrt1qw508d6qejxtdg4y5r3zarvayr0c5xw7kygt080", ECASH_REGTEST)).toBe("p2wpkh");
    expect(detectAddressFormat("bcrt1p5cyxnuxmeuwuvkwfem96lqzszee2457ngs7gaz8tlrqvlp5e0wfshyzu6y", ECASH_REGTEST)).toBe("p2tr");
  });

  it("returns unknown for empty string", () => {
    expect(detectAddressFormat("", ECASH_MAINNET)).toBe("unknown");
  });

  it("returns unknown for unrecognized format", () => {
    expect(detectAddressFormat("xyz_not_a_valid_address!", ECASH_MAINNET)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Sidechain Deposit Validation
// ---------------------------------------------------------------------------

describe("Sidechain Deposit Validation", () => {
  it("rejects zero amount", () => {
    const result = validateSidechainDeposit(BigInt(0));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("positive");
  });

  it("rejects negative amount", () => {
    const result = validateSidechainDeposit(BigInt(-1));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("positive");
  });

  it("rejects amount below minimum", () => {
    const result = validateSidechainDeposit(BigInt(1));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("below the minimum");
  });

  it("accepts amount at minimum", () => {
    const result = validateSidechainDeposit(MINIMUM_SIDECHAIN_DEPOSIT_SATOSHIS);
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("");
  });

  it("accepts amount above minimum", () => {
    const result = validateSidechainDeposit(BigInt("100000000"));
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("");
  });
});
