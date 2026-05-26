// packages/shared/src/sidechains/registry.ts
//
// Static registry of the 8 sidechains launching with the eCash hard fork.
//
// Source: https://ecash.com — the landing page lists all 8 by name:
//   thunder · zside · bitnames · bitassets · photon · truthcoin · coinshift
//   (plus one unnamed 8th slot, likely BIP-300's own hashrate escrow chain)
//
// Slot assignments are provisional until the eCash node publishes
// the final sidechain proposal transactions. The key hashes below
// are placeholders.

import type { SidechainDescriptor, SidechainSlot } from "../types/sidechain";

// ---------------------------------------------------------------------------
// Launch Sidechains
// ---------------------------------------------------------------------------

export const SIDECHAIN_THUNDER: SidechainDescriptor = {
  slot: 0,
  id: "thunder",
  displayName: "Thunder Network",
  description: "Payment channel network for instant, low-fee transactions. Lightning-compatible layer for everyday payments.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK: populate from sidechain proposal TX
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

export const SIDECHAIN_ZSIDE: SidechainDescriptor = {
  slot: 1,
  id: "zside",
  displayName: "zSide",
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
  description: "Decentralized naming and identity system. Register human-readable names anchored to the Bitcoin-secured mainchain.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

export const SIDECHAIN_BITASSETS: SidechainDescriptor = {
  slot: 3,
  id: "bitassets",
  displayName: "BitAssets",
  description: "Tokenized assets and prediction markets. Issue and trade synthetic assets secured by Bitcoin hashrate.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

export const SIDECHAIN_PHOTON: SidechainDescriptor = {
  slot: 4,
  id: "photon",
  displayName: "Photon",
  description: "EVM-compatible smart contract sidechain. Run Solidity contracts with Bitcoin-grade security via merged mining.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

export const SIDECHAIN_TRUTHCOIN: SidechainDescriptor = {
  slot: 5,
  id: "truthcoin",
  displayName: "Truthcoin",
  description: "Paul Sztorc's prediction market sidechain. Decentralized oracle system using peer-to-peer outcome resolution.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

export const SIDECHAIN_COINSHIFT: SidechainDescriptor = {
  slot: 6,
  id: "coinshift",
  displayName: "CoinShift",
  description: "Cross-chain atomic swap sidechain. Trustless exchange between eCash and other cryptocurrency networks.",
  status: "active",
  keyHash: "",  // CONFIRM PRE-FORK
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

//
// The 8th sidechain slot.
//
// ecash.com lists "8 sidechains at launch" but only names 7 explicitly.
// This placeholder reserves the slot. Update once the 8th chain is announced.
//
export const SIDECHAIN_RESERVED_7: SidechainDescriptor = {
  slot: 7,
  id: "reserved-7",
  displayName: "Sidechain #8 (TBA)",
  description: "Reserved sidechain slot. Details to be announced before the August 2026 hard fork.",
  status: "proposed",
  keyHash: "",
  supportsBmm: true,
  infoUrl: "https://ecash.com",
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Complete list of all sidechains available at launch, ordered by slot.
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
  SIDECHAIN_RESERVED_7,
] as const;

/**
 * Lookup a sidechain by its slot number.
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
 * Lookup a sidechain by its slot number, or throw.
 *
 * @param slot - The BIP-300 slot number
 * @returns The sidechain descriptor
 * @throws Error if the slot is not registered
 */
export function getSidechainBySlotOrThrow(slot: SidechainSlot): SidechainDescriptor {
  const sc = getSidechainBySlot(slot);

  if (!sc) {
    const validSlots = LAUNCH_SIDECHAINS.map((s) => s.slot).join(", ");
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
 * Returns the total number of registered sidechain slots.
 */
export function getSidechainCount(): number {
  return LAUNCH_SIDECHAINS.length;
}
