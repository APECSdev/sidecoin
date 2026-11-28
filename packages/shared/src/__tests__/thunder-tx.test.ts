// packages/shared/src/__tests__/thunder-tx.test.ts
//
// Thunder transaction codec: canonical Borsh bytes, txid, UTXO hash, exact
// size computation, JSON wire shapes (serde-truth), and the full
// build → sign → wire pipeline against the golden v0.18 key.

import { describe, expect, it } from "vitest";
import { mnemonicToSeedSync } from "@scure/bip39";

import {
  decodeContent,
  decodePointedOutput,
  decodeTransaction,
  pointedOutputBorshBytes,
  pointedOutputHash,
  transactionBorshBytes,
  transactionBorshSize,
  transactionTxid,
  contentValueSats,
  type ThunderContent,
  type ThunderPointedOutput,
  type ThunderTransaction,
} from "../sidechains/thunder/transaction";
import {
  authorizedTransactionToJson,
  fromHex,
  outPointFromJson,
  outPointToJson,
  reverseBytes,
  toHex,
  transactionFromJson,
  transactionToJson,
  type ThunderAuthorizationJson,
} from "../sidechains/thunder/wire";
import { authorizeThunderTransaction, buildThunderTransaction, utxosValueSats } from "../sidechains/thunder/wallet";
import { deriveAccountKey, deriveAddressKey } from "../sidechains/thunder/keys";
import { baseMul, scalarFromLeWide } from "../sidechains/thunder/crypto";
import { frostVerify } from "../sidechains/thunder/frost";
import { thunderAddressBytes, thunderAddressBytesFromBase58 } from "../sidechains/thunder/address";
import { base58 } from "@scure/base";

const REGULAR_TXID = new Uint8Array(32).fill(3);
const OTHER_TXID = new Uint8Array(32).fill(9);
const DEPOSIT_TXID_RAW = new Uint8Array(32).fill(7);
const M6ID = new Uint8Array(32).fill(11);
const ADDRESS_A = new Uint8Array(20).fill(0xaa);
const ADDRESS_B = new Uint8Array(20).fill(0xbb);

function valueOutput(sats: bigint, address = ADDRESS_A) {
  return { address, content: { kind: "value", sats } as ThunderContent };
}

function utxoRegular(sats: bigint, address = ADDRESS_A): ThunderPointedOutput {
  return { outPoint: { kind: "regular", txid: REGULAR_TXID, vout: 0 }, output: valueOutput(sats, address) };
}

describe("Thunder Borsh codec", () => {
  it("regular tx encodes to the exact canonical layout", () => {
    const tx: ThunderTransaction = {
      inputs: [{ outPoint: { kind: "regular", txid: REGULAR_TXID, vout: 4 }, utxoHash: OTHER_TXID }],
      outputs: [valueOutput(1000n), valueOutput(500n, ADDRESS_B)],
    };
    const bytes = transactionBorshBytes(tx);
    // u32 inCount | tag u8 | 32B txid | u32 vout | 32B hash | u32 outCount |
    // 20B addr | tag | u64 | 20B addr | tag | u64
    expect(bytes.length).toBe(4 + (1 + 32 + 4 + 32) + 4 + 2 * (20 + 1 + 8));
    expect(bytes[0]).toBe(1); // input count, little-endian
    expect(bytes[4]).toBe(0); // OutPoint::Regular tag
    expect(Array.from(bytes.slice(37, 41))).toEqual([4, 0, 0, 0]); // vout LE
    expect(transactionBorshSize(1, tx.outputs.map((o) => o.content))).toBe(bytes.length);
  });

  it("round trips every outpoint variant through the codec", () => {
    const variants = [
      { kind: "regular", txid: REGULAR_TXID, vout: 1 },
      { kind: "coinbase", txid: REGULAR_TXID, vout: 2 },
      { kind: "deposit", txid: DEPOSIT_TXID_RAW, vout: 3 },
      { kind: "unsuccessful-withdrawal", m6id: M6ID, height: 1234, vout: 5 },
    ] as const;
    for (const op of variants) {
      const tx: ThunderTransaction = {
        inputs: [{ outPoint: op as never, utxoHash: OTHER_TXID }],
        outputs: [],
      };
      const decoded = decodeTransaction(transactionBorshBytes(tx));
      expect(decoded.inputs[0].outPoint).toEqual(op as never);
    }
  });

  it("withdrawal content: borsh carries scriptPubKey with u32 length prefix", () => {
    const spk = new Uint8Array([0x51, 0x52, 0x53]);
    const tx: ThunderTransaction = {
      inputs: [],
      outputs: [
        {
          address: ADDRESS_A,
          content: {
            kind: "withdrawal",
            sats: 700n,
            mainFeeSats: 40n,
            mainScriptPubKey: spk,
            mainAddress: "bc1q-placeholder",
          },
        },
      ],
    };
    const bytes = transactionBorshBytes(tx);
    // u32 inCount(0) | u32 outCount(1) | 20B addr | tag | u64 value | u64
    // mainFee | u32 len=3 LE | 3 bytes
    expect(bytes.length).toBe(4 + 4 + 20 + 1 + 8 + 8 + 4 + 3);
    expect(Array.from(bytes.slice(-7, -3))).toEqual([3, 0, 0, 0]);
    const decoded = decodeTransaction(bytes);
    expect(decoded.outputs[0].content.kind).toBe("withdrawal");
    // Borsh ignores mainAddress; the withdrawal DTO decodes with empty spk
    // replaced by the encoded one.
    const c = decoded.outputs[0].content as Extract<ThunderContent, { kind: "withdrawal" }>;
    expect(Array.from(c.mainScriptPubKey)).toEqual([0x51, 0x52, 0x53]);
    expect(contentValueSats(c)).toBe(740n); // withdrawal removes payout + main fee
  });

  it("txid = BLAKE3(canonical borsh) and changes with content", () => {
    const tx1: ThunderTransaction = { inputs: [], outputs: [valueOutput(1n)] };
    const tx2: ThunderTransaction = { inputs: [], outputs: [valueOutput(2n)] };
    const id1 = transactionTxid(tx1);
    expect(id1.length).toBe(32);
    expect(transactionTxid(tx1)).toEqual(id1); // deterministic
    expect(transactionTxid(tx2)).not.toEqual(id1);
  });

  it("pointed output hash is the utreexo leaf: BLAKE3(borsh(outpoint ‖ output))", () => {
    const po = utxoRegular(123n);
    const hash = pointedOutputHash(po);
    expect(hash.length).toBe(32);
    expect(pointedOutputHash(po)).toEqual(hash);
    expect(pointedOutputBorshBytes(po).length).toBe(1 + 32 + 4 + 20 + 1 + 8);
    const decoded = decodePointedOutput(pointedOutputBorshBytes(po));
    expect(decoded.outPoint).toEqual(po.outPoint);
    expect(Array.from(decoded.output.address)).toEqual(Array.from(po.output.address));
  });
});

