// packages/shared/src/tx/p2wpkh.ts
//
// Native-SegWit (P2WPKH) transaction BUILDER + SIGNER.
//
// Takes ALREADY-SELECTED utxos plus an EXPLICIT fee (computed upstream by
// fee.ts / coin-selection) and produces a fully-signed raw transaction hex
// ready for broadcastTransaction(). Keeping the fee explicit makes the
// builder deterministic: identical inputs always yield identical bytes
// (ECDSA nonces are RFC-6979 deterministic), which is what lets us test it.
//
// SECURITY: signing happens here, in-process, using the raw SigningKey from
// deriveSigningKey(). Only the resulting hex leaves the device. No key
// material is logged or returned. This matches the wallet's existing
// client-side trust model.
//
// ⚠️  WIRE-CORRECTNESS GATE: the byte-exact output of this builder MUST be
//     validated against the signet node's `testmempoolaccept` before any
//     produced hex is trusted on-chain. Two things in particular are only
//     provable live, not by unit test:
//       1. txid byte-order passed to addInput (see TXID note below).
//       2. final witness / sighash correctness end-to-end.
//     The unit suite proves determinism, structure, fee accounting, and
//     validation — necessary but not sufficient for "this will confirm".

import * as btc from "@scure/btc-signer";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { bech32 } from "@scure/base";

import type { NetworkId } from "../types/network";
import type { Utxo } from "../types/transaction";
import type { SigningKey } from "../wallet/signing";
import { getNetworkOrThrow } from "../chain";
import { DUST_LIMIT_SATS } from "./fee";

/** RBF-signaling sequence (BIP-125): any value < 0xfffffffe opts in. */
const SEQUENCE_RBF = 0xfffffffd;

/** Final (non-RBF) sequence. */
const SEQUENCE_FINAL = 0xffffffff;

/**
 * Parameters for building + signing a P2WPKH transaction.
 * The fee is explicit — compute it with estimateP2wpkhFee() upstream.
 */
export interface BuildP2wpkhParams {
  /** Network whose bech32 HRP the recipient address must match. */
  readonly network: NetworkId;

  /** UTXOs to spend. Must be non-empty; each must be P2WPKH this wallet owns. */
  readonly selectedUtxos: readonly Utxo[];

  /** Destination bech32 P2WPKH address (witness v0). */
  readonly toAddress: string;

  /** Amount to send to toAddress, in satoshis. */
  readonly amountSatoshis: bigint;

  /** Absolute fee in satoshis (NOT a rate). See fee.ts. */
  readonly feeSatoshis: bigint;

  /** scriptPubKey to send change to (typically SigningKey.scriptPubKey). */
  readonly changeScriptPubKey: Uint8Array;

  /** Signing keys controlling the inputs; matched to UTXOs by scriptPubKey. */
  readonly signingKeys: readonly SigningKey[];

  /** Signal Replace-By-Fee (BIP-125). Defaults to true. */
  readonly enableRbf?: boolean;
}

/** A fully-signed transaction plus the accounting needed for UI + records. */
export interface SignedTransaction {
  /** Raw signed transaction hex, ready for broadcastTransaction(). */
  readonly hex: string;

  /** Transaction id (display/big-endian hex), as reported by the signer. */
  readonly txid: string;

  /** Actual virtual size of the finalized transaction, in vbytes. */
  readonly vsize: number;

  /** Effective fee actually paid = totalInput - amount - change. */
  readonly feeSatoshis: bigint;

  /** Change output value (0 if no change output was created). */
  readonly changeSatoshis: bigint;

  /** Sum of all input values, in satoshis. */
  readonly totalInputSatoshis: bigint;

  /** Whether a change output was created (false if change folded into fee). */
  readonly hasChange: boolean;
}

/**
 * Decode a bech32 P2WPKH (witness v0) address into its 22-byte scriptPubKey.
 * Rejects wrong-network addresses, non-v0 (e.g. taproot), and bad lengths.
 * Note: bech32.decode naturally rejects bech32m (taproot v1) by checksum.
 */
function p2wpkhScriptFromAddress(
  address: string,
  expectedHrp: string,
): Uint8Array {
  let decoded: { prefix: string; words: number[] };
  try {
    decoded = bech32.decode(address as `${string}1${string}`);
  } catch {
    throw new Error(
      `Recipient is not a valid bech32 address: "${address}".`,
    );
  }

  if (decoded.prefix !== expectedHrp) {
    throw new Error(
      `Recipient address HRP "${decoded.prefix}" does not match the ` +
        `network HRP "${expectedHrp}". Wrong network?`,
    );
  }

  const version = decoded.words[0];
  if (version !== 0) {
    throw new Error(
      `Only witness v0 (P2WPKH) recipients are supported; got v${version}.`,
    );
  }

  const program = Uint8Array.from(bech32.fromWords(decoded.words.slice(1)));
  if (program.length !== 20) {
    throw new Error(
      `Recipient is not P2WPKH: witness program is ${program.length} ` +
        `bytes, expected 20.`,
    );
  }

  // OP_0 <0x14> <20-byte program>
  const script = new Uint8Array(22);
  script[0] = 0x00;
  script[1] = 0x14;
  script.set(program, 2);
  return script;
}

