// packages/wallet/src/hardware/types.ts

import type { NetworkId } from "@sidecoin/shared";

export interface HardwareAccount {
  path: string;
  address: string;
  publicKey: string;
}

export interface HardwareWallet {
  readonly name: string;
  connect(): Promise<void>;
  getAddress(path: string, opts?: GetAddressOpts): Promise<HardwareAccount>;
  signTransaction(req: HardwareSignRequest): Promise<HardwareSignedTx>;
  disconnect(): Promise<void>;
}

export interface GetAddressOpts {
  coin?: string;
  showOnDevice?: boolean;
}

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
  rawTxs?: Record<string, string>;
}

export interface HardwareSignedTx {
  hex: string;
  txid: string;
}
