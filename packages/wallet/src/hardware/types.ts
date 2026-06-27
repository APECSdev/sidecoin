// packages/wallet/src/hardware/types.ts

import type { NetworkId } from "@sidecoin/shared";

export interface HardwareAccount {
  path: string;
  address: string;
  publicKey: string;
}

/**
 * Hardware wallet surface: read (address derivation) + sign.
 *
 * Signing is PSBT-shaped at the interface boundary: the caller supplies an
 * unsigned spend description (inputs + outputs + fee); each adapter signs on
 * the device with its native SDK and returns finalized raw tx hex that drops
 * straight into broadcastTransaction(). No private key material ever crosses
 * this boundary.
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

/** A UTXO to be spent, in the shape every adapter needs. */
export interface HardwareInput {
  /** Previous txid, display/big-endian hex (indexer order == Trezor prev_hash). */
  txid: string;
  /** Output index within the previous tx. */
  vout: number;
  /** Value in satoshis. */
  amountSatoshis: bigint;
  /** Locking script (scriptPubKey) as hex. */
  scriptPubKey: string;
}

/**
 * A hardware-agnostic unsigned spend. Single-address wallet model: every input
 * is controlled by `derivationPath` (the wallet's index-0 BIP-84 key), and
 * change returns to that same key's scriptPubKey.
 */
export interface HardwareSignRequest {
  /** Network the spend targets (selects coin id + bech32 HRP on the device). */
  network: NetworkId;
  /** BIP-32 path that controls every input AND receives change, e.g. "m/84'/1'/0'/0/0". */
  derivationPath: string;
  /** UTXOs to spend (already coin-selected, fee-aware). */
  inputs: readonly HardwareInput[];
  /** Recipient bech32 P2WPKH address. */
  toAddress: string;
  /** Amount to send to the recipient, in satoshis. */
  amountSatoshis: bigint;
  /** Absolute fee in satoshis (computed upstream by selectCoins). */
  feeSatoshis: bigint;
  /** scriptPubKey (hex) change returns to (the derivationPath key's P2WPKH program). */
  changeScriptPubKey: string;
}

/** A device-signed transaction ready for broadcast. */
export interface HardwareSignedTx {
  /** Raw signed transaction hex. */
  hex: string;
  /** Transaction id (display/big-endian hex), if the device returned one. */
  txid: string;
}
