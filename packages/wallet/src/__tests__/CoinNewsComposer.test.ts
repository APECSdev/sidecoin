// packages/wallet/src/__tests__/CoinNewsComposer.test.ts
//
// Direct tests for the Coin News composer. Covers field byte caps, local
// OP_RETURN build/sign review, no-wallet/truncated-UTXO safety, and broadcast.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../keystore", () => ({
  loadWallet: vi.fn(),
}));

vi.mock("@sidecoin/shared", () => ({
  buildAndSignOpReturnTransaction: vi.fn(),
  buildOpReturnScript: vi.fn(),
  deriveSigningKey: vi.fn(),
  encodeCoinNewsV2: vi.fn(),
  selectCoinsForOpReturn: vi.fn(),
}));

vi.mock("../api", () => {
  class ApiError extends Error {
    code: string;
    httpStatus: number;
    constructor(code: string, message: string, httpStatus = 0) {
      super(message);
      this.name = "ApiError";
      this.code = code;
      this.httpStatus = httpStatus;
    }
  }

  return {
    ApiError,
    L1_CHAIN_ID: "signet",
    broadcastTransaction: vi.fn(),
    getL1Utxos: vi.fn(),
    satsToBtc: (s: bigint) => s.toString(),
  };
});

import CoinNewsComposer from "../components/bitnames/CoinNewsComposer.vue";
import { loadWallet } from "../keystore";
import {
  buildAndSignOpReturnTransaction,
  buildOpReturnScript,
  deriveSigningKey,
  encodeCoinNewsV2,
  selectCoinsForOpReturn,
} from "@sidecoin/shared";
import {
  ApiError,
  broadcastTransaction,
  getL1Utxos,
} from "../api";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon about";

const KEY = {
  privateKey: new Uint8Array(32),
  publicKey: new Uint8Array(33),
  address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  scriptPubKey: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0x11)]),
  path: "m/84'/1'/0'/0/0",
  network: "signet",
  index: 0,
};

const READ_UTXO = {
  chainId: "signet",
  address: KEY.address,
  txid: "a".repeat(64),
  vout: 0,
  valueSats: 1_000_000n,
  scriptPubKey: "0014" + "11".repeat(20),
  confirmations: 200,
  blockHeight: 100,
  isCoinbase: false,
};

const PAYLOAD = new Uint8Array([0x43, 0x4e, 0x02, 0xa1, 0xa1, 0xa1, 0xa1, 0x05]);
const OP_RETURN_SCRIPT = new Uint8Array([0x6a, PAYLOAD.length, ...PAYLOAD]);

const SELECTION = {
  selectedUtxos: [
    {
      txid: READ_UTXO.txid,
      vout: READ_UTXO.vout,
      amountSatoshis: READ_UTXO.valueSats,
      scriptPubKey: READ_UTXO.scriptPubKey,
      address: READ_UTXO.address,
      derivationPath: "",
      confirmations: READ_UTXO.confirmations,
      isLocked: false,
      blockHeight: READ_UTXO.blockHeight,
      isCoinbase: READ_UTXO.isCoinbase,
    },
  ],
  feeSatoshis: 120n,
  changeSatoshis: 999_880n,
  hasChange: true,
  totalInputSatoshis: 1_000_000n,
  numOutputs: 2,
};

const SIGNED = {
  hex: "02000000000101" + "00".repeat(50),
  txid: "f".repeat(64),
  vsize: 120,
  feeSatoshis: 120n,
  changeSatoshis: 999_880n,
  totalInputSatoshis: 1_000_000n,
  hasChange: true,
};

function mountComposer() {
  return mount(CoinNewsComposer);
}

async function fillDraft(wrapper: ReturnType<typeof mountComposer>) {
  await wrapper.find("select").setValue("japan-weekly");
  await wrapper.find("input[type='text']").setValue(" Introducing SidΞcoin ");
  await wrapper.find("input[type='url']").setValue(" https://sidecoin.app/markets ");
  await wrapper.find("textarea").setValue(" Line 1\\nLine 2 ");
}

