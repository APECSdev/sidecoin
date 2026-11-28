// packages/shared/src/sidechains/thunder/transaction.ts
//
// Thunder transaction types + canonical Borsh codec + txid/utxo-hash.
//
// All shapes are thunder-rust v0.19.3 `types/` (MIT), byte-verified:
//
//   Transaction::txid = BLAKE3(borsh(Transaction))          — 32 bytes
//   input Hash        = BLAKE3(borsh(PointedOutput))        — the utreexo
//                        leaf the node proves against; CONSENSUS-CRITICAL:
//                        get it wrong and submit_transaction proves the
//                        wrong leaf and the tx is rejected
//   tx canonical size = every field fixed-width → computable exactly before
//                        building (used to price the fee)
//
// The Utreexo `proof` field is `#[borsh(skip)]`: absent from the signed
// bytes, absent from the txid. A thin client builds the tx with an empty
// proof, signs it, and the node's submit_transaction regenerates the proof
// from its accumulator before applying (thunder-rust Node::regenerate_proof)
// — the phone never touches the accumulator.

import { blake3 } from "@noble/hashes/blake3";

import { BorshReader, BorshWriter } from "./borsh";

/** A reference to the UTXO an input spends. Tag numbers = Rust enum order. */
export type ThunderOutPoint =
  | { kind: "regular"; txid: Uint8Array; vout: number }
  | { kind: "coinbase"; txid: Uint8Array; vout: number }
  | /** Mainchain deposit outpoint. `txid` is the RAW INTERNAL byte order of
   * the mainchain txid (NOT display order). */
    { kind: "deposit"; txid: Uint8Array; vout: number }
  | { kind: "unsuccessful-withdrawal"; m6id: Uint8Array; height: number; vout: number };

/** An output's payload. */
export type ThunderContent =
  | { kind: "value"; sats: bigint }
  | /** Withdrawal to the mainchain. Borsh (signed + hashed) carries the
   * mainchain destination as its scriptPubKey bytes; the submit JSON carries
   * the address string. Builders set BOTH from one parsed address so the two
   * cannot drift apart; rows decoded off the wire carry the string only. */
    {
      kind: "withdrawal";
      sats: bigint;
      mainFeeSats: bigint;
      mainScriptPubKey: Uint8Array;
      /** Mainchain payout address string (e.g. "bc1q…") — JSON wire only. */
      mainAddress?: string;
    };

/** A transaction output: 20-byte address hash + content. */
export interface ThunderOutput {
  address: Uint8Array;
  content: ThunderContent;
}

/** A UTXO — what get_utxos returns and what the utreexo leaf hashes. */
export interface ThunderPointedOutput {
  outPoint: ThunderOutPoint;
  output: ThunderOutput;
}

