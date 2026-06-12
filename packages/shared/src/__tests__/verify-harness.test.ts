// packages/shared/src/__tests__/verify-harness.test.ts
//
// MANUAL VERIFICATION HARNESS — not part of the assertion suite.
//
// Gated behind SIDECOIN_VERIFY=1 so a normal `vitest run` skips it silently.
// When enabled it derives signet addresses and builds a signed tx (from the
// built-in fixture, or from a REAL UTXO supplied via env) and prints the raw
// hex so it can be checked against a live signet node.
//
//   Phase A (byte-order / structure — NO funds, NO real prevout needed):
//     SIDECOIN_VERIFY=1 pnpm --filter @sidecoin/shared exec \
//       vitest run src/__tests__/verify-harness.test.ts
//     bitcoin-cli -signet decoderawtransaction <HEX>
//       -> confirm vin[0].txid equals the fixture txid (display order)
//
//   Phase B (full acceptance: txid-order + witness + sighash — NO broadcast):
//     supply a REAL unspent UTXO you control + recipient via env, then:
//     bitcoin-cli -signet testmempoolaccept '["<HEX>"]'
//       -> {"allowed": true} proves the builder is wire-correct.

import { describe, it } from "vitest";
import { deriveSigningKey } from "../wallet/signing";
import { buildAndSignP2wpkhTransaction } from "../tx/p2wpkh";
import { estimateP2wpkhFee } from "../tx/fee";
import type { Utxo } from "../types/transaction";

const ENABLED = process.env.SIDECOIN_VERIFY === "1";

// The standard all-"abandon" BIP-39 test mnemonic (override via env).
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon about";

describe("VERIFY HARNESS (manual; gated by SIDECOIN_VERIFY=1)", () => {
  it.skipIf(!ENABLED)("derives signet addresses + builds a signed tx", () => {
    const mnemonic = process.env.SIDECOIN_MNEMONIC ?? TEST_MNEMONIC;
    const index = Number(process.env.SIDECOIN_INDEX ?? "0");

    const key = deriveSigningKey(mnemonic, "signet", index);
    const recipientKey = deriveSigningKey(mnemonic, "signet", index + 1);

    // eslint-disable-next-line no-console
    console.log("\n=== signet derivation ===");
    // eslint-disable-next-line no-console
    console.log(`index ${index} address :`, key.address);
    // eslint-disable-next-line no-console
    console.log(
      `index ${index} script  :`,
      Buffer.from(key.scriptPubKey).toString("hex"),
    );
    // eslint-disable-next-line no-console
    console.log(`recipient (index ${index + 1}):`, recipientKey.address);

    // UTXO: a REAL one from env if provided, else the built-in fixture
    // (synthetic prevout — fine for decoderawtransaction, NOT for
    // testmempoolaccept, which checks the prevout actually exists).
    const utxo: Utxo = {
      txid:
        process.env.SIDECOIN_UTXO_TXID ??
        "a162ece6d72d0c0414965e6a22d807bcb5fc96c715fc0363bf21fb972ff7fc9c",
      vout: Number(process.env.SIDECOIN_UTXO_VOUT ?? "0"),
      amountSatoshis: BigInt(process.env.SIDECOIN_UTXO_VALUE ?? "200000"),
      scriptPubKey:
        process.env.SIDECOIN_UTXO_SCRIPT ??
        Buffer.from(key.scriptPubKey).toString("hex"),
      address: key.address,
      derivationPath: key.path,
      confirmations: 70,
      isLocked: false,
      blockHeight: 387,
    };

    const toAddress = process.env.SIDECOIN_TO ?? recipientKey.address;
    const amountSatoshis = BigInt(process.env.SIDECOIN_AMOUNT ?? "50000");
    const feeRate = Number(process.env.SIDECOIN_FEERATE ?? "2");
    const fee = estimateP2wpkhFee(1, 2, feeRate);

    const res = buildAndSignP2wpkhTransaction({
      network: "signet",
      selectedUtxos: [utxo],
      toAddress,
      amountSatoshis,
      feeSatoshis: fee,
      changeScriptPubKey: key.scriptPubKey,
      signingKeys: [key],
      enableRbf: true,
    });

    // eslint-disable-next-line no-console
    console.log("\n=== signed tx ===");
    // eslint-disable-next-line no-console
    console.log("spending  :", `${utxo.txid}:${utxo.vout}`);
    // eslint-disable-next-line no-console
    console.log("to        :", toAddress, `(${amountSatoshis} sats)`);
    // eslint-disable-next-line no-console
    console.log("fee       :", res.feeSatoshis.toString(), "sats");
    // eslint-disable-next-line no-console
    console.log("change    :", res.changeSatoshis.toString(), "sats");
    // eslint-disable-next-line no-console
    console.log("vsize     :", res.vsize, "vB");
    // eslint-disable-next-line no-console
    console.log("txid      :", res.txid);
    // eslint-disable-next-line no-console
    console.log("\nHEX:\n" + res.hex + "\n");
  });
});
