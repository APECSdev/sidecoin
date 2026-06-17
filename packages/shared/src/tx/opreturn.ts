// packages/shared/src/tx/opreturn.ts
//
// Native-SegWit (P2WPKH) OP_RETURN transaction BUILDER + SIGNER.
//
// This is the sibling of p2wpkh.ts for metadata-only posts such as Coin News.
// It spends wallet-controlled P2WPKH UTXOs, emits exactly one zero-value
// OP_RETURN output, optionally returns change to the wallet, signs locally,
// and returns raw tx hex ready for broadcastTransaction().
//
// SECURITY: signing happens here, in-process, using raw SigningKey material
// from deriveSigningKey(). Only the resulting hex leaves the device.
//
// SupaQt Coin News indexing expects exactly one OP_RETURN posting output and
// reads only the first data push inside that output. validateOpReturnScript()
// enforces one non-empty data push before signing.

import * as btc from "@scure/btc-signer";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";

import type { NetworkId } from "../types/network";
import type { Utxo } from "../types/transaction";
import type { SigningKey } from "../wallet/signing";
import { getNetworkOrThrow } from "../chain";
import { DUST_LIMIT_SATS } from "./fee";
import {
  OP_PUSHDATA1,
  OP_PUSHDATA2,
  OP_PUSHDATA4,
  OP_RETURN,
} from "./coin-news";

/** RBF-signaling sequence (BIP-125): any value < 0xfffffffe opts in. */
const SEQUENCE_RBF = 0xfffffffd;

/** Final (non-RBF) sequence. */
const SEQUENCE_FINAL = 0xffffffff;

/**
 * Parameters for building + signing an OP_RETURN transaction.
 * The fee is explicit so the builder remains deterministic and testable.
 */
export interface BuildOpReturnParams {
  /** Network whose config must exist. */
  readonly network: NetworkId;

  /** UTXOs to spend. Must be non-empty; each must be P2WPKH this wallet owns. */
  readonly selectedUtxos: readonly Utxo[];

  /** Full OP_RETURN scriptPubKey with exactly one non-empty data push. */
  readonly opReturnScript: Uint8Array;

  /** Absolute fee in satoshis (NOT a rate). */
  readonly feeSatoshis: bigint;

  /** scriptPubKey to send change to (typically SigningKey.scriptPubKey). */
  readonly changeScriptPubKey: Uint8Array;

  /** Signing keys controlling the inputs; matched to UTXOs by scriptPubKey. */
  readonly signingKeys: readonly SigningKey[];

  /** Signal Replace-By-Fee (BIP-125). Defaults to true. */
  readonly enableRbf?: boolean;
}

/** A fully-signed OP_RETURN transaction plus UI/accounting data. */
export interface SignedOpReturnTransaction {
  /** Raw signed transaction hex, ready for broadcastTransaction(). */
  readonly hex: string;

  /** Transaction id (display/big-endian hex), as reported by the signer. */
  readonly txid: string;

  /** Actual virtual size of the finalized transaction, in vbytes. */
  readonly vsize: number;

  /** Effective fee actually paid = totalInput - change. */
  readonly feeSatoshis: bigint;

  /** Change output value (0 if no change output was created). */
  readonly changeSatoshis: bigint;

  /** Sum of all input values, in satoshis. */
  readonly totalInputSatoshis: bigint;

  /** Whether a change output was created (false if change folded into fee). */
  readonly hasChange: boolean;
}

/**
 * Validate that script is OP_RETURN followed by exactly one non-empty data push.
 *
 * SupaQt reads only the first data push in the OP_RETURN output. Rejecting
 * extra pushes avoids ambiguous posts and keeps wallet-created transactions
 * aligned with the indexer contract.
 */
