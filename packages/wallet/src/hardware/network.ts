// packages/wallet/src/hardware/network.ts
//
// Network-aware helpers for hardware wallet derivation paths and device coin
// ids, plus a BIP-32 path string -> uint32[] parser (Trezor/OneKey address_n).
//
// These mirror @sidecoin/shared's coinTypeFor/deriveSigningKey conventions so
// the hardware-derived index-0 key is byte-identical to the software wallet's
// index-0 key (same path, same coinType, same HRP).

import type { NetworkId } from "@sidecoin/shared";

/** SLIP-0044 coin type: 0 mainnet, 1 every test network (BIP-44 registry). */
export function coinTypeFor(network: NetworkId): number {
  return network === "mainnet" ? 0 : 1;
}

/** BIP-84 native-segwit (P2WPKH) derivation path for a given network + index. */
export function defaultDerivationPath(network: NetworkId, index = 0): string {
  return `m/84'/${coinTypeFor(network)}'/0'/0/${index}`;
}

/**
 * Device coin id for the OneKey/Trezor coin registry.
 * Signet shares testnet's bech32 HRP ("tb"), so the device coin is "test".
 */
export function coinIdFor(network: NetworkId): string {
  switch (network) {
    case "mainnet":
      return "btc";
    case "testnet":
    case "signet":
    case "l2l-signet":
      return "test";
    case "regtest":
      return "regtest";
  }
}

/** Hardened bit in BIP-32 path segments. */
const HARDENED_OFFSET = 0x80000000;

/**
 * Parse a BIP-32 path string ("m/84'/1'/0'/0/0") into the uint32[] form
 * Trezor/OneKey expect for `address_n` (hardened segments carry 0x80000000).
 */
export function parsePath(path: string): number[] {
  const out: number[] = [];
  for (const seg of path.replace(/^m\//, "").split("/")) {
    if (seg === "") continue;
    const hardened = seg.endsWith("'");
    const raw = hardened ? seg.slice(0, -1) : seg;
    const index = Number.parseInt(raw, 10);
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Invalid BIP-32 path segment "${seg}" in path "${path}".`);
    }
    out.push(((hardened ? index | HARDENED_OFFSET : index) >>> 0) as number);
  }
  return out;
}
