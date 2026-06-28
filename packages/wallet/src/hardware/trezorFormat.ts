// packages/wallet/src/hardware/trezorFormat.ts

import type { HardwareSignRequest } from "./types";
import { parsePath, coinIdFor } from "./network";
import { DUST_LIMIT_SATS } from "@sidecoin/shared";
import { Transaction } from "bitcoinjs-lib";

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
  script_type: "PAYTOWITNESS";
}
export type TrezorFormatOutputAny = TrezorFormatOutput | TrezorFormatChangeOutput;

export interface RefTransaction {
  version: number;
  lock_time: number;
  inputs: Array<{
    prev_hash: string;
    prev_index: number;
    script_sig: string;
    sequence: number;
  }>;
  bin_outputs: Array<{
    amount: string;
    script_pubkey: string;
  }>;
  hash: string;
}

export interface TrezorSignParams {
  coin: string;
  inputs: TrezorFormatInput[];
  outputs: TrezorFormatOutputAny[];
  refTxs: RefTransaction[];
}

/**
 * Build RefTransaction[] from a map of {txid -> raw hex}. OneKey firmware
 * requires these even for segwit inputs (unlike Trezor). Each RefTransaction
 * carries the full prevout tx parsed via bitcoinjs-lib so the device can
 * verify UTXOs and compute sighashes.
 *
 * IMPORTANT: bitcoinjs-lib v7 returns Uint8Array (not Buffer) for script
 * fields. Uint8Array.prototype.toString("hex") does NOT produce hex — it
 * produces comma-separated decimals. We must wrap in Buffer.from() before
 * calling toString("hex").
 */
export function buildRefTxs(
  rawTxs: Record<string, string>,
): RefTransaction[] {
  const out: RefTransaction[] = [];
  for (const [txid, hex] of Object.entries(rawTxs)) {
    const tx = Transaction.fromHex(hex);
    out.push({
      version: tx.version,
      lock_time: tx.locktime,
      inputs: tx.ins.map((ins) => ({
        prev_hash: Buffer.from(ins.hash).reverse().toString("hex"),
        prev_index: ins.index,
        script_sig: Buffer.from(ins.script).toString("hex"),
        sequence: ins.sequence,
      })),
      bin_outputs: tx.outs.map((o) => ({
        amount: o.value.toString(),
        script_pubkey: Buffer.from(o.script).toString("hex"),
      })),
      hash: tx.getId(),
    });
  }
  return out;
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

  const refTxs = req.rawTxs ? buildRefTxs(req.rawTxs) : [];

  return { coin: coinIdFor(req.network), inputs, outputs, refTxs };
}
