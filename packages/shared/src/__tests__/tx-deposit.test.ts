// packages/shared/src/__tests__/tx-deposit.test.ts
//
// Proves the M5 deposit builder against:
//   1. the OFFICIAL BIP-143 "Native P2WPKH" test vector (sighash correctness),
//   2. LIVE signet deposit transactions fetched from
//      esplora.signet.drivechain.info (structure: treasury script bytes,
//      OP_RETURN payload, output ordering, sequences, CTIP value math).
//
// The live structure vectors come from real deposits observed 2026-11-15:
//   1a23f9d2455137e63f6dc87f90514ef33258746cebf6fd7ebb6c96416b4cc4eb
//   a4d84730a0857b6e46c1e6e7174bb675bb1b1a9b0419783a4fdacf4c6eade149
// Both are Thunder (slot 9) deposits carrying address
// "2QQkc3D71Tw7zx9vLhADj2wNkvhC" (the one SupaQt indexes).

import { describe, expect, it } from "vitest";
import { Transaction, Script } from "@scure/btc-signer";
import { hex } from "@scure/base";
import { sha256 } from "@noble/hashes/sha256";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1.js";

import {
  bip143Sighash,
  buildAndSignDepositTransaction,
  estimateDepositVsize,
  getDepositNetworkParams,
  treasuryScript,
  type Ctip,
} from "../tx/deposit";
import type { Utxo } from "../types/transaction";
import type { SigningKey } from "../wallet/signing";

// ---------------------------------------------------------------------------
// 1. BIP-143 official "Native P2WPKH" vector (bip-0143.mediawiki)
// ---------------------------------------------------------------------------

const BIP143_VECTOR = {
  txVersion: 1,
  // Input 0: P2PK outpoint, sequence 0xffffffee. Input 1: the signed P2WPKH.
  outpoints: [
    {
      txidInternal: hexToBytes(
        "fff7f7881a8099afa6940d42d1e7f6362bec38171ea3edf433541db4e4ad969f",
      ),
      vout: 0,
    },
    {
      txidInternal: hexToBytes(
        "ef51e1b804cc89d182d279655c3aa89e815b1b309fe287d9b2b55d57b90ec68a",
      ),
      vout: 1,
    },
  ],
  sequences: [0xffffffee, 0xffffffff],
  // The signed input's scriptPubKey + value.
  inputScriptPubKey: "00141d0f172a0ecb48aee1be1f2687d2963ae33f71a1",
  inputValueSats: 600000000n,
  outputs: [
    {
      valueSats: 112340000n,
      // 0x19 prefix = the script length varint (added by serializeOutput)
      script: hexToBytes("76a9148280b37df378db99f66f85c95a783a76ac7a6d5988ac"),
    },
    {
      valueSats: 223450000n,
      script: hexToBytes("76a9143bde42dbee7e4dbe6a21b2d50ce2f0167faa815988ac"),
    },
  ],
  lockTime: 17,
  expectedSigHash: "c37af31116d1b27caf68aae9e3ac82f1477929014d5b917657d0eb49478cb670",
  privateKey: "619c335025c7f4012e556c2a58b2506e30b8511b53ade95ea316fd8c3286feb9",
  publicKey: "025476c2e83188368da1ff3e292e7acafcdb3566bb0ad253f62fc70f07aeee6357",
  expectedSignature:
    "304402203609e17b84f6a7d30c80bfa610b5b4542f32a8a0d5447a12fb1366d7f01cc44a0220573a954c4518331561406f90300e8f3358f51928d43c212a8caed02de67eebee01",
};

describe("bip143Sighash — official BIP-143 Native P2WPKH vector", () => {
  it("reproduces the published sigHash byte-for-byte", () => {
    const sighash = bip143Sighash({
      txVersion: BIP143_VECTOR.txVersion,
      outpoints: BIP143_VECTOR.outpoints,
      sequences: BIP143_VECTOR.sequences,
      inputIndex: 1,
      inputScriptCode: Uint8Array.of(
        0x19, 0x76, 0xa9, 0x14,
        ...hexToBytes("1d0f172a0ecb48aee1be1f2687d2963ae33f71a1"),
        0x88, 0xac,
      ),
      inputValueSats: BIP143_VECTOR.inputValueSats,
      outputs: BIP143_VECTOR.outputs,
      lockTime: BIP143_VECTOR.lockTime,
    });
    expect(bytesToHex(sighash)).toBe(BIP143_VECTOR.expectedSigHash);
  });

  it("produces a signature that verifies against the vector key", () => {
    const sighash = bip143Sighash({
      txVersion: BIP143_VECTOR.txVersion,
      outpoints: BIP143_VECTOR.outpoints,
      sequences: BIP143_VECTOR.sequences,
      inputIndex: 1,
      inputScriptCode: Uint8Array.of(
        0x19, 0x76, 0xa9, 0x14,
        ...hexToBytes("1d0f172a0ecb48aee1be1f2687d2963ae33f71a1"),
        0x88, 0xac,
      ),
      inputValueSats: BIP143_VECTOR.inputValueSats,
      outputs: BIP143_VECTOR.outputs,
      lockTime: BIP143_VECTOR.lockTime,
    });

    const priv = hexToBytes(BIP143_VECTOR.privateKey);
    const der = secp256k1.sign(sighash, priv, { prehash: false, format: "der" });
    const derWithHashType = Uint8Array.of(...der, 0x01);

    // The signature must verify (crypto-correctness independent of nonce choice).
    const ok = secp256k1.verify(
      derWithHashType.subarray(0, der.length),
      sighash,
      hexToBytes(BIP143_VECTOR.publicKey),
      { prehash: false, format: "der" },
    );
    expect(ok).toBe(true);

    // DER + SIGHASH_ALL structure.
    expect(derWithHashType[derWithHashType.length - 1]).toBe(0x01);
    expect(der[0]).toBe(0x30);
  });
});

