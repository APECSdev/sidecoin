// packages/shared/src/tx/deposit.ts
//
// BIP-300 M5 DEPOSIT transaction BUILDER + SIGNER — 100% client-side.
//
// A deposit is an L1 transaction paying into a sidechain's treasury, so it
// broadcasts through the SAME public Esplora endpoint the wallet already
// uses for L1 sends — no backend integration required. The wire format
// below is verified against BOTH the enforcer's own implementation
// (bip300301_enforcer lib/wallet/mod.rs create_deposit_psbt) AND real
// signet deposit transactions fetched live from
// esplora.signet.drivechain.info (txids recorded in the test suite):
//
//   inputs    : the depositor's own P2WPKH UTXOs (sequence 0xfffffffd, RBF)
//               + the sidechain's CURRENT treasury UTXO (CTIP), which is
//               keyless: empty scriptSig, empty (0-item) witness, sequence
//               0xffffffff. Spending the CTIP is what the live chain
//               observes; the enforcer's aggregated form (no CTIP input)
//               exists upstream but is NOT what live txs do.
//   outputs   : [0] treasury script `OP_DRIVECHAIN OP_PUSHBYTES_1 <S>
//               OP_TRUE` (4 bytes) with value = current CTIP value +
//               deposit amount. MUST come directly before the OP_RETURN
//               (enforcer: "the M5 OP_DRIVECHAIN output must come directly
//               before the OP_RETURN sidechain address output").
//               [1] OP_RETURN containing the BARE L2 receive address as
//               ASCII bytes (live-verified: the bytes are exactly the
//               address SupaQt indexes, e.g. "2QQkc3D71Tw7zx9vLhADj2wNkvhC").
//               [2] optional change back to the depositor's P2WPKH.
//   nVersion  : 2 (live-verified).
//   nLockTime : 0 on Bitcoin-fork networks (signet). eCash-fork networks
//               (mainnet/betanet) apply replay protection:
//               replay_protection_lock_time = 499_999_998, and their
//               OP_DRIVECHAIN is OP_NOP8 (0xb7) instead of OP_NOP5 (0xb4)
//               — both verified in enforcer lib/types.rs.
//
// RACE WINDOW (inherent to the CTIP-spending form): the treasury value in
// output 0 must equal the chain's CURRENT CTIP value at confirmation time.
// If another deposit advances the CTIP between our GetCtip fetch and the
// confirmation, the transaction is consensus-invalid. The caller should
// fetch the CTIP immediately before building and re-fetch on rejection.
//
// SECURITY: identical to the P2WPKH builder — signing happens in-process
// with the raw SigningKey; only signed hex leaves the device. The CTIP
// input needs NO signature (keyless), so its outpoint is the only thing
// embedded. ECDSA nonces are RFC-6979 deterministic.
//
// !!  WIRE-CORRECTNESS GATE: the sighash implementation is pinned to the
//     OFFICIAL BIP-143 "Native P2WPKH" test vector, and the transaction
//     structure is pinned to live deposit txs. The produced hex must
//     still be validated by the node (testmempoolaccept / broadcast
//     acceptance) before the deposit flow is trusted end-to-end.

import { sha256 } from "@noble/hashes/sha256";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1.js";

import type { NetworkId } from "../types/network";
import type { Utxo } from "../types/transaction";
import type { SigningKey } from "../wallet/signing";
import { DUST_LIMIT_SATS } from "./fee";

/** RBF-signaling sequence (BIP-125) — matches the live deposit txs' funding inputs. */
const SEQUENCE_RBF = 0xfffffffd;

/** Final sequence — matches the live deposit txs' keyless treasury input. */
const SEQUENCE_FINAL = 0xffffffff;

/** SIGHASH_ALL — the only sighash flag this builder emits. */
const SIGHASH_ALL = 0x01;

/** OP_RETURN opcode (0x6a). */
const OP_RETURN = 0x6a;

/** OP_TRUE (0x51) — the treasury script's terminator. */
const OP_TRUE = 0x51;

/** OP_PUSHBYTES_1 (0x01) — the single-byte push preceding the slot number. */
const OP_PUSHBYTES_1 = 0x01;