/**
 * Build and sign a P2WPKH transaction.
 *
 * @throws If validation fails (no utxos, dust amount, insufficient funds,
 *         bad recipient, or a UTXO with no matching signing key).
 */
export function buildAndSignP2wpkhTransaction(
  params: BuildP2wpkhParams,
): SignedTransaction {
  const {
    network,
    selectedUtxos,
    toAddress,
    amountSatoshis,
    feeSatoshis,
    changeScriptPubKey,
    signingKeys,
    enableRbf = true,
  } = params;

  // ----- validation -------------------------------------------------------
  if (selectedUtxos.length === 0) {
    throw new Error("Cannot build a transaction with no inputs.");
  }
  if (signingKeys.length === 0) {
    throw new Error("Cannot sign a transaction with no signing keys.");
  }
  if (amountSatoshis <= 0n) {
    throw new Error(`Send amount must be positive, got ${amountSatoshis}.`);
  }
  if (amountSatoshis < DUST_LIMIT_SATS) {
    throw new Error(
      `Send amount ${amountSatoshis} is below the dust limit ` +
        `${DUST_LIMIT_SATS}.`,
    );
  }
  if (feeSatoshis < 0n) {
    throw new Error(`Fee must be non-negative, got ${feeSatoshis}.`);
  }

  const config = getNetworkOrThrow(network);
  const recipientScript = p2wpkhScriptFromAddress(toAddress, config.bech32.hrp);

  // Index signing keys by their scriptPubKey for input matching.
  const keyByScript = new Map<string, SigningKey>();
  for (const key of signingKeys) {
    keyByScript.set(bytesToHex(key.scriptPubKey), key);
  }

  // ----- balance math -----------------------------------------------------
  let totalInputSatoshis = 0n;
  for (const utxo of selectedUtxos) {
    totalInputSatoshis += utxo.amountSatoshis;
  }

  const required = amountSatoshis + feeSatoshis;
  if (totalInputSatoshis < required) {
    throw new Error(
      `Insufficient funds: inputs total ${totalInputSatoshis} but need ` +
        `${required} (amount ${amountSatoshis} + fee ${feeSatoshis}).`,
    );
  }

  const rawChange = totalInputSatoshis - amountSatoshis - feeSatoshis;

  // ----- build ------------------------------------------------------------
  const tx = new btc.Transaction();
  const sequence = enableRbf ? SEQUENCE_RBF : SEQUENCE_FINAL;

  // Track which distinct keys we actually use, so we sign each exactly once.
  const usedKeys = new Map<string, SigningKey>();

  for (const utxo of selectedUtxos) {
    const scriptHex = utxo.scriptPubKey.toLowerCase();
    const key = keyByScript.get(scriptHex);
    if (!key) {
      throw new Error(
        `No signing key for UTXO ${utxo.txid}:${utxo.vout} ` +
          `(scriptPubKey ${scriptHex}).`,
      );
    }
    usedKeys.set(scriptHex, key);

    // ⚠️ TXID byte-order: passed as decoded display-order hex. @scure/btc-signer
    //    is expected to reverse to internal LE order on serialization. This is
    //    the one assumption that MUST be confirmed by testmempoolaccept before
    //    trusting on-chain; if the node reports a missing/unknown prevout, the
    //    fix is to reverse these bytes here.
    tx.addInput({
      txid: hexToBytes(utxo.txid),
      index: utxo.vout,
      witnessUtxo: {
        script: hexToBytes(utxo.scriptPubKey),
        amount: utxo.amountSatoshis,
      },
      sequence,
    });
  }

  // Recipient output.
  tx.addOutput({ script: recipientScript, amount: amountSatoshis });

  // Change output — only if it clears the dust limit. Otherwise the change
  // is left on the table and absorbed into the fee (standard wallet behavior).
  let changeSatoshis = 0n;
  let hasChange = false;
  if (rawChange > DUST_LIMIT_SATS) {
    tx.addOutput({ script: changeScriptPubKey, amount: rawChange });
    changeSatoshis = rawChange;
    hasChange = true;
  }

  // ----- sign + finalize --------------------------------------------------
  for (const key of usedKeys.values()) {
    tx.sign(key.privateKey);
  }
  tx.finalize();

  // Effective fee reflects any sub-dust change that was folded in.
  const effectiveFee = totalInputSatoshis - amountSatoshis - changeSatoshis;

  return {
    hex: tx.hex,
    txid: tx.id,
    vsize: tx.vsize,
    feeSatoshis: effectiveFee,
    changeSatoshis,
    totalInputSatoshis,
    hasChange,
  };
}
