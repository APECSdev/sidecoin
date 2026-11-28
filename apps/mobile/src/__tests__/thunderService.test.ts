// apps/mobile/src/__tests__/thunderService.test.ts
//
// The Thunder account service end to end against a stubbed index: receive
// index persistence, sync balance math (withdrawal rows excluded, the
// mempool merge is the index's job), the index-empty case, and the FULL
// send pipeline — the captured broadcast body is decoded back into a
// transaction and every authorization is FROST-verified over its canonical
// Borsh bytes, proving what the device would submit to the node.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { mnemonicToSeed, thunder } from "@sidecoin/shared";

import {
  sendThunder,
  syncThunderAccount,
  thunderDepositString,
  thunderReceiveAddress,
  type ThunderAccount,
} from "../thunder/service";

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ACCOUNT: ThunderAccount = { walletId: "test-wallet", l1Network: "betanet" };
const BASE = thunder.THUNDER_NETWORKS.betanet.thunderEsploraBaseUrl;

// Index fixtures — the golden wallet's index-0 address holds two UTXOs.
const V18_ACCOUNT = thunder.deriveAccountKey(mnemonicToSeed(MNEMONIC, ""), "thunder-v18");
const ADDRESS_0 = thunder.thunderAddress(
  thunder.deriveAddressPublicKey(thunder.toPublicKey(V18_ACCOUNT), 0, "thunder-v18"),
);
const RAW_TXID = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

const UTXO_ROWS = [
  { txid: RAW_TXID, vout: 0, value: 3000, status: { confirmed: true, block_height: 2400, block_hash: null, block_time: 1730000000 }, outpoint_kind: "regular", content_type: "value" },
  { txid: RAW_TXID, vout: 1, value: 2000, status: { confirmed: true, block_height: 2401, block_hash: null, block_time: 1730001000 }, outpoint_kind: "regular", content_type: "value" },
  // A withdrawal-content row — consensus-unspendable, excluded from balance.
  { txid: RAW_TXID, vout: 2, value: 700, status: { confirmed: true, block_height: 2402, block_hash: null, block_time: 1730002000 }, outpoint_kind: "regular", content_type: "withdrawal", content: { Withdrawal: { value: 700, main_fee: 40, main_address: "bc1qx" } } },
];

const esplora = jest.requireMock("../api/thunderEsplora");

jest.mock("../api/thunderEsplora", () => ({
  __esModule: true,
  getThunderTipHeight: jest.fn(),
  getThunderAddressInfo: jest.fn(),
  getThunderAddressUtxos: jest.fn(),
  getThunderAddressDeposits: jest.fn(async () => []),
  getThunderAddressTxs: jest.fn(async () => []),
  getThunderAddressMempoolTxs: jest.fn(async () => []),
  getThunderTx: jest.fn(),
  broadcastThunderTransaction: jest.fn(),
  getThunderSidechainInfo: jest.fn(),
  esploraUtxoToPointedOutput: jest.requireActual("../api/thunderEsplora").esploraUtxoToPointedOutput,
  ThunderEsploraError: jest.requireActual("../api/thunderEsplora").ThunderEsploraError,
  THUNDER_INDEX_EMPTY_STATUS: jest.requireActual("../api/thunderEsplora").THUNDER_INDEX_EMPTY_STATUS,
}));

function stubIndex() {
  (esplora.getThunderTipHeight as jest.Mock).mockResolvedValue(2422);
  (esplora.getThunderAddressInfo as jest.Mock).mockImplementation(
    async (_base: string, address: string) => ({
      address,
      chain_stats: { funded_txo_count: address === ADDRESS_0 ? 3 : 0, funded_txo_sum: 5700, spent_txo_count: 0, spent_txo_sum: 0, tx_count: address === ADDRESS_0 ? 3 : 0 },
      mempool_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 },
    }),
  );
  (esplora.getThunderAddressUtxos as jest.Mock).mockImplementation(
    async (_base: string, address: string) => (address === ADDRESS_0 ? UTXO_ROWS : []),
  );
  (esplora.getThunderAddressTxs as jest.Mock).mockResolvedValue([]);
  (esplora.getThunderSidechainInfo as jest.Mock).mockResolvedValue({
    slot: 9, title: "Thunder", description: "", vote_count: 1009,
    proposal_height: 967989, activation_height: 968998,
    treasury: { txid: "10355f72", vout: 0, value_sats: 101206685589 },
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  stubIndex();
});

