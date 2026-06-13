// packages/wallet/src/__tests__/SendView.test.ts
//
// Tests for SendView.vue.
// Covers form rendering, tabbed layout, input binding, button disable states,
// and the real build -> review -> broadcast flow (heavy deps mocked at the
// module boundary).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// ---------------------------------------------------------------------------
// Module mocks (declared before importing the component under test)
// ---------------------------------------------------------------------------

vi.mock("../keystore", () => ({
  loadWallet: vi.fn(),
}));

vi.mock("@sidecoin/shared", () => ({
  deriveSigningKey: vi.fn(),
  selectCoins: vi.fn(),
  buildAndSignP2wpkhTransaction: vi.fn(),
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
    satsToBtc: (s: bigint) => s.toString(),
    getL1Utxos: vi.fn(),
    broadcastTransaction: vi.fn(),
  };
});

import SendView from "../views/SendView.vue";
import { loadWallet } from "../keystore";
import {
  deriveSigningKey,
  selectCoins,
  buildAndSignP2wpkhTransaction,
} from "@sidecoin/shared";
import { getL1Utxos, broadcastTransaction, ApiError } from "../api";

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

const SELECTION = {
  selectedUtxos: [],
  feeSatoshis: 141n,
  changeSatoshis: 899_859n,
  hasChange: true,
  totalInputSatoshis: 1_000_000n,
  numOutputs: 2,
};

const SIGNED = {
  hex: "02000000000101" + "00".repeat(50),
  txid: "f".repeat(64),
  vsize: 141,
  feeSatoshis: 141n,
  changeSatoshis: 899_859n,
  totalInputSatoshis: 1_000_000n,
  hasChange: true,
};

const DEST = "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountSend() {
  return mount(SendView);
}

async function fillAndSend(wrapper: ReturnType<typeof mountSend>) {
  const inputs = wrapper.findAll("input");
  await inputs[0].setValue(DEST);
  await inputs[1].setValue("0.005");
  await wrapper.find("form").trigger("submit.prevent");
  await flushPromises();
}

function broadcastButton(wrapper: ReturnType<typeof mountSend>) {
  return wrapper.findAll("button").find((b) => b.text() === "Broadcast");
}

