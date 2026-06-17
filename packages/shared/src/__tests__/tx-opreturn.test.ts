// packages/shared/src/__tests__/tx-opreturn.test.ts
//
// Tests for the P2WPKH-funded OP_RETURN transaction builder. These prove
// determinism, accounting, validation, parsing, and that the Coin News script
// is carried as a zero-value OP_RETURN output.

import { describe, expect, it } from "vitest";
import * as btc from "@scure/btc-signer";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { deriveSigningKey } from "../wallet/signing";
import { buildOpReturnScript, encodeCoinNewsV2 } from "../tx/coin-news";
import {
  buildAndSignOpReturnTransaction,
  type BuildOpReturnParams,
  validateOpReturnScript,
} from "../tx/opreturn";
import type { Utxo } from "../types/transaction";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon about";

const KEY0 = deriveSigningKey(TEST_MNEMONIC, "signet", 0);

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

const COIN_NEWS_SCRIPT = buildOpReturnScript(
  encodeCoinNewsV2({
    feed: "us-weekly",
    title: "Hello",
  }),
);

function baseParams(
  overrides: Partial<BuildOpReturnParams> = {},
): BuildOpReturnParams {
  return {
    network: "signet",
    selectedUtxos: [FIXTURE_UTXO],
    opReturnScript: COIN_NEWS_SCRIPT,
    feeSatoshis: 500n,
    changeScriptPubKey: KEY0.scriptPubKey,
    signingKeys: [KEY0],
    enableRbf: true,
    ...overrides,
  };
}

describe("validateOpReturnScript", () => {
  it("accepts the Coin News OP_RETURN script", () => {
    expect(() => validateOpReturnScript(COIN_NEWS_SCRIPT)).not.toThrow();
  });

  it("rejects a script that does not start with OP_RETURN", () => {
    expect(() => validateOpReturnScript(new Uint8Array([0x00, 0x01, 0x02]))).toThrow(
      /must start with OP_RETURN/i,
    );
  });

  it("rejects a trailing second push", () => {
    const bad = new Uint8Array([...COIN_NEWS_SCRIPT, 0x01, 0x00]);
    expect(() => validateOpReturnScript(bad)).toThrow(/exactly one data push/i);
  });

  it("rejects an empty OP_RETURN data push", () => {
    expect(() => validateOpReturnScript(new Uint8Array([0x6a, 0x00]))).toThrow(
      /too short|must not be empty/i,
    );
  });
});

describe("buildAndSignOpReturnTransaction", () => {
  it("produces a non-empty hex and a 64-char txid", () => {
    const res = buildAndSignOpReturnTransaction(baseParams());

    expect(res.hex.length).toBeGreaterThan(0);
    expect(res.txid).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — identical inputs yield identical bytes", () => {
    const a = buildAndSignOpReturnTransaction(baseParams());
    const b = buildAndSignOpReturnTransaction(baseParams());

    expect(a.hex).toBe(b.hex);
    expect(a.txid).toBe(b.txid);
  });

  it("the finalized hex re-parses without error and the id round-trips", () => {
    const res = buildAndSignOpReturnTransaction(baseParams());
    const parsed = btc.Transaction.fromRaw(hexToBytes(res.hex), {
      allowUnknownOutputs: true,
    });

    expect(parsed.id).toBe(res.txid);
  });

  it("carries the Coin News OP_RETURN script in the signed transaction", () => {
    const res = buildAndSignOpReturnTransaction(baseParams());

    expect(res.hex).toContain(bytesToHex(COIN_NEWS_SCRIPT));
  });

  it("creates wallet change and preserves fee accounting", () => {
    const res = buildAndSignOpReturnTransaction(baseParams());

    expect(res.hasChange).toBe(true);
    expect(res.changeSatoshis).toBe(199500n);
    expect(res.feeSatoshis).toBe(500n);
    expect(res.changeSatoshis + res.feeSatoshis).toBe(res.totalInputSatoshis);
  });

  it("folds sub-dust change into the fee", () => {
    const res = buildAndSignOpReturnTransaction(
      baseParams({ feeSatoshis: 199900n }),
    );

    expect(res.hasChange).toBe(false);
    expect(res.changeSatoshis).toBe(0n);
    expect(res.feeSatoshis).toBe(200000n);
  });

  it("rejects an empty UTXO set", () => {
    expect(() =>
      buildAndSignOpReturnTransaction(baseParams({ selectedUtxos: [] })),
    ).toThrow(/no inputs/i);
  });

  it("rejects an empty signing key set", () => {
    expect(() =>
      buildAndSignOpReturnTransaction(baseParams({ signingKeys: [] })),
    ).toThrow(/no signing keys/i);
  });

  it("rejects insufficient funds for the fee", () => {
    expect(() =>
      buildAndSignOpReturnTransaction(baseParams({ feeSatoshis: 200001n })),
    ).toThrow(/insufficient funds/i);
  });

  it("rejects a UTXO with no matching signing key", () => {
    const foreign: Utxo = {
      ...FIXTURE_UTXO,
      scriptPubKey: "0014" + "00".repeat(20),
    };

    expect(() =>
      buildAndSignOpReturnTransaction(
        baseParams({ selectedUtxos: [foreign] }),
      ),
    ).toThrow(/no signing key/i);
  });

  it("rejects a non-OP_RETURN script", () => {
    expect(() =>
      buildAndSignOpReturnTransaction(
        baseParams({ opReturnScript: KEY0.scriptPubKey }),
      ),
    ).toThrow(/OP_RETURN/i);
  });
});
