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

  it("shows the BTC staging address wizard step", () => {
    const wrapper = mount(ToolboxView);
    expect(wrapper.text()).toContain("Generate BTC staging address");
    expect(wrapper.text()).toContain("BTC staging address");
    expect(wrapper.text()).toContain("Funding QR");
  });

  it("can navigate to the destination confirmation step", async () => {
    const wrapper = mount(ToolboxView);
    const destinationStep = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Confirm destinations"));

    expect(destinationStep).toBeDefined();
    await destinationStep!.trigger("click");

    expect(wrapper.text()).toContain("Current eCash wallet");
    expect(wrapper.text()).toContain("BTC return address");
    expect(wrapper.text()).toContain("choose a safe BTC destination");
  });

  it("explains wallet-native coin splitting safety", () => {
    const wrapper = mount(ToolboxView);
    expect(wrapper.text()).toContain("local keystore");
    expect(wrapper.text()).toContain("explicit coin selection");
    expect(wrapper.text()).toContain("separate website or third-party tool");
  });
});
