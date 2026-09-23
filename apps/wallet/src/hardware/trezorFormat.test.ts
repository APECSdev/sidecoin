import { describe, it, expect } from "vitest";
import { Transaction } from "bitcoinjs-lib";
import { buildRefTxs, toTrezorSignParams } from "./trezorFormat";
import type { HardwareSignRequest } from "./types";
import type { NetworkId } from "@sidecoin/shared";

function makeTestTxHex(): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0xab), 0);
  tx.addOutput(Buffer.from("0014" + "cd".repeat(20), "hex"), 1337000n);
  tx.addOutput(Buffer.from("0014" + "ef".repeat(20), "hex"), 50000n);
  return tx.toHex();
}

describe("buildRefTxs", () => {
  it("parses a raw tx hex into a RefTransaction", () => {
    const hex = makeTestTxHex();
    const txid = Transaction.fromHex(hex).getId();
    const refTxs = buildRefTxs({ [txid]: hex });

    expect(refTxs).toHaveLength(1);
    const ref = refTxs[0];
    expect(ref.version).toBe(2);
    expect(ref.lock_time).toBe(0);
    expect(ref.hash).toBe(txid);
    expect(ref.inputs).toHaveLength(1);
    expect(ref.bin_outputs).toHaveLength(2);
  });

  it("produces hex string for script_pubkey (not comma-decimals)", () => {
    const hex = makeTestTxHex();
    const txid = Transaction.fromHex(hex).getId();
    const refTxs = buildRefTxs({ [txid]: hex });

    const scriptPubKey = refTxs[0].bin_outputs[0].script_pubkey;
    expect(scriptPubKey).toMatch(/^[0-9a-fA-F]+$/);
    expect(scriptPubKey).not.toContain(",");
    expect(scriptPubKey).toBe("0014" + "cd".repeat(20));
  });

  it("produces hex string for script_sig in inputs", () => {
    const hex = makeTestTxHex();
    const txid = Transaction.fromHex(hex).getId();
    const refTxs = buildRefTxs({ [txid]: hex });

    expect(refTxs[0].inputs[0].script_sig).toBe("");
  });

  it("parses output amounts correctly", () => {
    const hex = makeTestTxHex();
    const txid = Transaction.fromHex(hex).getId();
    const refTxs = buildRefTxs({ [txid]: hex });

    expect(refTxs[0].bin_outputs[0].amount).toBe("1337000");
    expect(refTxs[0].bin_outputs[1].amount).toBe("50000");
  });

  it("parses input prev_hash in display order", () => {
    const hex = makeTestTxHex();
    const txid = Transaction.fromHex(hex).getId();
    const refTxs = buildRefTxs({ [txid]: hex });

    const expected = Buffer.alloc(32, 0xab).reverse().toString("hex");
    expect(refTxs[0].inputs[0].prev_hash).toBe(expected);
  });

  it("returns empty array for empty input", () => {
    expect(buildRefTxs({})).toEqual([]);
  });
});

describe("toTrezorSignParams", () => {
  const baseReq: HardwareSignRequest = {
    network: "signet" as NetworkId,
    derivationPath: "m/84'/1'/0'/0/0",
    inputs: [
      {
        txid: "a".repeat(64),
        vout: 0,
        amountSatoshis: 1000000n,
        scriptPubKey: "0014" + "ab".repeat(20),
      },
    ],
    toAddress: "tb1q" + "x".repeat(38),
    amountSatoshis: 500000n,
    feeSatoshis: 141n,
    changeScriptPubKey: "0014" + "cd".repeat(20),
  };

  it("builds inputs with SPENDWITNESS script_type", () => {
    const params = toTrezorSignParams(baseReq);
    expect(params.inputs).toHaveLength(1);
    expect(params.inputs[0].script_type).toBe("SPENDWITNESS");
    expect(params.inputs[0].prev_hash).toBe("a".repeat(64));
    expect(params.inputs[0].prev_index).toBe(0);
    expect(params.inputs[0].amount).toBe("1000000");
    expect(params.inputs[0].sequence).toBe(0xfffffffd);
  });

  it("builds the recipient output with PAYTOADDRESS", () => {
    const params = toTrezorSignParams(baseReq);
    expect(params.outputs[0]).toMatchObject({
      address: baseReq.toAddress,
      amount: "500000",
      script_type: "PAYTOADDRESS",
    });
  });

  it("includes a change output when change > dust limit", () => {
    const params = toTrezorSignParams(baseReq);
    expect(params.outputs).toHaveLength(2);
    expect(params.outputs[1]).toMatchObject({
      script_type: "PAYTOWITNESS",
      amount: "499859",
    });
  });

  it("omits change output when change is exactly 0", () => {
    const req: HardwareSignRequest = {
      ...baseReq,
      amountSatoshis: 999859n,
      feeSatoshis: 141n,
    };
    const params = toTrezorSignParams(req);
    expect(params.outputs).toHaveLength(1);
  });

  it("omits change output when change is between 0 and dust", () => {
    const req: HardwareSignRequest = {
      ...baseReq,
      amountSatoshis: 999600n,
      feeSatoshis: 141n,
    };
    const params = toTrezorSignParams(req);
    expect(params.outputs).toHaveLength(1);
  });

  it("throws on insufficient funds", () => {
    const req: HardwareSignRequest = {
      ...baseReq,
      amountSatoshis: 2000000n,
      feeSatoshis: 141n,
    };
    expect(() => toTrezorSignParams(req)).toThrow(/Insufficient funds/);
  });

  it("throws on empty inputs", () => {
    const req: HardwareSignRequest = {
      ...baseReq,
      inputs: [],
    };
    expect(() => toTrezorSignParams(req)).toThrow(/no inputs/);
  });

  it("sets coin to 'test' for signet", () => {
    const params = toTrezorSignParams(baseReq);
    expect(params.coin).toBe("test");
  });

  it("sets coin to 'btc' for mainnet", () => {
    const req: HardwareSignRequest = {
      ...baseReq,
      network: "mainnet" as NetworkId,
    };
    const params = toTrezorSignParams(req);
    expect(params.coin).toBe("btc");
  });

  it("includes refTxs when rawTxs is provided", () => {
    const hex = makeTestTxHex();
    const txid = Transaction.fromHex(hex).getId();
    const req: HardwareSignRequest = {
      ...baseReq,
      inputs: [{ txid, vout: 0, amountSatoshis: 1337000n, scriptPubKey: "0014" + "cd".repeat(20) }],
      rawTxs: { [txid]: hex },
    };
    const params = toTrezorSignParams(req);
    expect(params.refTxs).toHaveLength(1);
    expect(params.refTxs[0].hash).toBe(txid);
  });

  it("returns empty refTxs when rawTxs is not provided", () => {
    const params = toTrezorSignParams(baseReq);
    expect(params.refTxs).toEqual([]);
  });
});
