// packages/explorer/src/explorer/chains.ts

import type { ExplorerChain } from "./types";

export const DEFAULT_CHAIN_ID = "l1";

export const EXPLORER_CHAINS: ExplorerChain[] = [
  {
    id: "l1",
    displayName: "L1",
    shortName: "L1",
    kind: "l1",
    slot: null,
    description: "SidΞcoin L1 parent chain activity.",
    status: "active",
  },
  {
    id: "bitnames",
    displayName: "BitNames",
    shortName: "BitNames",
    kind: "sidechain",
    slot: 2,
    description: "Names, identity, records, contacts, and wallet identity.",
    status: "preview",
  },
  {
    id: "thunder",
    displayName: "Thunder Network",
    shortName: "Thunder",
    kind: "sidechain",
    slot: 9,
    description: "Fast payments, channels, invoices, and liquidity activity.",
    status: "preview",
  },
  {
    id: "zside",
    displayName: "zSide",
    shortName: "zSide",
    kind: "sidechain",
    slot: 3,
    description: "Privacy-focused Drivechain activity.",
    status: "preview",
  },
  {
    id: "bitassets",
    displayName: "BitAssets",
    shortName: "BitAssets",
    kind: "sidechain",
    slot: 4,
    description: "Native asset issuance and transfer activity.",
    status: "preview",
  },
  {
    id: "photon",
    displayName: "Photon",
    shortName: "Photon",
    kind: "sidechain",
    slot: 5,
    description: "High-throughput payment and settlement activity.",
    status: "preview",
  },
  {
    id: "truthcoin",
    displayName: "Truthcoin",
    shortName: "Truthcoin",
    kind: "sidechain",
    slot: 6,
    description: "Prediction market and oracle activity.",
    status: "preview",
  },
  {
    id: "coinshift",
    displayName: "CoinShift",
    shortName: "CoinShift",
    kind: "sidechain",
    slot: 7,
    description: "Swap and exchange activity across the Drivechains hub.",
    status: "preview",
  },
  {
    id: "riscy",
    displayName: "RISCy",
    shortName: "RISCy",
    kind: "sidechain",
    slot: 8,
    description: "Programmable execution and contract activity.",
    status: "preview",
  },
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