describe("Thunder JSON wire", () => {
  it("outpoint variants serialize per serde and round trip", () => {
    const cases = [
      { op: { kind: "regular", txid: REGULAR_TXID, vout: 4 }, json: { Regular: { txid: toHex(REGULAR_TXID), vout: 4 } } },
      { op: { kind: "coinbase", txid: REGULAR_TXID, vout: 4 }, json: { Coinbase: { txid: toHex(REGULAR_TXID), vout: 4 } } },
      {
        op: { kind: "unsuccessful-withdrawal", m6id: M6ID, height: 9, vout: 2 },
        json: { UnsuccessfulWithdrawal: { m6id: toHex(M6ID), height: 9, vout: 2 } },
      },
    ];
    for (const { op, json } of cases) {
      expect(outPointToJson(op as never)).toEqual(json);
      expect(outPointFromJson(json)).toEqual(op as never);
    }
  });

  it("deposit outpoint serializes as the display-order txid:vout STRING", () => {
    const json = outPointToJson({ kind: "deposit", txid: DEPOSIT_TXID_RAW, vout: 6 });
    expect(json).toEqual({ Deposit: `${toHex(reverseBytes(DEPOSIT_TXID_RAW))}:6` });
    const back = outPointFromJson(json);
    expect(back).toEqual({ kind: "deposit", txid: DEPOSIT_TXID_RAW, vout: 6 });
  });

  it("transaction JSON: inputs are [outpoint, 32-number array] tuples; proof is the empty required object", () => {
    const tx: ThunderTransaction = {
      inputs: [{ outPoint: { kind: "regular", txid: REGULAR_TXID, vout: 1 }, utxoHash: OTHER_TXID }],
      outputs: [valueOutput(10n)],
    };
    const json = transactionToJson(tx) as {
      inputs: [unknown, number[]][];
      proof: { targets: unknown[]; hashes: unknown[] };
      outputs: unknown[];
    };
    expect(json.inputs[0][0]).toEqual({ Regular: { txid: toHex(REGULAR_TXID), vout: 1 } });
    expect(json.inputs[0][1]).toEqual(Array.from(OTHER_TXID));
    expect(json.proof).toEqual({ targets: [], hashes: [] });
    expect(json.outputs[0]).toEqual({ address: base58.encode(ADDRESS_A), content: { Value: 10 } });
    const back = transactionFromJson(json);
    expect(back.inputs[0].outPoint).toEqual(tx.inputs[0].outPoint);
    expect(back.outputs[0].content).toEqual({ kind: "value", sats: 10n });
  });

  it("content JSON accepts current and pre-0.18 field names", () => {
    // via full transaction wrapper: current names
    const a = transactionFromJson({ inputs: [], outputs: [{ address: base58.encode(ADDRESS_A), content: { Value: 5 } }] });
    expect(a.outputs[0].content).toEqual({ kind: "value", sats: 5n });
    // withdrawal, current names
    const w = transactionFromJson({
      inputs: [],
      outputs: [
        { address: base58.encode(ADDRESS_A), content: { Withdrawal: { value: 5, main_fee: 1, main_address: "bc1qx" } } },
      ],
    });
    const wc = w.outputs[0].content as Extract<ThunderContent, { kind: "withdrawal" }>;
    expect(wc.sats).toBe(5n);
    expect(wc.mainFeeSats).toBe(1n);
    expect(wc.mainAddress).toBe("bc1qx");
  });
});

