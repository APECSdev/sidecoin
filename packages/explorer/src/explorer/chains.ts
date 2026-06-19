// packages/explorer/src/explorer/chains.ts

import { LAUNCH_SIDECHAINS } from "@sidecoin/shared/sidechains";
import type { ExplorerChain } from "./types";

export const DEFAULT_CHAIN_ID = "l1";

const ACTIVE_EXPLORER_CHAIN_IDS = new Set(["l1", "bitnames", "thunder"]);

const L1_CHAIN: ExplorerChain = {
  id: "l1",
  displayName: "L1",
  shortName: "L1",
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