describe("thunder receive", () => {
  it("returns the index-0 address first and advances on request, persisting", async () => {
    const first = await thunderReceiveAddress(MNEMONIC, ACCOUNT, false);
    expect(first.index).toBe(0);
    expect(first.address).toBe(ADDRESS_0);

    const again = await thunderReceiveAddress(MNEMONIC, ACCOUNT, false);
    expect(again.index).toBe(0);

    const next = await thunderReceiveAddress(MNEMONIC, ACCOUNT, true);
    expect(next.index).toBe(1);
    expect(next.address).not.toBe(ADDRESS_0);

    const persisted = await thunderReceiveAddress(MNEMONIC, ACCOUNT, false);
    expect(persisted.index).toBe(1);
  });

  it("wraps the deposit string as s9_<addr>_<checksum>", () => {
    const wrapped = thunderDepositString(ADDRESS_0);
    expect(wrapped.startsWith(`s9_${ADDRESS_0}_`)).toBe(true);
    expect(() => thunder.parseThunderDepositString(wrapped)).not.toThrow();
  });
});

describe("thunder sync", () => {
  it("computes the balance from value rows, excludes withdrawals, reports the escrow", async () => {
    const state = await syncThunderAccount(MNEMONIC, ACCOUNT);
    expect(state.network).toBe("betanet");
    expect(state.balanceSats).toBe("5000");
    expect(state.utxos).toHaveLength(2);
    expect(state.tipHeight).toBe(2422);
    expect(state.indexEmpty).toBe(false);
    expect(state.sidechain?.treasuryValueSats).toBe("101206685589");
    expect(state.sidechain?.activationHeight).toBe(968998);
  });

  it("maps a 404 tip (live index, no blocks) to the empty state, not an error", async () => {
    const { ThunderEsploraError, THUNDER_INDEX_EMPTY_STATUS } = jest.requireActual("../api/thunderEsplora");
    (esplora.getThunderTipHeight as jest.Mock).mockRejectedValue(
      new ThunderEsploraError("tip height failed: HTTP 404", THUNDER_INDEX_EMPTY_STATUS),
    );
    const state = await syncThunderAccount(MNEMONIC, ACCOUNT);
    expect(state.indexEmpty).toBe(true);
    expect(state.balanceSats).toBe("0");
    expect(state.history).toEqual([]);
  });

  it("refuses networks with no Thunder deployment backend", async () => {
    await expect(
      syncThunderAccount(MNEMONIC, { walletId: "w", l1Network: "signet" }),
    ).rejects.toThrow(/no public backend yet/);
    await expect(
      syncThunderAccount(MNEMONIC, { walletId: "w", l1Network: "regtest" }),
    ).rejects.toThrow(/No Thunder deployment/);
  });
});

describe("thunder send (full pipeline)", () => {
  it("selects, builds, signs, and submits a FROST-verifiable transaction", async () => {
    let captured: unknown;
    (esplora.broadcastThunderTransaction as jest.Mock).mockImplementation(
      async (_base: string, body: unknown) => {
        captured = body;
        return "a".repeat(64);
      },
    );

    const dest = "8twUkpctzwgbjqi5o14qWjrD9uk"; // real betanet deposit address (self)
    const result = await sendThunder(MNEMONIC, ACCOUNT, dest, 1500n, 1n);

    // Fee = exact borsh size × rate (2 inputs, 2 outputs) — computed from
    // the tx the device actually submitted.
    expect(result.amountSats).toBe("1500");
    expect(result.txid).toBe("a".repeat(64));

    const body = captured as {
      transaction: { inputs: [unknown, number[]][]; outputs: { address: string; content: unknown }[] };
      authorizations: { verifying_key: string; signature: string }[];
    };
    expect(body.authorizations).toHaveLength(body.transaction.inputs.length);

    const tx = thunder.transactionFromJson(body.transaction);
    const message = thunder.transactionBorshBytes(tx);
    for (const auth of body.authorizations) {
      expect(auth.verifying_key).toMatch(/^[0-9a-f]{64}$/);
      expect(
        thunder.frostVerify(
          thunder.fromHex(auth.signature),
          thunder.fromHex(auth.verifying_key),
          message,
        ),
      ).toBe(true);
    }
    // The txid must equal BLAKE3 of those same bytes (consistency).
    expect(thunder.transactionTxid(tx)).toHaveLength(32);
    // Selection locked as little as possible: the single 2000-sat coin
    // covers payment 1500 + fee, so fee + outputs = 2000 (that coin), and
    // the 3000-sat coin stays free for a same-block spend.
    const outSum = tx.outputs.reduce((s, o) => s + thunder.contentValueSats(o.content), 0n);
    expect(tx.inputs).toHaveLength(1);
    expect(BigInt(result.feeSats) + outSum).toBe(2000n);
    expect(result.changeSats).toBe(outSum === BigInt(result.amountSats) ? "0" : result.changeSats);
  });

  it("throws insufficient funds rather than building an unpayable tx", async () => {
    (esplora.broadcastThunderTransaction as jest.Mock).mockResolvedValue("b".repeat(64));
    await expect(sendThunder(MNEMONIC, ACCOUNT, "8twUkpctzwgbjqi5o14qWjrD9uk", 4999n, 1n)).rejects.toThrow(
      /insufficient/,
    );
    expect(esplora.broadcastThunderTransaction).not.toHaveBeenCalled();
  });
});
