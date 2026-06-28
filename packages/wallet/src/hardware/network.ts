// packages/wallet/src/hardware/network.ts

import type { NetworkId } from "@sidecoin/shared";

export function coinTypeFor(network: NetworkId): number {
  return network === "mainnet" ? 0 : 1;
}

export function defaultDerivationPath(network: NetworkId, index = 0): string {
  return `m/84'/${coinTypeFor(network)}'/0'/0/${index}`;
}

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

const HARDENED_OFFSET = 0x80000000;

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