// ---------------------------------------------------------------------------
// 2. Network parameters (enforcer lib/types.rs NetworkParams)
// ---------------------------------------------------------------------------

describe("getDepositNetworkParams", () => {
  it("signet/l2l-signet: OP_NOP5 (0xb4) + no replay protection (live-verified)", () => {
    expect(getDepositNetworkParams("signet")).toEqual({
      opDrivechainOpcode: 0xb4,
      lockTime: null,
    });
    expect(getDepositNetworkParams("l2l-signet")).toEqual({
      opDrivechainOpcode: 0xb4,
      lockTime: null,
    });
  });

  it("mainnet/betanet: OP_NOP8 (0xb7) + nLockTime 499999998 (enforcer source)", () => {
    expect(getDepositNetworkParams("betanet")).toEqual({
      opDrivechainOpcode: 0xb7,
      lockTime: 499999998,
    });
    expect(getDepositNetworkParams("mainnet")).toEqual({
      opDrivechainOpcode: 0xb7,
      lockTime: 499999998,
    });
  });

  it("rejects networks whose deposit conventions are not verified", () => {
    expect(() => getDepositNetworkParams("testnet")).toThrow(/not supported/);
    expect(() => getDepositNetworkParams("regtest")).toThrow(/not supported/);
  });
});

describe("treasuryScript", () => {
  it("signet (0xb4) slot 9 → b4 01 09 51 (matches live signet deposit txs)", () => {
    const spk = treasuryScript(getDepositNetworkParams("signet"), 9);
    expect(bytesToHex(spk)).toBe("b4010951");
  });

  it("betanet (0xb7) slot 9 → b7 01 09 51", () => {
    const spk = treasuryScript(getDepositNetworkParams("betanet"), 9);
    expect(bytesToHex(spk)).toBe("b7010951");
  });
});

// ---------------------------------------------------------------------------
// 3. Live structure vectors
// ---------------------------------------------------------------------------

const LIVE_L2_ADDRESS = "2QQkc3D71Tw7zx9vLhADj2wNkvhC";
// OP_RETURN payload of live tx 1a23f9d2… — the bare address as ASCII bytes.
const LIVE_OP_RETURN_PAYLOAD_HEX =
  "3251516b63334437315477377a7839764c6841446a32774e6b766843";
const LIVE_SLOT = 9;
const LIVE_CTIP_VALUE = 767280000n; // a4d84730… treasury output value
const LIVE_DEPOSIT = 100000n; // recorded value_sats on the adapter

const TEST_PRIVATE_KEY = hexToBytes(
  "619c335025c7f4012e556c2a58b2506e30b8511b53ade95ea316fd8c3286feb9",
);

function makeSigningKey(scriptPubKeyHex: string): SigningKey {
  const publicKey = secp256k1.getPublicKey(TEST_PRIVATE_KEY, true);
  return {
    privateKey: TEST_PRIVATE_KEY,
    publicKey,
    address: "tb1qtest",
    scriptPubKey: hexToBytes(scriptPubKeyHex),
    path: "m/84'/1'/0'/0/0",
    network: "signet",
  };
}

const FUNDING_SPK = "00141d0f172a0ecb48aee1be1f2687d2963ae33f71a1";

const FUNDING_UTXO: Utxo = {
  txid: "7d10f8714839cf6f840792348ba0b3dbbaabdf9ae28b8c58df0ec306496b6fcc",
  vout: 1,
  amountSatoshis: 900000n,
  scriptPubKey: FUNDING_SPK,
  address: "tb1qtest",
  derivationPath: "",
  confirmations: 10,
  blockHeight: 1000,
  isCoinbase: false,
};

