// packages/shared/src/sidechains/thunder/wire.ts
//
// JSON wire shapes for Thunder's node JSON-RPC (submit_transaction /
// get_utxos / get_stxos) — serde-truth, NOT the node's OpenAPI document,
// which disagrees with its serde in three places (thunder-rust schema
// annotations lie about Hash, Authorization and bitcoin outpoints).
//
// Verified against thunder-rust v0.19.3 types/ serde derives (and
// unchanged from v0.18.1 — git diff of content.rs is empty; only
// outpoint.rs gained the UnsuccessfulWithdrawal variant):
//
//   - `Transaction.inputs` = Vec<(OutPoint, Hash)>: JSON array of 2-element
//     arrays; `Hash = [u8; 32]` has NO serde hex wrapper → an array of 32
//     numbers.
//   - `OutPoint` is an externally tagged enum:
//       {"Regular":     {"txid": "<64 lowercase hex, RAW byte order>", "vout": n}}
//       {"Coinbase":    {"txid": "<64 hex>", "vout": n}}
//       {"Deposit":      "<display-order txid>:<vout>"}   — a STRING: the
//                        newtype wraps bitcoin::OutPoint, whose serde is
//                        display-order "txid:vout"; byte-REVERSED relative
//                        to the raw bytes we Borsh-encode. Convert on this
//                        boundary only.
//       {"UnsuccessfulWithdrawal": {"m6id": "<64 hex>", "height": n, "vout": n}}
//   - `Address` serializes as its base58 STRING (serde_with DisplayFromStr).
//   - `Content` (externally tagged, DefaultRepr for human-readable JSON):
//       {"Value": <sats as JSON number>}          — Amount is a plain derived
//                                                 newtype over u64
//       {"Withdrawal": {"value": <sats>, "main_fee": <sats>, "main_address": "<string>"}}
//     The pre-0.18 names value_sats / main_fee_sats still decode.
//   - `proof` is a REQUIRED field with no serde default → submit must send
//     {"targets": [], "hashes": []}.
//   - `Authorization.verifying_key` / `.signature` are HEX strings since
//     0.18 (frost-ristretto255 serde).
//   - `Txid`/`M6id`/`CoinbaseTxid` are 32-byte hashes with
//     hexstr_human_readable serde → lowercase hex strings of RAW byte order.
//
// A withdrawal's mainchain destination travels in BOTH forms across the two
// wire formats: Borsh (signed, hashed) writes the scriptPubKey bytes; the
// submit JSON writes the address string. Builders construct the two together
// from one parsed address so they cannot drift apart.

import { base58 } from "@scure/base";

import {
  type ThunderContent,
  type ThunderOutPoint,
  type ThunderPointedOutput,
  type ThunderTransaction,
  type ThunderOutput,
} from "./transaction";

