// packages/wallet/src/__tests__/ToolboxView.test.ts

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToolboxView from "../views/ToolboxView.vue";

describe("ToolboxView.vue", () => {
  it("renders the Toolbox page", () => {
    const wrapper = mount(ToolboxView);
    expect(wrapper.text()).toContain("Toolbox");
    expect(wrapper.text()).toContain("Wallet utilities");
  });

  it("includes the coin split helper", () => {
    const wrapper = mount(ToolboxView);
    expect(wrapper.text()).toContain("Coin Split Helper");
    expect(wrapper.text()).toContain("BTC/eCash fork");
  });

  it("shows the BTC staging address UI scaffold", () => {
    const wrapper = mount(ToolboxView);
    expect(wrapper.text()).toContain("BTC staging address");
    expect(wrapper.text()).toContain("QR Preview");
    expect(wrapper.text()).toContain("current eCash wallet");
  });

  it("explains wallet-native coin splitting safety", () => {
    const wrapper = mount(ToolboxView);
    expect(wrapper.text()).toContain("local keystore");
    expect(wrapper.text()).toContain("explicit coin selection");
    expect(wrapper.text()).toContain("separate website or third-party tool");
  });

  it("warns against blindly returning BTC to the detected source address", () => {
    const wrapper = mount(ToolboxView);
    expect(wrapper.text()).toContain("Do not silently return BTC");
    expect(wrapper.text()).toContain("exchange, custodian, or change address");
  });
});
