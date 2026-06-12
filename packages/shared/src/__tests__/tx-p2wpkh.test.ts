// packages/shared/src/__tests__/tx-p2wpkh.test.ts
//
// Proves the P2WPKH builder via FIXED-INPUT invariant vectors: a fixed key,
// fixed UTXO, fixed recipient, and fixed fee. Because ECDSA nonces are
// RFC-6979 deterministic, the same inputs MUST yield identical bytes — so we
// assert determinism, structure, fee accounting, and validation here.
//
// The GOLDEN_SIGNED_HEX vector below is LOCKED to the abandon-mnemonic fixture
// (public / CI-safe). It is the exact hex the builder produced and that was
// (a) decoded by `bitcoin-cli decoderawtransaction` (structure + txid order),
// and (b) proven wire-valid via `bitcoin-cli testmempoolaccept` -> allowed:true
// on a structurally identical real-wallet P2WPKH spend (same code path). It now
// serves as a byte-exact regression anchor: any builder change that alters the
// serialization is caught here.

import { describe, expect, it } from "vitest";
import * as btc from "@scure/btc-signer";
import { hexToBytes } from "@noble/hashes/utils";
import { deriveSigningKey } from "../wallet/signing";
import {
  buildAndSignP2wpkhTransaction,
  type BuildP2wpkhParams,
} from "../tx/p2wpkh";
import { estimateP2wpkhFee, estimateP2wpkhVsize } from "../tx/fee";
import type { Utxo } from "../types/transaction";

// The standard all-"abandon" BIP-39 test mnemonic.
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon about";

// Key 0 controls the (fixture) input; key 1's address is the recipient. Both
// on signet, so the fixture is fully self-contained and signable.
const KEY0 = deriveSigningKey(TEST_MNEMONIC, "signet", 0);
const KEY1 = deriveSigningKey(TEST_MNEMONIC, "signet", 1);

// A fixture UTXO locked to KEY0's scriptPubKey (so it is ours to spend).
const FIXTURE_UTXO: Utxo = {
  txid: "a162ece6d72d0c0414965e6a22d807bcb5fc96c715fc0363bf21fb972ff7fc9c",
  vout: 0,
  amountSatoshis: 200000n,
  scriptPubKey: Buffer.from(KEY0.scriptPubKey).toString("hex"),
  address: KEY0.address,
  derivationPath: KEY0.path,
  confirmations: 70,
  isLocked: false,
  blockHeight: 387,
  isCoinbase: false,
};

function baseParams(overrides: Partial<BuildP2wpkhParams> = {}): BuildP2wpkhParams {
  return {
    network: "signet",
    selectedUtxos: [FIXTURE_UTXO],
    toAddress: KEY1.address,
    amountSatoshis: 50000n,
    feeSatoshis: 2000n,
    changeScriptPubKey: KEY0.scriptPubKey,
    signingKeys: [KEY0],
    enableRbf: true,
    ...overrides,
  };
}

describe("buildAndSignP2wpkhTransaction — happy path", () => {
  it("produces a non-empty hex and a 64-char txid", () => {
    const res = buildAndSignP2wpkhTransaction(baseParams());
    expect(res.hex.length).toBeGreaterThan(0);
    expect(res.txid).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — identical inputs yield identical bytes", () => {
    const a = buildAndSignP2wpkhTransaction(baseParams());
    const b = buildAndSignP2wpkhTransaction(baseParams());
    expect(a.hex).toBe(b.hex);
    expect(a.txid).toBe(b.txid);
  });

  it("the finalized hex re-parses without error and the id round-trips", () => {
    const res = buildAndSignP2wpkhTransaction(baseParams());
    const parsed = btc.Transaction.fromRaw(hexToBytes(res.hex));
    expect(parsed.id).toBe(res.txid);
  });

  it("creates a change output and balances inputs = amount + change + fee", () => {
    const res = buildAndSignP2wpkhTransaction(baseParams());
    expect(res.hasChange).toBe(true);
    // 200000 - 50000 - 2000 = 148000 change
    expect(res.changeSatoshis).toBe(148000n);
    expect(res.feeSatoshis).toBe(2000n);
    expect(
      50000n + res.changeSatoshis + res.feeSatoshis,
    ).toBe(res.totalInputSatoshis);
  });

  it("reports a positive vsize", () => {
    const res = buildAndSignP2wpkhTransaction(baseParams());
    expect(res.vsize).toBeGreaterThan(0);
  });
});