export interface ThunderTransaction {
  /** Each input pairs the outpoint with the spent UTXO's 32-byte hash. */
  inputs: { outPoint: ThunderOutPoint; utxoHash: Uint8Array }[];
  outputs: ThunderOutput[];
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

function encodeOutPoint(w: BorshWriter, op: ThunderOutPoint): void {
  switch (op.kind) {
    case "regular":
      w.writeU8(0);
      w.writeFixedBytes(op.txid);
      w.writeU32(op.vout);
      break;
    case "coinbase":
      w.writeU8(1);
      w.writeFixedBytes(op.txid);
      w.writeU32(op.vout);
      break;
    case "deposit":
      w.writeU8(2);
      w.writeFixedBytes(op.txid);
      w.writeU32(op.vout);
      break;
    case "unsuccessful-withdrawal":
      w.writeU8(3);
      w.writeFixedBytes(op.m6id);
      w.writeU32(op.height);
      w.writeU32(op.vout);
      break;
  }
}

export function encodeContent(w: BorshWriter, c: ThunderContent): void {
  switch (c.kind) {
    case "value":
      w.writeU8(0);
      w.writeU64(c.sats);
      break;
    case "withdrawal":
      w.writeU8(1);
      w.writeU64(c.sats);
      w.writeU64(c.mainFeeSats);
      w.writeVarBytes(c.mainScriptPubKey);
      break;
  }
}

function encodeOutput(w: BorshWriter, o: ThunderOutput): void {
  w.writeFixedBytes(o.address);
  encodeContent(w, o.content);
}

/** Canonical Borsh encoding — byte-identical to thunder-rust
 * `borsh::to_vec(&transaction)`. This is the FROST-signed message. */
export function transactionBorshBytes(tx: ThunderTransaction): Uint8Array {
  const w = new BorshWriter();
  w.writeU32(tx.inputs.length);
  for (const input of tx.inputs) {
    encodeOutPoint(w, input.outPoint);
    w.writeFixedBytes(input.utxoHash);
  }
  w.writeU32(tx.outputs.length);
  for (const output of tx.outputs) {
    encodeOutput(w, output);
  }
  return w.bytes();
}

/** Canonical Borsh encoding of a PointedOutput (outpoint ‖ output, raw). */
export function pointedOutputBorshBytes(po: ThunderPointedOutput): Uint8Array {
  const w = new BorshWriter();
  encodeOutPoint(w, po.outPoint);
  encodeOutput(w, po.output);
  return w.bytes();
}

/** The transaction id: BLAKE3 of the canonical Borsh bytes (32 bytes). */
export function transactionTxid(tx: ThunderTransaction): Uint8Array {
  return blake3(transactionBorshBytes(tx));
}

/** The utreexo leaf / input hash of a UTXO: BLAKE3(borsh(PointedOutput)). */
export function pointedOutputHash(po: ThunderPointedOutput): Uint8Array {
  return blake3(pointedOutputBorshBytes(po));
}

/**
 * Canonical Borsh size WITHOUT building the encoding — exact because every
 * field is fixed-width. Used to price a fee before the tx exists.
 */
export function transactionBorshSize(
  inputCount: number,
  outputs: ThunderContent[],
): number {
  let contentSize = 0;
  for (const c of outputs) {
    switch (c.kind) {
      case "value":
        contentSize += 1 + 8;
        break;
      case "withdrawal":
        contentSize += 1 + 8 + 8 + 4 + c.mainScriptPubKey.length;
        break;
    }
  }
  return 4 + inputCount * (37 + 32) + 4 + outputs.length * 20 + contentSize;
}

// ---------------------------------------------------------------------------
// Decoding (for get_utxos / history rows over node-RPC Borsh — and for tests)
// ---------------------------------------------------------------------------

function decodeOutPoint(r: BorshReader): ThunderOutPoint {
  const tag = r.readU8();
  switch (tag) {
    case 0:
      return { kind: "regular", txid: r.readFixedBytes(32), vout: r.readU32() };
    case 1:
      return { kind: "coinbase", txid: r.readFixedBytes(32), vout: r.readU32() };
    case 2:
      return { kind: "deposit", txid: r.readFixedBytes(32), vout: r.readU32() };
    case 3:
      return {
        kind: "unsuccessful-withdrawal",
        m6id: r.readFixedBytes(32),
        height: r.readU32(),
        vout: r.readU32(),
      };
    default:
      throw new Error(`decodeOutPoint: unknown tag ${tag}`);
  }
}

export function decodeContent(r: BorshReader): ThunderContent {
  const tag = r.readU8();
  switch (tag) {
    case 0:
      return { kind: "value", sats: r.readU64() };
    case 1:
      return {
        kind: "withdrawal",
        sats: r.readU64(),
        mainFeeSats: r.readU64(),
        mainScriptPubKey: r.readVarBytes(),
      };
    default:
      throw new Error(`decodeContent: unknown tag ${tag}`);
  }
}

export function decodeTransaction(bytes: Uint8Array): ThunderTransaction {
  const r = new BorshReader(bytes);
  const inputCount = r.readU32();
  const inputs: ThunderTransaction["inputs"] = [];
  for (let i = 0; i < inputCount; i++) {
    const outPoint = decodeOutPoint(r);
    const utxoHash = r.readFixedBytes(32);
    inputs.push({ outPoint, utxoHash });
  }
  const outputCount = r.readU32();
  const outputs: ThunderOutput[] = [];
  for (let i = 0; i < outputCount; i++) {
    const address = r.readFixedBytes(20);
    const content = decodeContent(r);
    outputs.push({ address, content });
  }
  return { inputs, outputs };
}

export function decodePointedOutput(bytes: Uint8Array): ThunderPointedOutput {
  const r = new BorshReader(bytes);
  const outPoint = decodeOutPoint(r);
  const address = r.readFixedBytes(20);
  const content = decodeContent(r);
  return { outPoint, output: { address, content } };
}

/** The value an output moves, in sats. A withdrawal removes BOTH the payout
 * and the mainchain fee from the sidechain (thunder-rust GetValue impl). */
export function contentValueSats(c: ThunderContent): bigint {
  return c.kind === "value" ? c.sats : c.sats + c.mainFeeSats;
}
