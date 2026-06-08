// packages/wallet/src/__tests__/ReceiveView.test.ts
//
// Tests for ReceiveView.vue.
//
// Address issuance is derived from the wallet key (Phase 3). Until then the
// view shows a "wallet setup required" pending state and renders no address,
// copy button, or QR. The address-display / copy / QR tests will return in
// Phase 3 once key derivation exists.

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReceiveView from "../views/ReceiveView.vue";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReceiveView.vue", () => {
  it("should render the 'Receive eCash' heading", () => {
    const wrapper = mount(ReceiveView);
    expect(wrapper.find("h2").text()).toBe("Receive eCash");
  });

  it("should show the wallet-setup pending state", () => {
    const wrapper = mount(ReceiveView);
    expect(wrapper.text()).toContain("Wallet setup required");
  });

  it("should explain addresses are derived from the wallet key", () => {
    const wrapper = mount(ReceiveView);
    expect(wrapper.text()).toContain("derived from your wallet key");
  });

  it("should not render a copy button while no address exists", () => {
    const wrapper = mount(ReceiveView);
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("should not render the QR placeholder while no address exists", () => {
    const wrapper = mount(ReceiveView);
    expect(wrapper.text()).not.toContain("QR code");
  });
});
