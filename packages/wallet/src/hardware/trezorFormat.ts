// packages/wallet/src/hardware/trezorFormat.ts
//
// Shared HardwareSignRequest -> Trezor-protobuf sign params converter.
//
// OneKey's `btcSignTransaction` accepts the Trezor-protobuf input/output shape
// (OneKey's @onekeyfe/hd-transport mirrors Trezor field-for-field: address_n,
// prev_hash, prev_index, amount, script_type). This module builds that shape.
//
// SegWit-only assumption: every input is P2WPKH controlled by `derivationPath`.
// For SegWit v0 the device commits to `amount` via BIP-143 and derives the
// witness script from address_n, so `refTxs` (full prevout transactions) are
// NOT required — we pass an empty array. This is why we can sign without a
// raw-transaction API endpoint.
//
// Enum values confirmed from @onekeyfe/hd-transport Enum_InputScriptType /
// Enum_OutputScriptType (== Trezor protobuf):
//   SPENDADDRESS=0, SPENDWITNESS=3   (inputs, native segwit keyhash)
//   PAYTOADDRESS=0, PAYTOWITNESS=3   (outputs; external vs change)

import type { HardwareSignRequest } from "./types";
import { parsePath, coinIdFor } from "./network";
import { DUST_LIMIT_SATS } from "@sidecoin/shared";

/** RBF-signaling sequence (BIP-125), matching the software builder. */
const SEQUENCE_RBF = 0xfffffffd;

export interface TrezorFormatInput {
  address_n: number[];
  prev_hash: string;
  prev_index: number;
  amount: string;
  script_type: "SPENDWITNESS";
  sequence: number;
}

export interface TrezorFormatOutput {
  address: string;
  amount: string;
  script_type: "PAYTOADDRESS";
}

export interface TrezorFormatChangeOutput {
  address_n: number[];
  amount: string;
  // HARDWARE-UNVERIFIED: change script_type for native-segwit. Trezor protobuf
  // OutputScriptType.PAYTOWITNESS (=3) produces a P2WPKH output to address_n.
  // If a device rejects this, try "PAYTOADDRESS" with address_n.
  script_type: "PAYTOWITNESS";
}

export type TrezorFormatOutputAny = TrezorFormatOutput | TrezorFormatChangeOutput;

export interface TrezorSignParams {
  coin: string;
  inputs: TrezorFormatInput[];
  outputs: TrezorFormatOutputAny[];
}

/**
 * Build Trezor/OneKey sign params from a hardware-agnostic sign request.
 * Change is created only when it strictly clears the dust limit (mirrors the
 * software builder; sub-dust change folds into the fee).
 */
export function toTrezorSignParams(req: HardwareSignRequest): TrezorSignParams {
  if (req.inputs.length === 0) {
    throw new Error("Cannot build a hardware sign request with no inputs.");
  }

  const address_n = parsePath(req.derivationPath);

  const inputs: TrezorFormatInput[] = req.inputs.map((u) => ({
    address_n,
    // prev_hash is display/big-endian hex (the indexer txid) — Trezor/OneKey
    // reverse to internal LE order themselves.
    prev_hash: u.txid,
    prev_index: u.vout,
    amount: u.amountSatoshis.toString(),
    script_type: "SPENDWITNESS",
    sequence: SEQUENCE_RBF,
  }));

  const outputs: TrezorFormatOutputAny[] = [
    {
      address: req.toAddress,
      amount: req.amountSatoshis.toString(),
      script_type: "PAYTOADDRESS",
    },
  ];

  let totalInput = 0n;
  for (const u of req.inputs) totalInput += u.amountSatoshis;
  const change = totalInput - req.amountSatoshis - req.feeSatoshis;

  if (change > DUST_LIMIT_SATS) {
    outputs.push({
      address_n,
      amount: change.toString(),
      script_type: "PAYTOWITNESS",
    });
  } else if (change < 0n) {
    throw new Error(
      `Insufficient funds: inputs ${totalInput} < amount ${req.amountSatoshis} + fee ${req.feeSatoshis}.`,
    );
  }

  return {
    coin: coinIdFor(req.network),
    inputs,
    outputs,
  };
}
