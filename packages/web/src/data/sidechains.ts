// packages/web/src/data/sidechains.ts
//
// Single source of truth for sidechain data on sidecoin.app.
//
// Slot / name / description / status are pulled DIRECTLY from the
// authoritative registry in @sidecoin/shared so the website can never
// drift from the wallet again. Only presentation-layer extras
// (tagline, feature bullets) live here.
//
// Slots are SPARSE (2, 3, 4, 9, 13, 98, 99, 255) — order below is by
// launch prominence, matching LAUNCH_SIDECHAINS. Never use index as slot.

import { LAUNCH_SIDECHAINS } from "@sidecoin/shared/sidechains";

type SidechainDescriptor = (typeof LAUNCH_SIDECHAINS)[number];

// Derived from the registry's own data — avoids a deep subpath import
// of @sidecoin/shared/types/sidechain (which isn't exported). Tracks the
// canonical SidechainStatus union automatically.
export type SidechainStatus = SidechainDescriptor["status"];

interface Presentation {
  tagline: string;
  features: string[];
}

// Presentation-only marketing copy, keyed by sidechain id.
// NOTE: review these bullets — they are website copy, not registry data.
const PRESENTATION: Record<string, Presentation> = {
  thunder: {
    tagline: "High-throughput, low-fee payments",
    features: [
      "Large, growing block size for high throughput",
      "Fraud proofs for trust-minimized validation",
      "Fast, low-fee everyday payments",
      "Optimized for high transaction volume",
    ],
  },
  zside: {
    tagline: "Private Bitcoin transactions",
    features: [
      "Zero-knowledge shielded transactions",
      "Confidential amounts and addresses",
      "Selective disclosure for compliance",
      "Zcash-grade cryptographic privacy",
    ],
  },
  bitnames: {
    tagline: "Decentralized identity and naming",
    features: [
      "Human-readable address mapping",
      "Decentralized DNS functionality",
      "Portable digital identity",
      "Names anchored to the Bitcoin-secured mainchain",
    ],
  },
  bitassets: {
    tagline: "Tokenized assets on Bitcoin",
    features: [
      "Issue ERC-20-style tokens",
      "Mint and trade NFTs",
      "Launch ICOs secured by Bitcoin hashrate",
      "On-chain settlement and clearing",
    ],
  },
  photon: {
    tagline: "Post-quantum security",
    features: [
      "Quantum-resistant digital signatures",
      "Post-quantum cryptographic primitives",
      "Forward security against future quantum attacks",
      "Protects stored value over the long term",
    ],
  },
  truthcoin: {
    tagline: "Decentralized prediction markets",
    features: [
      "Peer-to-peer outcome resolution",
      "Trustless prediction markets",
      "Decentralized oracle system",
      "Information aggregation incentives",
    ],
  },
  coinshift: {
    tagline: "Cross-chain atomic swaps",
    features: [
      "Trustless atomic swap execution",
      "Cross-chain liquidity pools",
      "No centralized exchange dependency",
      "Multi-network bridge support",
    ],
  },
  elementsplus: {
    tagline: "Elements-based Drivechain coming soon",
    features: [
      "Elements-based BIP-300 L2 design",
      "Advanced Bitcoin scripting features",
      "Announced for L2L signet",
      "Slot assignment pending",
    ],
  },
  riscy: {
    tagline: "Proposed RISC-V sidechain",
    features: [
      "RISC-V-based execution environment",
      "Reserved at BIP-300 slot 3",
      "Not yet activated — not accepting deposits",
    ],
  },
};

export interface SidechainView extends SidechainDescriptor, Presentation {}

// Merge authoritative registry data with presentation extras.
export const SIDECHAINS: SidechainView[] = LAUNCH_SIDECHAINS.map((sc) => ({
  ...sc,
  ...(PRESENTATION[sc.id] ?? { tagline: "", features: [] }),
}));

// 7 active at launch; RISCy (slot 3) is proposed.
export const ACTIVE_SIDECHAIN_COUNT = SIDECHAINS.filter(
  (sc) => sc.status === "active",
).length;