// ---------------------------------------------------------------------------
// Per-network deposit parameters (enforcer lib/types.rs NetworkParams)
// ---------------------------------------------------------------------------

export interface DepositNetworkParams {
  /** OP_DRIVECHAIN opcode for the network's treasury scripts. */
  readonly opDrivechainOpcode: number;

  /**
   * Replay-protection nLockTime, or null when the network applies none
   * (Bitcoin-fork builds). eCash-fork networks use 499999998.
   */
  readonly lockTime: number | null;
}

/**
 * Deposit network parameters.
 *
 *   signet / l2l-signet — Bitcoin-fork build: OP_NOP5 (0xb4), no replay
 *   protection (live signet deposit txs carry nLockTime 0 and 0xb4 — both
 *   verified).
 *
 *   mainnet / betanet — eCash-fork build: OP_NOP8 (0xb7) + nLockTime
 *   499999998 (enforcer lib/types.rs lines 209-216: `params.op_drivechain =
 *   OpDrivechain::NOP8; params.replay_protection_lock_time =
 *   Some(499_999_998)`).
 *
 * testnet / regtest are intentionally rejected — their fork/op conventions
 * are not verified for this builder.
 */
export function getDepositNetworkParams(network: NetworkId): DepositNetworkParams {
  switch (network) {
    case "signet":
    case "l2l-signet":
      return { opDrivechainOpcode: 0xb4, lockTime: null };
    case "mainnet":
    case "betanet":
      return { opDrivechainOpcode: 0xb7, lockTime: 499999998 };
    default:
      throw new Error(
        `Deposit building is not supported on network "${network}".`,
      );
  }
}

/**
 * Build the 4-byte treasury (CTIP) scriptPubKey:
 * `OP_DRIVECHAIN OP_PUSHBYTES_1 <slot> OP_TRUE`.
 */
export function treasuryScript(params: DepositNetworkParams, sidechainSlot: number): Uint8Array {
  return Uint8Array.of(
    params.opDrivechainOpcode,
    OP_PUSHBYTES_1,
    sidechainSlot,
    OP_TRUE,
  );
}

/** The sidechain's current treasury UTXO, as served by the enforcer GetCtip. */
export interface Ctip {
  /** Display-order (big-endian hex) txid of the treasury outpoint. */
  readonly txid: string;
  /** Output index of the treasury outpoint (0 in every observed CTIP). */
  readonly vout: number;
  /** Treasury value in satoshis. */
  readonly valueSats: bigint;
}

/** Parameters for building + signing an M5 deposit transaction. */
export interface BuildDepositTxParams {
  /** Network whose deposit conventions apply (see getDepositNetworkParams). */
  readonly network: NetworkId;

  /** BIP-300 slot of the destination sidechain (e.g. 9 = Thunder). */
  readonly sidechainSlot: number;

  /** The sidechain's current treasury UTXO (enforcer GetCtip). */
  readonly ctip: Ctip;

  /** The BARE L2 receive address — its ASCII bytes go into the OP_RETURN. */
  readonly l2Address: string;

  /** Deposit amount in satoshis (added on top of the treasury value). */
  readonly depositSatoshis: bigint;

  /** Absolute fee in satoshis, paid from the depositor's inputs. */
  readonly feeSatoshis: bigint;

  /** The depositor's own P2WPKH UTXOs funding the deposit (NOT the CTIP). */
  readonly selectedUtxos: readonly Utxo[];

  /** scriptPubKey to send change to (typically SigningKey.scriptPubKey). */
  readonly changeScriptPubKey: Uint8Array;

  /** Signing keys controlling the funding UTXOs; matched by scriptPubKey. */
  readonly signingKeys: readonly SigningKey[];
}

/** A fully-signed deposit transaction plus the accounting for UI + records. */
export interface SignedDepositTransaction {
  /** Raw signed transaction hex, ready for broadcastTransaction(). */
  readonly hex: string;

  /** Display-order txid of the signed deposit transaction. */
  readonly txid: string;

