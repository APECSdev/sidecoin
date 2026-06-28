// packages/wallet/src/__tests__/HardwareWalletView.test.ts

import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import HardwareWalletView from "../views/HardwareWalletView.vue";
import type { HardwareWallet } from "../hardware/types";

function fakeWallet(overrides: Partial<HardwareWallet> = {}): HardwareWallet {
  return {
    name: "OneKey",
    connect: vi.fn().mockResolvedValue(undefined),
    getAddress: vi.fn().mockResolvedValue({
      path: "m/84'/0'/0'/0/0",
      address: "bc1qexampleaddress",
      publicKey: "02abcd",
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("HardwareWalletView", () => {
  it("renders OneKey integration copy", () => {
    const wallet = fakeWallet();
    const w = mount(HardwareWalletView, { props: { wallet } });

    expect(w.text()).toContain("OneKey integration");
    expect(w.text()).toContain("Hardware Wallet");
    expect(w.text()).toContain("WebUSB required");
  });

  it("connects then derives and displays an address", async () => {
    const wallet = fakeWallet();
    const w = mount(HardwareWalletView, { props: { wallet } });

    await w.find("button").trigger("click"); // Connect
    await flushPromises();
    expect(wallet.connect).toHaveBeenCalled();

    const getBtn = w.findAll("button").find((b) => b.text() === "Show address")!;
    await getBtn.trigger("click");
    await flushPromises();

    expect(wallet.getAddress).toHaveBeenCalledWith("m/84'/1'/0'/0/0", {
      coin: "test",
      showOnDevice: true,
    });
    expect(w.get('[data-test="hw-address"]').text()).toContain("bc1qexample");
  });

  it("surfaces connection errors", async () => {
    const wallet = fakeWallet({
      connect: vi.fn().mockRejectedValue(new Error("No OneKey device found.")),
    });
    const w = mount(HardwareWalletView, { props: { wallet } });
    await w.find("button").trigger("click");
    await flushPromises();
    expect(w.get('[data-test="hw-error"]').text()).toContain("No OneKey device");
  });
});