describe("buildAndSignP2wpkhTransaction — change handling", () => {
  it("folds sub-dust change into the fee (no change output)", () => {
    // Leave only 100 sats of change: 200000 - 50000 - 149900 = 100 (< 546).
    const res = buildAndSignP2wpkhTransaction(
      baseParams({ feeSatoshis: 149900n }),
    );
    expect(res.hasChange).toBe(false);
    expect(res.changeSatoshis).toBe(0n);
    // Effective fee absorbs the sub-dust remainder.
    expect(res.feeSatoshis).toBe(150000n);
  });
});

describe("buildAndSignP2wpkhTransaction — validation", () => {
  it("rejects an empty UTXO set", () => {
    expect(() =>
      buildAndSignP2wpkhTransaction(baseParams({ selectedUtxos: [] })),
    ).toThrow(/no inputs/i);
  });

  it("rejects a dust-sized send amount", () => {
    expect(() =>
      buildAndSignP2wpkhTransaction(baseParams({ amountSatoshis: 100n })),
    ).toThrow(/dust limit/i);
  });

  it("rejects insufficient funds", () => {
    expect(() =>
      buildAndSignP2wpkhTransaction(
        baseParams({ amountSatoshis: 199000n, feeSatoshis: 2000n }),
      ),
    ).toThrow(/insufficient funds/i);
  });

  it("rejects a recipient on the wrong network (mainnet bc1 on signet)", () => {
    const mainnetAddr = deriveSigningKey(TEST_MNEMONIC, "mainnet", 0).address;
    expect(() =>
      buildAndSignP2wpkhTransaction(baseParams({ toAddress: mainnetAddr })),
    ).toThrow(/HRP|network/i);
  });

  it("rejects a non-bech32 recipient", () => {
    expect(() =>
      buildAndSignP2wpkhTransaction(
        baseParams({ toAddress: "not-an-address" }),
      ),
    ).toThrow(/valid bech32/i);
  });

  it("rejects a UTXO with no matching signing key", () => {
    const foreign: Utxo = {
      ...FIXTURE_UTXO,
      scriptPubKey: "0014" + "00".repeat(20),
    };
    expect(() =>
      buildAndSignP2wpkhTransaction(baseParams({ selectedUtxos: [foreign] })),
    ).toThrow(/no signing key/i);
  });
});

describe("fee estimation helpers", () => {
  it("estimates vsize for 1-in / 2-out", () => {
    // ceil(10.75 + 68 + 62) = 141
    expect(estimateP2wpkhVsize(1, 2)).toBe(141);
  });

  it("scales the fee with the rate", () => {
    const at1 = estimateP2wpkhFee(1, 2, 1);
    const at2 = estimateP2wpkhFee(1, 2, 2);
    expect(at2).toBe(at1 * 2n);
  });

  it("rejects a non-positive fee rate", () => {
    expect(() => estimateP2wpkhFee(1, 2, 0)).toThrow(/positive/i);
  });
});

// ---------------------------------------------------------------------------
// GOLDEN VECTOR — byte-exact signed hex. LOCKED.
//
// Built from the abandon-mnemonic fixture (FIXTURE_UTXO vout 0, 200000 sats)
// sending 50000 to KEY1 at a 2 sat/vB fee (282 sats), change to KEY0. This is
// the exact hex captured from the builder and confirmed by the signet node:
//   bitcoin-cli decoderawtransaction <hex>   -> structure + txid order OK
//   bitcoin-cli testmempoolaccept '["..."]'  -> allowed:true (real-wallet,
//                                               identical P2WPKH code path)
// ---------------------------------------------------------------------------
const GOLDEN_SIGNED_HEX =
  "020000000001019cfcf72f97fb21bf6303fc15c796fcb5bc07d8226a5e9614040c2d" +
  "d7e6ec62a10000000000fdffffff0250c30000000000001600146fa016500a3c6a73" +
  "7ebb260e2ddca78ba9234558d648020000000000160014d0c4a3ef09e997b6e99e39" +
  "7e518fe3e41a118ca1024730440220273efc630dc41f0cc4804c3906648e42506d6d" +
  "263651942b3f68eaa384aead92022066b4894105a38d600c0b284b07e8496d74a5cf" +
  "54690da22d051d1f40fbe34dcd012102e7ab2537b5d49e970309aae06e9e49f36ce1" +
  "c9febbd44ec8e0d1cca0b4f9c31900000000";

const GOLDEN_TXID =
  "102432cd73834bd5676c6cff93e3c7848a6b5b85c64cae11b403cc4722bbcf69";

describe("buildAndSignP2wpkhTransaction — golden vector (node-verified)", () => {
  it("matches the verified golden signed hex (abandon fixture, fee 282)", () => {
    const res = buildAndSignP2wpkhTransaction(baseParams({ feeSatoshis: 282n }));
    expect(res.hex).toBe(GOLDEN_SIGNED_HEX);
    expect(res.txid).toBe(GOLDEN_TXID);
  });
});
