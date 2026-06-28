// packages/wallet/src/hardware/types.ts

import type { NetworkId } from "@sidecoin/shared";

export interface HardwareAccount {
  path: string;
  address: string;
  publicKey: string;
}

/**
 * Hardware wallet surface: read (address derivation) + sign.
 * Signing is PSBT-shaped at the boundary: caller supplies an unsigned spend;
 * each adapter signs on-device and returns finalized raw tx hex for
 * broadcastTransaction(). No private key material crosses this boundary.
 */
export interface HardwareWallet {
  readonly name: string;
  connect(): Promise<void>;
  getAddress(path: string, opts?: GetAddressOpts): Promise<HardwareAccount>;
  signTransaction(req: HardwareSignRequest): Promise<HardwareSignedTx>;
  disconnect(): Promise<void>;
}

export interface GetAddressOpts {
  /** Device coin id. "btc" mainnet; "test" for signet/testnet. */
  coin?: string;
  /** Render the address on the device screen for visual confirmation. */
  showOnDevice?: boolean;
}

/** Supported hardware device kinds for the adapter factory. */
export type HardwareDeviceKind = "onekey" | "ledger" | "trezor";

export interface HardwareInput {
  txid: string;
  vout: number;
  amountSatoshis: bigint;
  scriptPubKey: string;
}

export interface HardwareSignRequest {
  network: NetworkId;
  derivationPath: string;
  inputs: readonly HardwareInput[];
  toAddress: string;
  amountSatoshis: bigint;
  feeSatoshis: bigint;
  changeScriptPubKey: string;
}

export interface HardwareSignedTx {
  hex: string;
  txid: string;
}
