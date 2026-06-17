// packages/shared/src/sidechains/registry.ts
//
// Static registry of the drivechain (BIP-300) sidechains for the eCash
// hard fork.
//
// SLOT ASSIGNMENTS ARE AUTHORITATIVE — sourced from the official
// drivechain.info dev.txt ports table (Sztorc, 2026-02-19) and verified
// against the live indexer's chain registry:
//
//   slot   chain        (rpc port)
//   ----   ----------   ----------
//    2     bitnames     6002
//    3     riscy        (proposed — no port until activation)
//    4     bitassets    6004
//    9     thunder      6009
//    13    truthcoin    6013
//    98    zside        6098
//    99    photon       6099
//    255   coinshift    6255
//    TBD   elementsplus (announced — no assigned slot yet)
//
// These are NOT sequential — BIP-300 slots are sparse, assigned per
// proposal. Do not assume slot === array index.
//
// The keyHash values below are placeholders, populated from the
// sidechain proposal transactions pre-fork.

import type { SidechainDescriptor, SidechainSlot } from "../types/sidechain";

// ---------------------------------------------------------------------------
// Launch Sidechains
// ---------------------------------------------------------------------------

export const SIDECHAIN_THUNDER: SidechainDescriptor = {
  slot: 9,
  id: "thunder",
  displayName: "Thunder Network",
  shortName: "Thunder",
  description: "High-throughput scaling sidechain with a large, growing blocksize and fraud proofs. Fast, low-fee everyday payments.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK: populate from sidechain proposal TX
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

export const SIDECHAIN_ZSIDE: SidechainDescriptor = {
  slot: 98,
  id: "zside",
  displayName: "zSide",
  shortName: "zSide",
  description: "Privacy-focused sidechain with shielded transactions. Zcash-style zero-knowledge proofs on a Bitcoin-secured chain.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

export const SIDECHAIN_BITNAMES: SidechainDescriptor = {
  slot: 2,
  id: "bitnames",
  displayName: "BitNames",
  shortName: "BitNames",
  description: "Decentralized naming and identity system. Register human-readable names anchored to the Bitcoin-secured mainchain.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

export const SIDECHAIN_BITASSETS: SidechainDescriptor = {
  slot: 4,
  id: "bitassets",
  displayName: "BitAssets",
  shortName: "BitAssets",
  description: "Tokenized assets — issue and trade ERC-20-style tokens, NFTs, and ICOs secured by Bitcoin hashrate.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

export const SIDECHAIN_PHOTON: SidechainDescriptor = {
  slot: 99,
  id: "photon",
  displayName: "Photon",
  shortName: "Photon",
  description: "Post-quantum cryptography sidechain. Quantum-resistant signatures securing value against future quantum attacks.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

export const SIDECHAIN_TRUTHCOIN: SidechainDescriptor = {
  slot: 13,
  id: "truthcoin",
  displayName: "Truthcoin",
  shortName: "Truthcoin",
  description: "Paul Sztorc's prediction market sidechain. Decentralized oracle system using peer-to-peer outcome resolution.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

export const SIDECHAIN_COINSHIFT: SidechainDescriptor = {
  slot: 255,
  id: "coinshift",
  displayName: "CoinShift",
  shortName: "CoinShift",
  description: "Cross-chain atomic swap sidechain. Trustless exchange between eCash and other cryptocurrency networks.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

//
// RISCy — a PROPOSED drivechain at slot 3.
//
// Listed in the live indexer registry as status "proposed", enabled:false,
// with no RPC port until activation, and NOT yet ingested. Reserved here
// so slot 3 resolves to a known descriptor rather than undefined.
//
export const SIDECHAIN_RISCY: SidechainDescriptor = {
  slot: 3,
  id: "riscy",
  displayName: "RISCy",
  shortName: "RISCy",
  description: "Proposed RISC-V-based sidechain. Reserved at slot 3; not yet activated and not accepting deposits.",
  status: "proposed",
  keyHash: "",
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

//
// Elements Plus — an announced coming-soon drivechain with no slot yet.
//
// Paul Sztorc announced Elements Plus for the L2L signet as an Elements-based
// BIP-300 L2. No BIP-300 slot number has been assigned yet, so slot MUST stay
// null until the authoritative slot is known.
//
export const SIDECHAIN_ELEMENTS_PLUS: SidechainDescriptor = {
  slot: null,
  id: "elementsplus",
  displayName: "Elements Plus",
  shortName: "Elements+",
  description: "Elements-based BIP-300 Drivechain functionality with advanced Bitcoin scripting features.",
  status: "coming soon",
  keyHash: "",
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Complete list of all known drivechain sidechains.
 *
 * Contains the 7 ACTIVE drivechains plus proposed / coming-soon chains.
 * Use getActiveSidechains() for the 7 that are live at launch.
 *
 * NOTE: ordered by launch prominence, NOT by slot. Slots are sparse
 * (9, 98, 2, 4, 99, 13, 255, 3) and future announced chains can have
 * null slots until assignment — never use array index as a slot.
 *
 * Usage:
 *   import { LAUNCH_SIDECHAINS } from "@sidecoin/shared/sidechains";
 *   LAUNCH_SIDECHAINS.forEach(sc => console.log(sc.displayName));
 */
export const LAUNCH_SIDECHAINS: readonly SidechainDescriptor[] = [
  SIDECHAIN_THUNDER,
  SIDECHAIN_ZSIDE,
  SIDECHAIN_BITNAMES,
  SIDECHAIN_BITASSETS,
  SIDECHAIN_PHOTON,
  SIDECHAIN_TRUTHCOIN,
  SIDECHAIN_COINSHIFT,
  SIDECHAIN_RISCY,
  SIDECHAIN_ELEMENTS_PLUS,
] as const;

/**
 * Lookup a sidechain by its assigned slot number.
 *
 * @param slot - The BIP-300 slot number (0-255)
 * @returns The sidechain descriptor, or undefined if the slot is not registered
 */
export function getSidechainBySlot(slot: SidechainSlot): SidechainDescriptor | undefined {
  return LAUNCH_SIDECHAINS.find((sc) => sc.slot === slot);
}

/**
 * Lookup a sidechain by its machine-readable ID.
 *
 * @param id - The sidechain ID, e.g. "thunder"
 * @returns The sidechain descriptor, or undefined if not found
 */
export function getSidechainById(id: string): SidechainDescriptor | undefined {
  return LAUNCH_SIDECHAINS.find((sc) => sc.id === id);
}

/**
 * Lookup a sidechain by its assigned slot number, or throw.
 *
 * @param slot - The BIP-300 slot number
 * @returns The sidechain descriptor
 * @throws Error if the slot is not registered
 */
export function getSidechainBySlotOrThrow(slot: SidechainSlot): SidechainDescriptor {
  const sc = getSidechainBySlot(slot);

  if (!sc) {
    const validSlots = LAUNCH_SIDECHAINS
      .map((s) => s.slot)
      .filter((slot): slot is SidechainSlot => slot != null)
      .join(", ");
    throw new Error(
      `Unknown sidechain slot ${slot}. Registered slots: ${validSlots}`
    );
  }

  return sc;
}

/**
 * Returns only the active sidechains (excludes proposed/inactive/failed).
 * Useful for populating deposit target dropdowns.
 */
export function getActiveSidechains(): readonly SidechainDescriptor[] {
  return LAUNCH_SIDECHAINS.filter((sc) => sc.status === "active");
}

/**
 * Returns the total number of known sidechains.
 */
export function getSidechainCount(): number {
  return LAUNCH_SIDECHAINS.length;
}