const LIVE_CTIP: Ctip = {
  txid: "a4d84730a0857b6e46c1e6e7174bb675bb1b1a9b0419783a4fdacf4c6eade149",
  vout: 0,
  valueSats: LIVE_CTIP_VALUE,
};

function buildLiveShapedDeposit() {
  return buildAndSignDepositTransaction({
    network: "signet",
    sidechainSlot: LIVE_SLOT,
    ctip: LIVE_CTIP,
    l2Address: LIVE_L2_ADDRESS,
    depositSatoshis: LIVE_DEPOSIT,
    // Matches the live tx's funding structure: deposit + fee ≪ funding value.
    feeSatoshis: 1000n,
    selectedUtxos: [FUNDING_UTXO],
    changeScriptPubKey: hexToBytes(FUNDING_SPK),
    signingKeys: [makeSigningKey(FUNDING_SPK)],
  });
}

describe("buildAndSignDepositTransaction — structure vs live signet deposits", () => {
  it("reproduces the live wire shape: treasury output, bare-address OP_RETURN, change", () => {
    const signed = buildLiveShapedDeposit();

    // Parse the produced hex with the battle-tested @scure parser (the same
    // parser that decoded the live deposit txs).
    const tx = Transaction.fromRaw(hex.decode(signed.hex), {
      allowUnknown: true,
      allowUnknownOutputs: true,
      allowLegacy: true,
    });

    // nVersion 2, no locktime on signet. (nLockTime 0 is @scure's default —
    // its field is `lockTime` and it omits default values.)
    expect(tx.version).toBe(2);
    expect(tx.lockTime ?? 0).toBe(0);
    expect(signed.hex.endsWith("00000000")).toBe(true);

    // Two inputs: funding (RBF) + treasury (final, keyless).
    expect(tx.inputs.length).toBe(2);
    expect(tx.inputs[0].sequence).toBe(0xfffffffd);
    expect(tx.inputs[1].sequence).toBe(0xffffffff);
    // Treasury input is keyless: empty scriptSig, empty witness.
    expect(tx.inputs[1].script?.length ?? 0).toBe(0);
    expect(tx.inputs[1].finalScriptWitness?.length ?? 0).toBe(0);
    // Funding input carries a 2-item witness (DER sig + 33-byte pubkey).
    expect(tx.inputs[0].finalScriptWitness?.length).toBe(2);

    // Three outputs in the live order: treasury, OP_RETURN, change.
    expect(tx.outputs.length).toBe(3);

    // Output 0: treasury script b4 01 09 51 with value = CTIP + deposit.
    const out0Asm = Script.decode(tx.outputs[0].script)
      .map((p) => (typeof p === "object" ? `PUSH<${hex.encode(p)}>` : String(p)))
      .join(" ");
    expect(out0Asm).toBe("NOP5 PUSH<09> 1");
    expect(tx.outputs[0].amount).toBe(LIVE_CTIP_VALUE + LIVE_DEPOSIT);

    // Output 1: OP_RETURN carrying the BARE L2 address ASCII bytes.
    const out1Bytes = bytesToHex(tx.outputs[1].script);
    expect(out1Bytes).toBe(`6a1c${LIVE_OP_RETURN_PAYLOAD_HEX}`);
    expect(tx.outputs[1].amount).toBe(0n);

    // Output 2: change back to the depositor's P2WPKH.
    expect(tx.outputs[2].amount).toBe(900000n - LIVE_DEPOSIT - 1000n);
    expect(bytesToHex(tx.outputs[2].script)).toBe(FUNDING_SPK);
  });

  it("accounts the fee exactly: fee = user inputs − deposit − change", () => {
    const signed = buildLiveShapedDeposit();
    expect(signed.treasuryOutputSatoshis).toBe(LIVE_CTIP_VALUE + LIVE_DEPOSIT);
    expect(signed.changeSatoshis).toBe(900000n - LIVE_DEPOSIT - 1000n);
    expect(signed.feeSatoshis).toBe(1000n);
    expect(signed.totalInputSatoshis).toBe(LIVE_CTIP_VALUE + 900000n);
    expect(signed.hasChange).toBe(true);
  });

  it("folds sub-dust change into the fee", () => {
    // Funding such that change = 200 sats (< 546 dust) → folded into fee.
    const utxo: Utxo = { ...FUNDING_UTXO, amountSatoshis: LIVE_DEPOSIT + 1000n + 200n };
    const signed = buildAndSignDepositTransaction({
      network: "signet",
      sidechainSlot: LIVE_SLOT,
      ctip: LIVE_CTIP,
      l2Address: LIVE_L2_ADDRESS,
      depositSatoshis: LIVE_DEPOSIT,
      feeSatoshis: 1000n,
      selectedUtxos: [utxo],
      changeScriptPubKey: hexToBytes(FUNDING_SPK),
      signingKeys: [makeSigningKey(FUNDING_SPK)],
    });
    expect(signed.hasChange).toBe(false);
    expect(signed.changeSatoshis).toBe(0n);
    expect(signed.feeSatoshis).toBe(1200n);
  });

  it("applies the eCash-fork parameters on betanet (0xb7 script + nLockTime)", () => {
    const signed = buildAndSignDepositTransaction({
      network: "betanet",
      sidechainSlot: LIVE_SLOT,
      ctip: LIVE_CTIP,
      l2Address: LIVE_L2_ADDRESS,
      depositSatoshis: LIVE_DEPOSIT,
      feeSatoshis: 1000n,
      selectedUtxos: [FUNDING_UTXO],
      changeScriptPubKey: hexToBytes(FUNDING_SPK),
      signingKeys: [makeSigningKey(FUNDING_SPK)],
    });

    const tx = Transaction.fromRaw(hex.decode(signed.hex), {
      allowUnknown: true,
      allowUnknownOutputs: true,
      allowLegacy: true,
    });
    // nLockTime 499999998 = LE bytes fe 64 cd 1d (replay protection).
    expect(signed.hex.endsWith("fe64cd1d")).toBe(true);
    expect(tx.lockTime).toBe(499999998);
    expect(bytesToHex(tx.outputs[0].script)).toBe("b7010951");
  });

  it("is deterministic — identical inputs produce identical bytes (RFC-6979)", () => {
    const a = buildLiveShapedDeposit();
    const b = buildLiveShapedDeposit();
    expect(a.hex).toBe(b.hex);
    expect(a.txid).toBe(b.txid);
  });
});

