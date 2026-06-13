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

  it("warns users not to paste secrets", () => {
    const wrapper = mount(ToolboxView);
    expect(wrapper.text()).toContain("Never paste seed phrases or private keys");
  });
});
