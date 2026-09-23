// packages/explorer/src/explorer/chains.ts

import { LAUNCH_SIDECHAINS } from "@sidecoin/shared/sidechains";
import type { ExplorerChain } from "./types";

export const DEFAULT_CHAIN_ID = "l1";

// Chains the explorer will actually fetch live data for. This is NOT the
// sidechain registry status (which is our source of truth for slot
// assignment + lifecycle) — it gates whether the explorer issues live API
// requests. Flipping a chain to "active" here makes it call the Sidecoin API
// for real data, so only do it once that chain has a live indexer.
const ACTIVE_EXPLORER_CHAIN_IDS = new Set(["l1", "bitnames", "thunder"]);

const L1_CHAIN: ExplorerChain = {
  id: "l1",
  displayName: "eCash",
  shortName: "eCash",
  kind: "l1",
  slot: null,
  description: "eCash (Signet) L1 parent chain activity.",
  status: "active",
};

export const EXPLORER_CHAINS: ExplorerChain[] = [
  L1_CHAIN,
  ...LAUNCH_SIDECHAINS.map((sidechain): ExplorerChain => ({
    id: sidechain.id,
    displayName: sidechain.displayName,
    shortName: sidechain.shortName,
    kind: "sidechain",
    slot: sidechain.slot,
    description: sidechain.description,
    status: ACTIVE_EXPLORER_CHAIN_IDS.has(sidechain.id) ? "active" : "coming soon",
  })),
];

export function getExplorerChain(chainId: string): ExplorerChain | undefined {
  return EXPLORER_CHAINS.find((chain) => chain.id === chainId);
}

export function isExplorerChainId(chainId: string): boolean {
  return getExplorerChain(chainId) != null;
}

export function getChainLabel(chainId: string): string {
  return getExplorerChain(chainId)?.displayName ?? chainId;
}