async function buildDraft(wrapper: ReturnType<typeof mountComposer>) {
  await fillDraft(wrapper);
  await wrapper.find("form").trigger("submit.prevent");
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(loadWallet).mockReturnValue({
    version: 1,
    network: "signet",
    mnemonic: VALID_MNEMONIC,
    createdAt: 0,
  });

  vi.mocked(encodeCoinNewsV2).mockReturnValue(PAYLOAD as never);
  vi.mocked(buildOpReturnScript).mockReturnValue(OP_RETURN_SCRIPT as never);
  vi.mocked(deriveSigningKey).mockReturnValue(KEY as never);
  vi.mocked(getL1Utxos).mockResolvedValue({
    chainId: "signet",
    address: KEY.address,
    utxos: [READ_UTXO],
    truncated: false,
  } as never);
  vi.mocked(selectCoinsForOpReturn).mockReturnValue(SELECTION as never);
  vi.mocked(buildAndSignOpReturnTransaction).mockReturnValue(SIGNED as never);
  vi.mocked(broadcastTransaction).mockResolvedValue({
    chainId: "signet",
    txid: SIGNED.txid,
    accepted: true,
    broadcastAt: 123,
  } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CoinNewsComposer.vue", () => {
  it("renders the composer and payload cap guidance", () => {
    const wrapper = mountComposer();

    expect(wrapper.text()).toContain("Compose Coin News");
    expect(wrapper.text()).toContain("Local OP_RETURN signing");
    expect(wrapper.text()).toContain("Public and permanent");
    expect(wrapper.text()).toContain("Title, link, and body are each capped at 255 UTF-8 bytes.");
    expect(wrapper.text()).toContain("0 / 255 bytes");
  });

  it("disables build until a title is entered", async () => {
    const wrapper = mountComposer();
    const button = wrapper.find("button[type='submit']");

    expect(button.attributes("disabled")).toBeDefined();

    await wrapper.find("input[type='text']").setValue("Hello");

    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("updates byte counters using UTF-8 byte length", async () => {
    const wrapper = mountComposer();

    await wrapper.find("input[type='text']").setValue("SidΞcoin");

    expect(wrapper.text()).toContain("9 / 255 bytes");
  });

  it("builds and signs a reviewed Coin News transaction", async () => {
    const wrapper = mountComposer();

    await buildDraft(wrapper);

    expect(encodeCoinNewsV2).toHaveBeenCalledWith({
      feed: "japan-weekly",
      title: "Introducing SidΞcoin",
      link: "https://sidecoin.app/markets",
      body: "Line 1\\nLine 2",
    });
    expect(buildOpReturnScript).toHaveBeenCalledWith(PAYLOAD);
    expect(deriveSigningKey).toHaveBeenCalledWith(VALID_MNEMONIC, "signet", 0);
    expect(getL1Utxos).toHaveBeenCalledWith(KEY.address);
    expect(selectCoinsForOpReturn).toHaveBeenCalledWith({
      utxos: expect.arrayContaining([
        expect.objectContaining({
          txid: READ_UTXO.txid,
          amountSatoshis: READ_UTXO.valueSats,
        }),
      ]),
      opReturnScriptLength: OP_RETURN_SCRIPT.length,
      feeRateSatPerVb: 1,
    });
    expect(buildAndSignOpReturnTransaction).toHaveBeenCalledWith({
      network: "signet",
      selectedUtxos: SELECTION.selectedUtxos,
      opReturnScript: OP_RETURN_SCRIPT,
      feeSatoshis: SELECTION.feeSatoshis,
      changeScriptPubKey: KEY.scriptPubKey,
      signingKeys: [KEY],
    });

    expect(wrapper.text()).toContain("Signed locally, ready to broadcast");
    expect(wrapper.text()).toContain(SIGNED.txid);
    expect(wrapper.text()).toContain("8 bytes");
  });

  it("shows a no-wallet setup error", async () => {
    vi.mocked(loadWallet).mockReturnValue(null);
    const wrapper = mountComposer();

    await wrapper.find("input[type='text']").setValue("Hello");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.text()).toContain("No wallet found");
    expect(deriveSigningKey).not.toHaveBeenCalled();
  });

  it("refuses to build from a truncated UTXO set", async () => {
    vi.mocked(getL1Utxos).mockResolvedValue({
      chainId: "signet",
      address: KEY.address,
      utxos: [READ_UTXO],
      truncated: true,
    } as never);

    const wrapper = mountComposer();

    await wrapper.find("input[type='text']").setValue("Hello");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.text()).toContain("truncated");
    expect(selectCoinsForOpReturn).not.toHaveBeenCalled();
  });

  it("broadcasts the reviewed transaction and shows the receipt", async () => {
    const wrapper = mountComposer();

    await buildDraft(wrapper);

    const broadcast = wrapper
      .findAll("button")
      .find((button) => button.text() === "Broadcast News Transaction");
    expect(broadcast).toBeDefined();

    await broadcast!.trigger("click");
    await flushPromises();

    expect(broadcastTransaction).toHaveBeenCalledWith("signet", SIGNED.hex);
    expect(wrapper.text()).toContain("Broadcast receipt");
    expect(wrapper.text()).toContain("Accepted");
    expect(wrapper.text()).toContain(SIGNED.txid);
  });

  it("surfaces a broadcast ApiError with its code", async () => {
    vi.mocked(broadcastTransaction).mockRejectedValue(
      new ApiError("rejected", "transaction rejected by node", 422),
    );

    const wrapper = mountComposer();

    await buildDraft(wrapper);

    const broadcast = wrapper
      .findAll("button")
      .find((button) => button.text() === "Broadcast News Transaction");
    expect(broadcast).toBeDefined();

    await broadcast!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Broadcast failed (rejected)");
    expect(wrapper.text()).toContain("transaction rejected by node");
  });
});