// ---------------------------------------------------------------------------
// Hex helpers
// ---------------------------------------------------------------------------

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`fromHex: odd-length string: ${hex}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Reverse byte order — converts between raw internal and display order. */
export function reverseBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[bytes.length - 1 - i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// OutPoint ↔ JSON
// ---------------------------------------------------------------------------

export function outPointToJson(op: ThunderOutPoint): unknown {
  switch (op.kind) {
    case "regular":
      return { Regular: { txid: toHex(op.txid), vout: op.vout } };
    case "coinbase":
      return { Coinbase: { txid: toHex(op.txid), vout: op.vout } };
    case "deposit":
      // bitcoin::OutPoint serde = display-order "txid:vout" string.
      return { Deposit: `${toHex(reverseBytes(op.txid))}:${op.vout}` };
    case "unsuccessful-withdrawal":
      return {
        UnsuccessfulWithdrawal: { m6id: toHex(op.m6id), height: op.height, vout: op.vout },
      };
  }
}

export function outPointFromJson(value: unknown): ThunderOutPoint {
  if (typeof value !== "object" || value === null) {
    throw new Error("outPointFromJson: expected an object");
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 1) {
    throw new Error(`outPointFromJson: expected one variant key, got ${keys}`);
  }
  const variant = keys[0];
  switch (variant) {
    case "Regular":
    case "Coinbase": {
      const inner = obj[variant] as { txid: string; vout: number };
      return {
        kind: variant === "Regular" ? "regular" : "coinbase",
        txid: fromHex(inner.txid),
        vout: inner.vout,
      };
    }
    case "Deposit": {
      const s = obj.Deposit as string;
      const colon = s.lastIndexOf(":");
      if (colon < 0) {
        throw new Error(`outPointFromJson: malformed deposit outpoint "${s}"`);
      }
      // Display order → raw internal byte order.
      return {
        kind: "deposit",
        txid: reverseBytes(fromHex(s.slice(0, colon))),
        vout: Number(s.slice(colon + 1)),
      };
    }
    case "UnsuccessfulWithdrawal": {
      const inner = obj[variant] as { m6id: string; height: number; vout: number };
      return {
        kind: "unsuccessful-withdrawal",
        m6id: fromHex(inner.m6id),
        height: inner.height,
        vout: inner.vout,
      };
    }
    default:
      throw new Error(`outPointFromJson: unknown variant "${variant}"`);
  }
}

// ---------------------------------------------------------------------------
// Content / Output / PointedOutput ↔ JSON
// ---------------------------------------------------------------------------

export function contentToJson(c: ThunderContent): unknown {
  switch (c.kind) {
    case "value":
      return { Value: Number(c.sats) };
    case "withdrawal":
      if (!c.mainAddress) {
        throw new Error(
          "contentToJson: withdrawal content needs mainAddress (the submit JSON writes the address string; Borsh writes the scriptPubKey)",
        );
      }
      return {
        Withdrawal: {
          value: Number(c.sats),
          main_fee: Number(c.mainFeeSats),
          main_address: c.mainAddress,
        },
      };
  }
}

export function contentFromJson(value: unknown): ThunderContent {
  if (typeof value !== "object" || value === null) {
    throw new Error("contentFromJson: expected an object");
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 1) {
    throw new Error(`contentFromJson: expected one variant key, got ${keys}`);
  }
  switch (keys[0]) {
    case "Value": {
      const v = obj.Value;
      if (typeof v === "object" && v !== null && "value_sats" in v) {
        // Pre-0.18 human-readable repr — still decodes.
        return { kind: "value", sats: BigInt((v as { value_sats: number }).value_sats) };
      }
      return { kind: "value", sats: BigInt(v as number) };
    }
    case "Withdrawal": {
      const inner = obj.Withdrawal as Record<string, unknown>;
      const value = inner.value ?? inner.value_sats;
      const mainFee = inner.main_fee ?? inner.main_fee_sats;
      const mainAddress = inner.main_address;
      if (value === undefined || mainFee === undefined || typeof mainAddress !== "string") {
        throw new Error("contentFromJson: malformed withdrawal content");
      }
      return {
        kind: "withdrawal",
        sats: BigInt(value as number),
        mainFeeSats: BigInt(mainFee as number),
        // The mainchain destination arrives as an address string on the
        // wire; the scriptPubKey half is only produced by builders that
        // parsed the address. Decoded rows carry the string alone.
        mainScriptPubKey: new Uint8Array(0),
        mainAddress,
      };
    }
    default:
      throw new Error(`contentFromJson: unknown variant "${keys[0]}"`);
  }
}

export function outputToJson(o: ThunderOutput): unknown {
  return { address: base58.encode(o.address), content: contentToJson(o.content) };
}

export function outputFromJson(value: unknown): ThunderOutput {
  const obj = value as { address: string; content: unknown };
  const bytes = base58.decode(obj.address);
  if (bytes.length !== 20) {
    throw new Error(`outputFromJson: address is ${bytes.length} bytes, expected 20`);
  }
  return { address: bytes, content: contentFromJson(obj.content) };
}

export function pointedOutputToJson(po: ThunderPointedOutput): unknown {
  return { outpoint: outPointToJson(po.outPoint), output: outputToJson(po.output) };
}

export function pointedOutputFromJson(value: unknown): ThunderPointedOutput {
  const obj = value as { outpoint: unknown; output: unknown };
  return {
    outPoint: outPointFromJson(obj.outpoint),
    output: outputFromJson(obj.output),
  };
}

// ---------------------------------------------------------------------------
// Transaction ↔ JSON
// ---------------------------------------------------------------------------

export function transactionToJson(tx: ThunderTransaction): unknown {
  return {
    inputs: tx.inputs.map((input) => [
      outPointToJson(input.outPoint),
      Array.from(input.utxoHash),
    ]),
    // proof is #[borsh(skip)] for Borsh but a REQUIRED serde field with no
    // default on the JSON side — the node regenerates the real proof from
    // its accumulator; submit must carry the empty one.
    proof: { targets: [], hashes: [] },
    outputs: tx.outputs.map(outputToJson),
  };
}

export function transactionFromJson(value: unknown): ThunderTransaction {
  const obj = value as {
    inputs: [unknown, number[]][];
    outputs: unknown[];
  };
  const inputs: ThunderTransaction["inputs"] = obj.inputs.map(([op, hash]) => ({
    outPoint: outPointFromJson(op),
    utxoHash: Uint8Array.from(hash),
  }));
  const outputs = obj.outputs.map(outputFromJson);
  return { inputs, outputs };
}

// ---------------------------------------------------------------------------
// Authorization (FROST signature per input) + submit payload
// ---------------------------------------------------------------------------

export interface ThunderAuthorizationJson {
  verifying_key: string;
  signature: string;
}

/** The submit_transaction params[0] body: { transaction, authorizations }. */
export function authorizedTransactionToJson(
  tx: ThunderTransaction,
  authorizations: ThunderAuthorizationJson[],
): unknown {
  if (authorizations.length !== tx.inputs.length) {
    throw new Error(
      `authorizedTransactionToJson: ${authorizations.length} authorizations for ${tx.inputs.length} inputs — thunder requires exactly one per input`,
    );
  }
  return { transaction: transactionToJson(tx), authorizations };
}