beforeEach(() => {
  vi.mocked(loadWallet).mockReturnValue({
    version: 1,
    network: "signet",
    mnemonic: VALID_MNEMONIC,
    createdAt: 0,
  });
  vi.mocked(deriveSigningKey).mockReturnValue(KEY as never);
  vi.mocked(getL1Utxos).mockResolvedValue({
    chainId: "signet",
    address: KEY.address,
    utxos: [READ_UTXO],
    truncated: false,
  } as never);
  vi.mocked(selectCoins).mockReturnValue(SELECTION as never);
  vi.mocked(buildAndSignP2wpkhTransaction).mockReturnValue(SIGNED as never);
  vi.mocked(broadcastTransaction).mockResolvedValue({
    chainId: "signet",
    txid: SIGNED.txid,
    accepted: true,
    broadcastAt: 123,
  } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Static rendering / binding (unchanged behavior)
// ---------------------------------------------------------------------------

describe("SendView.vue", () => {
  it("should render the 'Send eCash' heading", () => {
    const wrapper = mountSend();
    expect(wrapper.find("h2").text()).toBe("Send eCash");
  });

  it("should render L1 wallet context", () => {
    const wrapper = mountSend();
    expect(wrapper.text()).toContain("L1 Wallet");
    expect(wrapper.text()).toContain("Local signing");
  });

  it("should render Simple, Advanced and Review tabs", () => {
    const wrapper = mountSend();
    expect(wrapper.text()).toContain("Simple");
    expect(wrapper.text()).toContain("Advanced");
    expect(wrapper.text()).toContain("Review");
  });

  it("should render the recipient address input", () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    const addressInput = inputs.find(
      (i) => i.attributes("placeholder") === "ecash1q..."
    );
    expect(addressInput).toBeDefined();
  });

  it("should render the amount input", () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    const amountInput = inputs.find(
      (i) => i.attributes("placeholder") === "0.00000000"
    );
    expect(amountInput).toBeDefined();
  });

  it("should render the Review Transaction button", () => {
    const wrapper = mountSend();
    const button = wrapper.find("button[type='submit']");
    expect(button.exists()).toBe(true);
    expect(button.text()).toBe("Review Transaction");
  });

  it("should render 'Recipient Address' label", () => {
    const wrapper = mountSend();
    expect(wrapper.text()).toContain("Recipient Address");
  });

  it("should render 'Amount (eCash)' label", () => {
    const wrapper = mountSend();
    expect(wrapper.text()).toContain("Amount (eCash)");
  });

  it("should render fee policy and send safety copy", () => {
    const wrapper = mountSend();
    expect(wrapper.text()).toContain("Fee policy");
    expect(wrapper.text()).toContain("1 sat/vB");
    expect(wrapper.text()).toContain("Send safety");
    expect(wrapper.text()).toContain("Broadcast happens only after review.");
  });

  it("should disable the Review Transaction button when address is empty", () => {
    const wrapper = mountSend();
    const button = wrapper.find("button[type='submit']");
    expect(button.attributes("disabled")).toBeDefined();
  });

  it("should disable the Review Transaction button when amount is empty", async () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("ecash1qtest");
    const button = wrapper.find("button[type='submit']");
    expect(button.attributes("disabled")).toBeDefined();
  });

  it("should enable the Review Transaction button when both fields are filled", async () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("ecash1qtest");
    await inputs[1].setValue("1.0");
    const button = wrapper.find("button[type='submit']");
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("should render a form element", () => {
    const wrapper = mountSend();
    expect(wrapper.find("form").exists()).toBe(true);
  });

  it("should bind v-model on address input", async () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("bc1qtest123");
    expect((inputs[0].element as HTMLInputElement).value).toBe("bc1qtest123");
  });

  it("should bind v-model on amount input", async () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    await inputs[1].setValue("0.001");
    expect((inputs[1].element as HTMLInputElement).value).toBe("0.001");
  });

  it("should show the PRO Coin Control preview on the Advanced tab", async () => {
    const wrapper = mountSend();
    const advanced = wrapper
      .findAll("button")
      .find((button) => button.text() === "Advanced");

    expect(advanced).toBeDefined();
    await advanced!.trigger("click");

    expect(wrapper.text()).toContain("Advanced send tools");
    expect(wrapper.text()).toContain("Coin Control");
    expect(wrapper.text()).toContain("Manual UTXO selection");
    expect(wrapper.text()).toContain("Sidecoin PRO");
  });

  it("should show an empty review state before a transaction is built", async () => {
    const wrapper = mountSend();
    const review = wrapper
      .findAll("button")
      .find((button) => button.text() === "Review");

    expect(review).toBeDefined();
    await review!.trigger("click");

    expect(wrapper.text()).toContain("No transaction built yet");
    expect(wrapper.text()).toContain("Open Simple Send");
  });

  // -------------------------------------------------------------------------
  // Build -> review -> broadcast flow
  // -------------------------------------------------------------------------

  it("builds and signs on submit, showing the txid and a Broadcast button", async () => {
    const wrapper = mountSend();
    await fillAndSend(wrapper);

    expect(deriveSigningKey).toHaveBeenCalledWith(VALID_MNEMONIC, "signet", 0);
    expect(getL1Utxos).toHaveBeenCalledWith(KEY.address);
    expect(selectCoins).toHaveBeenCalled();
    expect(buildAndSignP2wpkhTransaction).toHaveBeenCalled();
    expect(wrapper.text()).toContain("Signed locally, ready to broadcast");
    expect(wrapper.text()).toContain(SIGNED.txid);
    expect(broadcastButton(wrapper)).toBeDefined();
  });

  it("passes the recipient, amount and selection fee to the builder", async () => {
    const wrapper = mountSend();
    await fillAndSend(wrapper);

    const args = vi.mocked(buildAndSignP2wpkhTransaction).mock.calls[0][0];
    expect(args.toAddress).toBe(DEST);
    expect(args.amountSatoshis).toBe(500_000n); // 0.005 coins
    expect(args.feeSatoshis).toBe(SELECTION.feeSatoshis);
    expect(args.changeScriptPubKey).toBe(KEY.scriptPubKey);
    expect(args.signingKeys).toEqual([KEY]);
  });

  it("shows an error and does not build when no wallet exists", async () => {
    vi.mocked(loadWallet).mockReturnValue(null);
    const wrapper = mountSend();
    await fillAndSend(wrapper);

    expect(wrapper.text()).toContain("No wallet");
    expect(buildAndSignP2wpkhTransaction).not.toHaveBeenCalled();
  });

  it("shows an error for an invalid amount before any network call", async () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue(DEST);
    await inputs[1].setValue("abc");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.text()).toContain("Invalid amount");
    expect(getL1Utxos).not.toHaveBeenCalled();
  });

  it("refuses to build from a truncated UTXO set", async () => {
    vi.mocked(getL1Utxos).mockResolvedValue({
      chainId: "signet",
      address: KEY.address,
      utxos: [READ_UTXO],
      truncated: true,
    } as never);
    const wrapper = mountSend();
    await fillAndSend(wrapper);

    expect(wrapper.text()).toContain("truncated");
    expect(selectCoins).not.toHaveBeenCalled();
  });

  it("surfaces an insufficient-funds error from coin selection", async () => {
    vi.mocked(selectCoins).mockImplementation(() => {
      throw new Error("Insufficient funds: cannot cover target plus fee.");
    });
    const wrapper = mountSend();
    await fillAndSend(wrapper);

    expect(wrapper.text()).toContain("Insufficient funds");
    expect(broadcastButton(wrapper)).toBeUndefined();
  });

  it("broadcasts the built transaction and shows the receipt", async () => {
    const wrapper = mountSend();
    await fillAndSend(wrapper);
    await broadcastButton(wrapper)!.trigger("click");
    await flushPromises();

    expect(broadcastTransaction).toHaveBeenCalledWith("signet", SIGNED.hex);
    expect(wrapper.text()).toContain("Broadcast receipt");
    expect(wrapper.text().toLowerCase()).toContain("accepted");
    expect(wrapper.text()).toContain(SIGNED.txid);
  });

  it("surfaces a broadcast ApiError with its code", async () => {
    vi.mocked(broadcastTransaction).mockRejectedValue(
      new ApiError("rejected", "transaction rejected by node", 422),
    );
    const wrapper = mountSend();
    await fillAndSend(wrapper);
    await broadcastButton(wrapper)!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("rejected");
  });
});