  /** Virtual size of the finalized transaction, in vbytes. */
  readonly vsize: number;

  /** Absolute fee actually paid (= user inputs − deposit − change). */
  readonly feeSatoshis: bigint;

  /** Change output value (0 when folded into the fee). */
  readonly changeSatoshis: bigint;

  /** Total input value (treasury + user inputs), in satoshis. */
  readonly totalInputSatoshis: bigint;

  /** Treasury output value (= CTIP value + deposit). */
  readonly treasuryOutputSatoshis: bigint;

  /** Whether a change output was created. */
  readonly hasChange: boolean;
}

// ---------------------------------------------------------------------------
// Byte-level serialization helpers (little-endian wire order)
// ---------------------------------------------------------------------------

class ByteWriter {
  private chunks: number[] = [];

  u8(v: number): void {
    this.chunks.push(v & 0xff);
  }

  u32le(v: number): void {
    this.chunks.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }

  u64le(v: bigint): void {
    let x = v;
    for (let i = 0; i < 8; i++) {
      this.chunks.push(Number(x & 0xffn));
      x >>= 8n;
    }
  }

  bytes(b: Uint8Array): void {
    for (const byte of b) this.chunks.push(byte);
  }

  /** Bitcoin compact size encoding of `n`. */
  compactSize(n: number): void {
    if (n < 0xfd) {
      this.u8(n);
    } else if (n <= 0xffff) {
      this.u8(0xfd);
      this.u8(n & 0xff);
      this.u8((n >>> 8) & 0xff);
    } else if (n <= 0xffffffff) {
      this.u8(0xfe);
      this.u32le(n);
    } else {
      this.u8(0xff);
      this.u64le(BigInt(n));
    }
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }

  get length(): number {
    return this.chunks.length;
  }
}

// compactSizeLengthBytes() is available from ./fee (same barrel).

/** Reverse a hex string's byte order (display order ⇄ internal order). */
function reverseHex(hex: string): string {
  if (hex.length % 2 !== 0) {
    throw new Error(`Cannot reverse odd-length hex string of length ${hex.length}.`);
  }
  const bytes = hexToBytes(hex);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[bytes.length - 1 - i];
  }
  return bytesToHex(out);
}

