// packages/shared/src/chain/networks.ts
//
// Network registry — provides lookup and enumeration of all
// supported chain configurations. This is the single entry point
// that platform clients use to resolve a NetworkId to a ChainConfig.

import type { ChainConfig, NetworkId } from "../types/network";

import {
  ECASH_MAINNET,
  ECASH_TESTNET,
  ECASH_SIGNET,
  ECASH_REGTEST,
} from "./config";

// ---------------------------------------------------------------------------
// Network Map
// ---------------------------------------------------------------------------

/**
 * Immutable mapping of every supported NetworkId to its full ChainConfig.
 *
 * Usage:
 *   import { NETWORKS } from "@sidecoin/shared/chain";
 *   const cfg = NETWORKS.mainnet;
 */
export const NETWORKS: Readonly<Record<NetworkId, ChainConfig>> = {
  mainnet: ECASH_MAINNET,
  testnet: ECASH_TESTNET,
  signet: ECASH_SIGNET,
  regtest: ECASH_REGTEST,
} as const;

/**
 * Ordered list of all supported network IDs.
 * Useful for populating network selection dropdowns.
 */
export const NETWORK_IDS: readonly NetworkId[] = [
  "mainnet",
  "testnet",
  "signet",
  "regtest",
] as const;

// ---------------------------------------------------------------------------
// Default Network
// ---------------------------------------------------------------------------

/**
 * The default network used when no explicit selection has been made.
 *
 * During pre-fork development this defaults to "signet" (the live signet
 * referenced on ecash.com). Switch to "mainnet" after the fork activates.
 *
 * IMPORTANT: Update this to "mainnet" after the August 21, 2026 fork.
 */
export const DEFAULT_NETWORK_ID: NetworkId = "signet";

export const DEFAULT_NETWORK: ChainConfig = NETWORKS[DEFAULT_NETWORK_ID];

// ---------------------------------------------------------------------------
// Lookup Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a NetworkId string to its ChainConfig.
 *
 * Returns `undefined` if the ID is not recognized, allowing callers
 * to handle the error case explicitly rather than throwing.
 *
 * @param id - The network identifier to look up
 * @returns The corresponding ChainConfig, or undefined
 */
export function getNetwork(id: string): ChainConfig | undefined {
  return NETWORKS[id as NetworkId];
}

/**
 * Resolve a NetworkId string to its ChainConfig, or throw.
 *
 * Use this in contexts where an invalid network ID is a programmer error
 * (e.g. deserializing persisted settings that should always be valid).
 *
 * @param id - The network identifier to look up
 * @returns The corresponding ChainConfig
 * @throws Error if the network ID is not recognized
 */
export function getNetworkOrThrow(id: string): ChainConfig {
  const config = getNetwork(id);

  if (!config) {
    const valid = NETWORK_IDS.join(", ");
    throw new Error(
      `Unknown network ID "${id}". Valid networks: ${valid}`
    );
  }

  return config;
}

/**
 * Returns true if the given string is a valid NetworkId.
 *
 * @param id - The string to validate
 */
export function isValidNetworkId(id: string): id is NetworkId {
  return NETWORK_IDS.includes(id as NetworkId);
}

/**
 * Returns only the production networks (those carrying real value).
 * Useful for filtering network selectors in release builds.
 */
export function getProductionNetworks(): readonly ChainConfig[] {
  return NETWORK_IDS
    .map((id) => NETWORKS[id])
    .filter((cfg) => cfg.network.isProduction);
}

/**
 * Returns only the non-production (test/dev) networks.
 * Useful for debug/developer settings panels.
 */
export function getTestNetworks(): readonly ChainConfig[] {
  return NETWORK_IDS
    .map((id) => NETWORKS[id])
    .filter((cfg) => !cfg.network.isProduction);
}