describe("buildAndSignDepositTransaction — input validation", () => {
  const base = {
    network: "signet" as const,
    sidechainSlot: LIVE_SLOT,
    ctip: LIVE_CTIP,
    l2Address: LIVE_L2_ADDRESS,
    depositSatoshis: LIVE_DEPOSIT,
    feeSatoshis: 1000n,
    selectedUtxos: [FUNDING_UTXO],
    changeScriptPubKey: hexToBytes(FUNDING_SPK),
    signingKeys: [makeSigningKey(FUNDING_SPK)],
  };

  it("rejects a zero deposit", () => {
    expect(() => buildAndSignDepositTransaction({ ...base, depositSatoshis: 0n })).toThrow(
      /positive/,
    );
  });

  it("rejects insufficient funding", () => {
    const broke: Utxo = { ...FUNDING_UTXO, amountSatoshis: 500n };
    expect(() =>
      buildAndSignDepositTransaction({ ...base, selectedUtxos: [broke] }),
    ).toThrow(/Insufficient funds/);
  });

  it("rejects a UTXO with no matching signing key", () => {
    expect(() =>
      buildAndSignDepositTransaction({
        ...base,
        signingKeys: [makeSigningKey("0014ffffffffffffffffffffffffffffffffffffffff")],
      }),
    ).toThrow(/No signing key/);
  });

  it("rejects an out-of-range slot", () => {
    expect(() =>
      buildAndSignDepositTransaction({ ...base, sidechainSlot: 256 }),
    ).toThrow(/integer 0-255/);
  });

  it("rejects an empty L2 address", () => {
    expect(() => buildAndSignDepositTransaction({ ...base, l2Address: "" })).toThrow(
      /non-empty/,
    );
  });

  it("rejects an unsupported network", () => {
    expect(() =>
      buildAndSignDepositTransaction({ ...base, network: "regtest" }),
    ).toThrow(/not supported/);
  });
});

describe("estimateDepositVsize", () => {
  it("sized close to the live deposit tx (2-input/3-output ≈ 200 vB shape)", () => {
    // The live deposit txs (1 funding input + treasury + 3 outputs) are
    // 570 bytes raw; vsize should be in the same ballpark (150–250 vB).
    const vsize = estimateDepositVsize({
      numUserInputs: 1,
      l2Address: LIVE_L2_ADDRESS,
      hasChange: true,
    });
    expect(vsize).toBeGreaterThan(150);
    expect(vsize).toBeLessThan(250);
  });

  it("scales with funding inputs and drops without change", () => {
    const withChange = estimateDepositVsize({
      numUserInputs: 1,
      l2Address: LIVE_L2_ADDRESS,
      hasChange: true,
    });
    const twoInputs = estimateDepositVsize({
      numUserInputs: 2,
      l2Address: LIVE_L2_ADDRESS,
      hasChange: true,
    });
    const noChange = estimateDepositVsize({
      numUserInputs: 1,
      l2Address: LIVE_L2_ADDRESS,
      hasChange: false,
    });
    expect(twoInputs).toBeGreaterThan(withChange);
    expect(noChange).toBeLessThan(withChange);
  });
});

// Silence an unused-import lint if sha256 is not referenced above.
void sha256;
