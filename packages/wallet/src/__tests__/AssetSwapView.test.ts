// packages/wallet/src/__tests__/AssetSwapView.test.ts

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AssetSwapView from "../views/AssetSwapView.vue";

describe("AssetSwapView.vue", () => {
  it("renders the Asset Swap page", () => {
    const wrapper = mount(AssetSwapView);
    expect(wrapper.text()).toContain("Asset Swap");
    expect(wrapper.text()).toContain("DEX Preview");
  });

  it("renders standard DEX-style swap fields", () => {
    const wrapper = mount(AssetSwapView);
    expect(wrapper.text()).toContain("From");
    expect(wrapper.text()).toContain("To");
    expect(wrapper.text()).toContain("Route");
    expect(wrapper.text()).toContain("Slippage tolerance");
  });

  it("starts with swap execution unavailable", () => {
    const wrapper = mount(AssetSwapView);
    expect(wrapper.text()).toContain("Preview swap unavailable");
    expect(wrapper.text()).toContain("not a live exchange");
  });
});
