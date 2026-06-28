// packages/wallet/src/hardware/trezorFormat.ts
//
// HardwareSignRequest -> Trezor-protobuf sign params (shared by OneKey +
// Trezor; OneKey's hd-transport mirrors Trezor field-for-field).
// SegWit v0 P2WPKH signs from amount + address_n, so refTxs are NOT required.
// Enums: SPENDWITNESS=3 (input), PAYTOADDRESS=0 (external out),
// PAYTOWITNESS=3 (change out).

import type { HardwareSignRequest } from "./types";
import { parsePath, coinIdFor } from "./network";
import { DUST_LIMIT_SATS } from "@sidecoin/shared";

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
  // HARDWARE-UNVERIFIED: fallback "PAYTOADDRESS" if a device rejects this.
  script_type: "PAYTOWITNESS";
}
export type TrezorFormatOutputAny =
  | TrezorFormatOutput
  | TrezorFormatChangeOutput;

export interface TrezorSignParams {
  coin: string;
  inputs: TrezorFormatInput[];
  outputs: TrezorFormatOutputAny[];
}

export function toTrezorSignParams(req: HardwareSignRequest): TrezorSignParams {
  if (req.inputs.length === 0) {
    throw new Error("Cannot build a hardware sign request with no inputs.");
  }
  const address_n = parsePath(req.derivationPath);

  const inputs: TrezorFormatInput[] = req.inputs.map((u) => ({
    address_n,
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

  return { coin: coinIdFor(req.network), inputs, outputs };
}
