// packages/wallet/src/__tests__/ReceiveView.test.ts
//
// Tests for ReceiveView.vue.
//
// Address issuance is derived from the wallet key. Until a wallet exists, the
// view shows a "wallet setup required" pending state. When a wallet exists,
// the page renders the tabbed receive experience, QR section, address metadata,
// payment-code preview, and receive history.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../keystore", () => ({
  loadWallet: vi.fn(),
}));

vi.mock("@sidecoin/shared", () => ({
  deriveReceiveAddress: vi.fn(),
}));

import ReceiveView from "../views/ReceiveView.vue";
import { loadWallet } from "../keystore";
import { deriveReceiveAddress } from "@sidecoin/shared";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_12 =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const DERIVED_ADDRESS =
  "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";

function mountReceive() {
  return mount(ReceiveView);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadWallet).mockReturnValue(null);
  vi.mocked(deriveReceiveAddress).mockReturnValue(DERIVED_ADDRESS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReceiveView.vue", () => {
  it("should render the 'Receive eCash' heading", () => {
    const wrapper = mountReceive();
    expect(wrapper.find("h2").text()).toBe("Receive eCash");
  });

  it("should render L1 wallet context", () => {
    const wrapper = mountReceive();
    expect(wrapper.text()).toContain("L1 Wallet");
    expect(wrapper.text()).toContain("Generate your wallet receive address");
  });

  it("should show the wallet-setup pending state", () => {
    const wrapper = mountReceive();
    expect(wrapper.text()).toContain("Wallet setup required");
  });

  it("should explain addresses are derived from the wallet key", () => {
    const wrapper = mountReceive();
    expect(wrapper.text()).toContain("derived from your wallet key");
  });

  it("should not render the copy address button while no address exists", () => {
    const wrapper = mountReceive();
    expect(wrapper.text()).not.toContain("Copy Address");
  });

  it("should not render the QR section while no address exists", () => {
    const wrapper = mountReceive();
    expect(wrapper.text()).not.toContain("Scan this QR code");
  });

  it("should derive and display the receive address when a wallet exists", async () => {
    vi.mocked(loadWallet).mockReturnValue({
      version: 1,
      network: "signet",
      mnemonic: VALID_12,
      createdAt: 0,
    });

    const wrapper = mountReceive();
    await flushPromises();

    expect(deriveReceiveAddress).toHaveBeenCalledWith(VALID_12, "signet", 0);
    expect(wrapper.text()).toContain(DERIVED_ADDRESS);
  });

  it("should render receive tabs when an address exists", async () => {
    vi.mocked(loadWallet).mockReturnValue({
      version: 1,
      network: "signet",
      mnemonic: VALID_12,
      createdAt: 0,
    });

    const wrapper = mountReceive();
    await flushPromises();

    expect(wrapper.text()).toContain("Address");
    expect(wrapper.text()).toContain("Payment Code");
    expect(wrapper.text()).toContain("History");
  });

  it("should show address metadata on the Address tab", async () => {
    vi.mocked(loadWallet).mockReturnValue({
      version: 1,
      network: "signet",
      mnemonic: VALID_12,
      createdAt: 0,
    });

    const wrapper = mountReceive();
    await flushPromises();

    expect(wrapper.text()).toContain("Address details");
    expect(wrapper.text()).toContain("Network");
    expect(wrapper.text()).toContain("Signet");
    expect(wrapper.text()).toContain("Native SegWit");
    expect(wrapper.text()).toContain("m/84'/1'/0'/0/0");
  });

  it("can switch to the Payment Code tab", async () => {
    vi.mocked(loadWallet).mockReturnValue({
      version: 1,
      network: "signet",
      mnemonic: VALID_12,
      createdAt: 0,
    });

    const wrapper = mountReceive();
    await flushPromises();

    const paymentCode = wrapper
      .findAll("button")
      .find((button) => button.text() === "Payment Code");

    expect(paymentCode).toBeDefined();
    await paymentCode!.trigger("click");

    expect(wrapper.text()).toContain("Payment code preview");
    expect(wrapper.text()).toContain(`sidecoin:receive:${DERIVED_ADDRESS}`);
    expect(wrapper.text()).toContain("BitNames receiving");
  });

  it("can switch to the History tab", async () => {
    vi.mocked(loadWallet).mockReturnValue({
      version: 1,
      network: "signet",
      mnemonic: VALID_12,
      createdAt: 0,
    });

    const wrapper = mountReceive();
    await flushPromises();

    const history = wrapper
      .findAll("button")
      .find((button) => button.text() === "History");

    expect(history).toBeDefined();
    await history!.trigger("click");

    expect(wrapper.text()).toContain("Receive history");
    expect(wrapper.text()).toContain("Primary receive");
    expect(wrapper.text()).toContain("Ready");
  });

  it("should show an error if address derivation fails", async () => {
    vi.mocked(loadWallet).mockReturnValue({
      version: 1,
      network: "signet",
      mnemonic: VALID_12,
      createdAt: 0,
    });
    vi.mocked(deriveReceiveAddress).mockImplementation(() => {
      throw new Error("derivation failed");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const wrapper = mountReceive();
    await flushPromises();

    expect(wrapper.text()).toContain("Address unavailable");
    expect(wrapper.text()).toContain(
      "Unable to derive a receive address from the stored key.",
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[ReceiveView] Failed to derive address:",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Network selector + address index cycling (session-only, not persisted)
  // -------------------------------------------------------------------------

  it("should render the Signet + Alphanet network selector when a wallet exists", async () => {
    vi.mocked(loadWallet).mockReturnValue({
      version: 1,
      network: "signet",
      mnemonic: VALID_12,
      createdAt: 0,
    });

    const wrapper = mountReceive();
    await flushPromises();

    expect(wrapper.text()).toContain("Receive to network");
    expect(wrapper.text()).toContain("session-only");
    expect(wrapper.text()).toContain("Signet");
    expect(wrapper.text()).toContain("Alphanet");
  });

  it("should default the selector to the wallet's persisted network (signet)", async () => {
    vi.mocked(loadWallet).mockReturnValue({
      version: 1,
      network: "signet",
      mnemonic: VALID_12,
      createdAt: 0,
    });

    mountReceive();
    await flushPromises();

    expect(deriveReceiveAddress).toHaveBeenCalledWith(VALID_12, "signet", 0);
  });

  it("should re-derive with alphanet + coin type 0 when Alphanet is selected", async () => {
    vi.mocked(loadWallet).mockReturnValue({
      version: 1,
      network: "signet",
      mnemonic: VALID_12,
      createdAt: 0,
    });

    const wrapper = mountReceive();
    await flushPromises();

    const alphanet = wrapper
      .findAll("button")
      .find((b) => b.text() === "Alphanet");
    expect(alphanet).toBeDefined();
    await alphanet!.trigger("click");

    expect(deriveReceiveAddress).toHaveBeenCalledWith(VALID_12, "alphanet", 0);
    expect(wrapper.text()).toContain("Alphanet");
    expect(wrapper.text()).toContain("m/84'/0'/0'/0/0");
  });

  it("should cycle the address index when Generate New Address is clicked", async () => {
    vi.mocked(loadWallet).mockReturnValue({
      version: 1,
      network: "signet",
      mnemonic: VALID_12,
      createdAt: 0,
    });

    const wrapper = mountReceive();
    await flushPromises();

    const gen = wrapper
      .findAll("button")
      .find((b) => b.text() === "Generate New Address");
    expect(gen).toBeDefined();
    await gen!.trigger("click");

    expect(deriveReceiveAddress).toHaveBeenCalledWith(VALID_12, "signet", 1);
    expect(wrapper.text()).toContain("m/84'/1'/0'/0/1");
    expect(wrapper.text()).toContain("Address index");
  });

  it("should reset the index to 0 when switching networks", async () => {
    vi.mocked(loadWallet).mockReturnValue({
      version: 1,
      network: "signet",
      mnemonic: VALID_12,
      createdAt: 0,
    });

    const wrapper = mountReceive();
    await flushPromises();

    const gen = wrapper
      .findAll("button")
      .find((b) => b.text() === "Generate New Address");
    await gen!.trigger("click");
    expect(deriveReceiveAddress).toHaveBeenLastCalledWith(VALID_12, "signet", 1);

    const alphanet = wrapper
      .findAll("button")
      .find((b) => b.text() === "Alphanet");
    await alphanet!.trigger("click");
    expect(deriveReceiveAddress).toHaveBeenLastCalledWith(VALID_12, "alphanet", 0);
  });
});