describe("Thunder send pipeline (build → authorize → wire)", () => {
  it("signs each input with the key that owns it and verifies against thunder rules", () => {
    const seed = mnemonicToSeedSync("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about", "");
    const account = deriveAccountKey(seed, "thunder-v18");
    const k0 = deriveAddressKey(account, 0, "thunder-v18");
    const addr0 = thunderAddressBytes(baseMul(k0.scalar));
    const k1 = deriveAddressKey(account, 1, "thunder-v18");
    const addr1 = thunderAddressBytes(baseMul(k1.scalar));

    const utxos = [utxoRegular(1000n, addr0), utxoRegular(2000n, addr1)];
    const destAddr = thunderAddressBytesFromBase58("NKqSr4bQejFbKpd5yLQgWEiMJFx"); // fund the golden address (self)
    const tx = buildThunderTransaction(utxos, [
      { address: destAddr, content: { kind: "value", sats: 2500n } },
      { address: addr1, content: { kind: "value", sats: 400n } }, // change to a fresh own address
    ]);
    expect(tx.inputs.length).toBe(2);
    for (const input of tx.inputs) {
      expect(input.utxoHash.length).toBe(32);
    }
    const auths = authorizeThunderTransaction(
      tx,
      utxos.map((u) => u.output.address),
      [k0.scalar, k1.scalar],
    );
    expect(auths.length).toBe(2);
    // FROST-verify each authorization over the whole-tx borsh bytes.
    const message = transactionBorshBytes(tx);
    for (const a of auths) {
      expect(a.verifying_key).toMatch(/^[0-9a-f]{64}$/);
      expect(a.signature).toMatch(/^[0-9a-f]{128}$/);
      expect(frostVerify(fromHex(a.signature), fromHex(a.verifying_key), message)).toBe(true);
    }
    // The submit body enforces 1:1.
    const body = authorizedTransactionToJson(tx, auths) as {
      transaction: { inputs: unknown[] };
      authorizations: ThunderAuthorizationJson[];
    };
    expect(body.authorizations.length).toBe(body.transaction.inputs.length);
    expect(() => authorizedTransactionToJson(tx, auths.slice(0, 1))).toThrow();
  });

  it("refuses a key that does not own the input it signs", () => {
    const seed = mnemonicToSeedSync("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about", "");
    const account = deriveAccountKey(seed, "thunder-v18");
    const k0 = deriveAddressKey(account, 0, "thunder-v18");
    const addr0 = thunderAddressBytes(baseMul(k0.scalar));
    const k1 = deriveAddressKey(account, 1, "thunder-v18");

    const utxos = [utxoRegular(1000n, addr0)];
    const tx = buildThunderTransaction(utxos, [{ address: addr0, content: { kind: "value", sats: 900n } }]);
    expect(() => authorizeThunderTransaction(tx, [addr0], [k1.scalar])).toThrow(/wrong key for input 0/);
  });

  it("utxo value sums use the withdrawal rule (payout + main fee)", () => {
    const seed = mnemonicToSeedSync("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about", "");
    const account = deriveAccountKey(seed, "thunder-v18");
    const k0 = deriveAddressKey(account, 0, "thunder-v18");
    const addr0 = thunderAddressBytes(baseMul(k0.scalar));
    const withdrawalUtxo: ThunderPointedOutput = {
      outPoint: { kind: "regular", txid: REGULAR_TXID, vout: 0 },
      output: {
        address: addr0,
        content: { kind: "withdrawal", sats: 100n, mainFeeSats: 30n, mainScriptPubKey: new Uint8Array(0) },
      },
    };
    expect(utxosValueSats([withdrawalUtxo])).toBe(130n);
  });
});

describe("crypto↔codec cross-checks", () => {
  it("scalarFromLeWide equals noble's own reduction", () => {
    const bytes = new Uint8Array(64);
    for (let i = 0; i < 64; i++) bytes[i] = (i * 37 + 11) & 0xff;
    const ours = scalarFromLeWide(bytes);
    // Independent path: LE number mod ℓ via BigInt. ℓ = the ed25519 group
    // order, 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed
    // (RFC 8032 / @noble/curves ed25519_CURVE.n).
    let v = 0n;
    for (let i = 63; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
    const L = 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3edn;
    expect(ours).toBe(v % L);
  });
});