export function validateOpReturnScript(script: Uint8Array): void {
  if (script.length < 3) {
    throw new Error("OP_RETURN script is too short.");
  }

  if (script[0] !== OP_RETURN) {
    throw new Error("OP_RETURN script must start with OP_RETURN.");
  }

  const opcode = script[1];
  let dataLength = 0;
  let headerLength = 0;

  if (opcode <= 75) {
    dataLength = opcode;
    headerLength = 2;
  } else if (opcode === OP_PUSHDATA1) {
    if (script.length < 3) {
      throw new Error("PUSHDATA1 OP_RETURN script is truncated.");
    }
    dataLength = script[2];
    headerLength = 3;
  } else if (opcode === OP_PUSHDATA2) {
    if (script.length < 4) {
      throw new Error("PUSHDATA2 OP_RETURN script is truncated.");
    }
    dataLength = script[2] | (script[3] << 8);
    headerLength = 4;
  } else if (opcode === OP_PUSHDATA4) {
    if (script.length < 6) {
      throw new Error("PUSHDATA4 OP_RETURN script is truncated.");
    }
    dataLength =
      script[2] |
      (script[3] << 8) |
      (script[4] << 16) |
      (script[5] << 24);
    headerLength = 6;
  } else {
    throw new Error(`Unsupported OP_RETURN push opcode 0x${opcode.toString(16)}.`);
  }

  if (dataLength <= 0) {
    throw new Error("OP_RETURN data push must not be empty.");
  }

  if (script.length !== headerLength + dataLength) {
    throw new Error(
      "OP_RETURN script must contain exactly one data push and no trailing bytes.",
    );
  }
}

/**
 * Validate a native SegWit v0 P2WPKH scriptPubKey for wallet change.
 *
 * The transaction is constructed with allowUnknownOutputs because OP_RETURN is
 * intentionally unspendable. This guard keeps the change output constrained to
 * the wallet's expected P2WPKH shape.
 */
function validateP2wpkhChangeScript(script: Uint8Array): void {
  if (script.length !== 22 || script[0] !== 0x00 || script[1] !== 0x14) {
    throw new Error(
      "Change scriptPubKey must be native SegWit P2WPKH: OP_0 <20-byte hash>.",
    );
  }
}

/**
 * Build and sign a zero-value OP_RETURN transaction.
 *
 * @throws If validation fails (no utxos, no signing keys, invalid OP_RETURN,
 *         insufficient funds, or a UTXO with no matching signing key).
 */
export function buildAndSignOpReturnTransaction(
  params: BuildOpReturnParams,
): SignedOpReturnTransaction {
  const {
    network,
    selectedUtxos,
    opReturnScript,
    feeSatoshis,
    changeScriptPubKey,
    signingKeys,
    enableRbf = true,
  } = params;

  // ----- validation -------------------------------------------------------
  getNetworkOrThrow(network);

  if (selectedUtxos.length === 0) {
    throw new Error("Cannot build an OP_RETURN transaction with no inputs.");
  }
  if (signingKeys.length === 0) {
    throw new Error("Cannot sign an OP_RETURN transaction with no signing keys.");
  }
  if (feeSatoshis < 0n) {
    throw new Error(`Fee must be non-negative, got ${feeSatoshis}.`);
  }

  validateOpReturnScript(opReturnScript);
  validateP2wpkhChangeScript(changeScriptPubKey);

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

  if (totalInputSatoshis < feeSatoshis) {
    throw new Error(
      `Insufficient funds: inputs total ${totalInputSatoshis} but need ` +
        `${feeSatoshis} for fee.`,
    );
  }

  const rawChange = totalInputSatoshis - feeSatoshis;

  // ----- build ------------------------------------------------------------
  const tx = new btc.Transaction({
    allowUnknownOutputs: true,
  });
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

    // ⚠️ TXID byte-order mirrors p2wpkh.ts: decoded display-order hex is
    // passed to @scure/btc-signer, which is expected to serialize LE order.
    // Must still be confirmed with testmempoolaccept before production use.
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

  // Metadata output. Standard OP_RETURN value is zero sats.
  tx.addOutput({ script: opReturnScript, amount: 0n });

  // Change output — only if it clears the dust limit. Otherwise the change
  // is left on the table and absorbed into the fee.
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
  const effectiveFee = totalInputSatoshis - changeSatoshis;

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