function doubleSha256(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

// ---------------------------------------------------------------------------
// Output serialization
// ---------------------------------------------------------------------------

interface SerializedOutput {
  readonly valueSats: bigint;
  readonly script: Uint8Array;
}

function serializeOutput(out: SerializedOutput): Uint8Array {
  const w = new ByteWriter();
  w.u64le(out.valueSats);
  w.compactSize(out.script.length);
  w.bytes(out.script);
  return w.toUint8Array();
}

// ---------------------------------------------------------------------------
// BIP-143 sighash (native P2WPKH)
// ---------------------------------------------------------------------------

/**
 * BIP-143 signature hash (SIGHASH_ALL) for a native P2WPKH input.
 *
 * The parameters mirror the BIP-143 "Native P2WPKH" specification exactly;
 * the function is pinned to the OFFICIAL BIP-143 vector in the test suite
 * (sigHash c37af31116d1b27caf68aae9e3ac82f1477929014d5b917657d0eb49478cb670).
 */
export function bip143Sighash(params: {
  readonly txVersion: number;
  readonly outpoints: readonly { readonly txidInternal: Uint8Array; readonly vout: number }[];
  readonly sequences: readonly number[];
  readonly inputIndex: number;
  readonly inputScriptCode: Uint8Array;
  readonly inputValueSats: bigint;
  readonly outputs: readonly SerializedOutput[];
  readonly lockTime: number;
}): Uint8Array {
  const {
    txVersion,
    outpoints,
    sequences,
    inputIndex,
    inputScriptCode,
    inputValueSats,
    outputs,
    lockTime,
  } = params;

  // hashPrevouts — all outpoints in internal (little-endian) order.
  const prevouts = new ByteWriter();
  for (const op of outpoints) {
    prevouts.bytes(op.txidInternal);
    prevouts.u32le(op.vout);
  }
  const hashPrevouts = doubleSha256(prevouts.toUint8Array());

  // hashSequence — all sequences in input order.
  const seqs = new ByteWriter();
  for (const seq of sequences) seqs.u32le(seq);
  const hashSequence = doubleSha256(seqs.toUint8Array());

  // hashOutputs — every output serialized (SIGHASH_ALL).
  const outs = new ByteWriter();
  for (const out of outputs) outs.bytes(serializeOutput(out));
  const hashOutputs = doubleSha256(outs.toUint8Array());

  // Preimage: nVersion || hashPrevouts || hashSequence || outpoint ||
  // scriptCode || amount || nSequence || hashOutputs || nLockTime || nHashType
  // NOTE: the scriptCode is written RAW — for native P2WPKH it already
  // begins with its own 0x19 length byte (0x19 76 a9 14 <20> 88 ac = 25
  // bytes). No extra varint is added (matches the BIP-143 preimage exactly).
  const pre = new ByteWriter();
  pre.u32le(txVersion);
  pre.bytes(hashPrevouts);
  pre.bytes(hashSequence);
  pre.bytes(outpoints[inputIndex].txidInternal);
  pre.u32le(outpoints[inputIndex].vout);
  pre.bytes(inputScriptCode);
  pre.u64le(inputValueSats);
  pre.u32le(sequences[inputIndex]);
  pre.bytes(hashOutputs);
  pre.u32le(lockTime);
  pre.u32le(SIGHASH_ALL);

  return doubleSha256(pre.toUint8Array());
}

/** P2WPKH scriptCode for BIP-143: `0x19 76 a9 14 <20-byte hash> 88 ac`. */
function p2wpkhScriptCode(scriptPubKey: Uint8Array): Uint8Array {
  // scriptPubKey is OP_0 <0x14> <20-byte program> (22 bytes).
  if (scriptPubKey.length !== 22 || scriptPubKey[0] !== 0x00 || scriptPubKey[1] !== 0x14) {
    throw new Error("Deposit funding inputs must be P2WPKH (22-byte OP_0 push scripts).");
  }
  return Uint8Array.of(0x19, 0x76, 0xa9, 0x14, ...scriptPubKey.subarray(2), 0x88, 0xac);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build and sign an M5 deposit transaction, 100% client-side.
 *
 * Inputs are ordered: [user funding UTXOs (RBF sequence), treasury CTIP
 * (final sequence, keyless)]. Outputs are ordered: [treasury, OP_RETURN
 * address, optional change] — the enforcer requires the treasury output
 * directly before the OP_RETURN.
 *
 * @throws On validation failure (insufficient funds, bad slot/address,
 *         UTXO with no matching key, unsupported network).
 */
export function buildAndSignDepositTransaction(
  params: BuildDepositTxParams,
): SignedDepositTransaction {
  const {
    network,
    sidechainSlot,
    ctip,
    l2Address,
    depositSatoshis,
    feeSatoshis,
    selectedUtxos,
    changeScriptPubKey,
    signingKeys,
  } = params;

  // ----- validation -------------------------------------------------------
  const netParams = getDepositNetworkParams(network);

  if (!Number.isInteger(sidechainSlot) || sidechainSlot < 0 || sidechainSlot > 255) {
    throw new Error(`Sidechain slot must be an integer 0-255, got ${sidechainSlot}.`);
  }
  if (!l2Address) {
    throw new Error("Deposit requires a non-empty L2 address for the OP_RETURN.");
  }
  const l2AddressBytes = new TextEncoder().encode(l2Address);
  if (l2AddressBytes.length > 75) {
    throw new Error(
      `L2 address is ${l2AddressBytes.length} bytes; single-push OP_RETURN supports at most 75.`,
    );
  }
  if (depositSatoshis <= 0n) {
    throw new Error(`Deposit amount must be positive, got ${depositSatoshis}.`);
  }
  if (feeSatoshis < 0n) {
    throw new Error(`Fee must be non-negative, got ${feeSatoshis}.`);
  }
  if (ctip.valueSats <= 0n) {
    throw new Error("The sidechain CTIP value must be positive.");
  }
  if (selectedUtxos.length === 0) {
    throw new Error("Cannot fund a deposit with no inputs.");
  }
  if (signingKeys.length === 0) {
    throw new Error("Cannot sign a deposit with no signing keys.");
  }

  const keyByScript = new Map<string, SigningKey>();
  for (const key of signingKeys) {
    keyByScript.set(bytesToHex(key.scriptPubKey), key);
  }

  let userTotalSatoshis = 0n;
  for (const utxo of selectedUtxos) {
    userTotalSatoshis += utxo.amountSatoshis;
  }

  // The depositor funds: deposit amount + fee. Change = remainder.
  const required = depositSatoshis + feeSatoshis;
  if (userTotalSatoshis < required) {
    throw new Error(
      `Insufficient funds: user inputs total ${userTotalSatoshis} but need ` +
        `${required} (deposit ${depositSatoshis} + fee ${feeSatoshis}).`,
    );
  }

  let changeSatoshis = userTotalSatoshis - depositSatoshis - feeSatoshis;
  let effectiveFee = feeSatoshis;
  let hasChange = false;
  // Sub-dust change is folded into the fee (standard wallet behavior —
  // mirrors buildAndSignP2wpkhTransaction).
  if (changeSatoshis > 0n && changeSatoshis <= DUST_LIMIT_SATS) {
    effectiveFee = feeSatoshis + changeSatoshis;
    changeSatoshis = 0n;
  }
  if (changeSatoshis > 0n) {
    hasChange = true;
  }

  const treasuryOutputSatoshis = ctip.valueSats + depositSatoshis;

  // ----- assemble structure ------------------------------------------------
  const treasuryScriptBytes = treasuryScript(netParams, sidechainSlot);
  const opReturnScript = Uint8Array.of(
    OP_RETURN,
    l2AddressBytes.length,
    ...l2AddressBytes,
  );

  const outputs: SerializedOutput[] = [
    { valueSats: treasuryOutputSatoshis, script: treasuryScriptBytes },
    { valueSats: 0n, script: opReturnScript },
  ];
  if (hasChange) {
    outputs.push({ valueSats: changeSatoshis, script: changeScriptPubKey });
  }

  // Inputs in internal wire order. Display-order txids are reversed here —
  // the wire format carries outpoint txids little-endian (internal) while
  // callers and explorers use display order.
  interface WireInput {
    readonly txidInternal: Uint8Array;
    readonly vout: number;
    readonly sequence: number;
  }
  const inputs: WireInput[] = [];
  for (const utxo of selectedUtxos) {
    inputs.push({
      txidInternal: hexToBytes(reverseHex(utxo.txid)),
      vout: utxo.vout,
      sequence: SEQUENCE_RBF,
    });
  }
  inputs.push({
    txidInternal: hexToBytes(reverseHex(ctip.txid)),
    vout: ctip.vout,
    sequence: SEQUENCE_FINAL,
  });

  const lockTime = netParams.lockTime ?? 0;

  // ----- sign each funding input (BIP-143, RFC-6979 deterministic) ---------
  const witnesses: Uint8Array[][] = inputs.map(() => []);
  const scriptCodeByIndex: (Uint8Array | null)[] = inputs.map(() => null);
  const amountByIndex: bigint[] = inputs.map(() => 0n);

  for (let i = 0; i < selectedUtxos.length; i++) {
    const utxo = selectedUtxos[i];
    const scriptHex = utxo.scriptPubKey.toLowerCase();
    const key = keyByScript.get(scriptHex);
    if (!key) {
      throw new Error(
        `No signing key for UTXO ${utxo.txid}:${utxo.vout} (scriptPubKey ${scriptHex}).`,
      );
    }

    const scriptCode = p2wpkhScriptCode(hexToBytes(scriptHex));
    scriptCodeByIndex[i] = scriptCode;
    amountByIndex[i] = utxo.amountSatoshis;

    const sighash = bip143Sighash({
      txVersion: 2,
      outpoints: inputs,
      sequences: inputs.map((inp) => inp.sequence),
      inputIndex: i,
      inputScriptCode: scriptCode,
      inputValueSats: utxo.amountSatoshis,
      outputs,
      lockTime,
    });

    // RFC-6979 deterministic ECDSA, DER-encoded (noble encodes per `format`),
    // SIGHASH_ALL appended.
    const der = secp256k1.sign(sighash, key.privateKey, { prehash: false, format: "der" });
    witnesses[i] = [
      Uint8Array.of(...der, SIGHASH_ALL),
      key.publicKey,
    ];
  }

  // ----- serialize ---------------------------------------------------------
  // Base serialization (no marker/flag/witness) — feeds the txid.
  const base = new ByteWriter();
  base.u32le(2);
  base.compactSize(inputs.length);
  for (const inp of inputs) {
    base.bytes(inp.txidInternal);
    base.u32le(inp.vout);
    base.compactSize(0); // empty scriptSig on every input (live-verified)
    base.u32le(inp.sequence);
  }
  base.compactSize(outputs.length);
  for (const out of outputs) base.bytes(serializeOutput(out));
  base.u32le(lockTime);
  const baseBytes = base.toUint8Array();

  // Full serialization: marker + flag + witness section + locktime.
  // BIP-144: the witness section carries ONE STACK PER INPUT in input order —
  // there is no leading stack count. An empty stack (the keyless treasury
  // input) serializes as a single 0x00.
  const full = new ByteWriter();
  full.bytes(baseBytes.subarray(0, 4)); // nVersion
  full.u8(0x00); // marker
  full.u8(0x01); // flag
  full.bytes(baseBytes.subarray(4, baseBytes.length - 4)); // inputs + outputs
  for (const witness of witnesses) {
    full.compactSize(witness.length);
    for (const item of witness) {
      full.compactSize(item.length);
      full.bytes(item);
    }
  }
  full.u32le(lockTime);
  const fullBytes = full.toUint8Array();

  // Weight: baseSize*4 + witness/marker/flag overhead.
  const witnessBytes = fullBytes.length - 4 - (baseBytes.length - 4) - 4; // marker+flag+witness
  const weight = baseBytes.length * 4 + witnessBytes;
  const vsize = Math.ceil(weight / 4);

  // txid = double SHA-256 of the base serialization, displayed byte-reversed.
  const txid = reverseHex(bytesToHex(doubleSha256(baseBytes)));

  return {
    hex: bytesToHex(fullBytes),
    txid,
    vsize,
    feeSatoshis: effectiveFee,
    changeSatoshis,
    totalInputSatoshis: ctip.valueSats + userTotalSatoshis,
    treasuryOutputSatoshis,
    hasChange,
  };
}

// ---------------------------------------------------------------------------
// Fee estimation
// ---------------------------------------------------------------------------

/** Weight units of a keyless treasury input (41 base bytes + 1 witness byte + marker/flag). */
const TREASURY_INPUT_WU = 41 * 4 + 1 + 2;

/**
 * Estimate the vsize of an M5 deposit transaction before building it.
 *
 * Breakdown (weight units):
 *   overhead (nVersion + counts + nLockTime + marker/flag) ≈ 42 WU
 *   per funding P2WPKH input                               ≈ 272 WU (68 vB)
 *   treasury keyless input                                 = 167 WU
 *   treasury output (8 + 1 + 4 script bytes)               = 52 WU (13 vB)
 *   OP_RETURN output (8 + 1 + (1 + 1 + addrLen))           = 40 + 4*addrLen WU
 *   change P2WPKH output                                   = 124 WU (31 vB)
 */
export function estimateDepositVsize(params: {
  readonly numUserInputs: number;
  readonly l2Address: string;
  readonly hasChange: boolean;
}): number {
  const addrLen = new TextEncoder().encode(params.l2Address).length;
  const wu =
    42 +
    params.numUserInputs * 272 +
    TREASURY_INPUT_WU +
    (8 + 1 + 4) * 4 + // treasury output: 8-byte value + 1-byte len + 4-byte script
    (8 + 1 + (1 + 1 + addrLen)) * 4 + // OP_RETURN output
    (params.hasChange ? 124 : 0);
  return Math.ceil(wu / 4);
}
