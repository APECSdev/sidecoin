// packages/wallet/src/__tests__/AssetSwapView.test.ts

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AssetSwapView from "../views/AssetSwapView.vue";

describe("AssetSwapView.vue", () => {
  it("renders the Asset Swap preview page", () => {
    const wrapper = mount(AssetSwapView);
    expect(wrapper.text()).toContain("Asset Swap");
    expect(wrapper.text()).toContain("Asset routing");
    expect(wrapper.text()).toContain("Preview mode");
  });

  it("renders marketing-friendly Signet swap copy", () => {
    const wrapper = mount(AssetSwapView);
    expect(wrapper.text()).toContain("Swap between eCash and Drivechain assets on Signet.");
    expect(wrapper.text()).toContain("Signet liquidity preview");
    expect(wrapper.text()).toContain("Drivechain Routing");
  });

  it("renders standard DEX-style swap fields", () => {
    const wrapper = mount(AssetSwapView);
    expect(wrapper.text()).toContain("From");
    expect(wrapper.text()).toContain("To");
    expect(wrapper.text()).toContain("Route");
    expect(wrapper.text()).toContain("Slippage tolerance");
    expect(wrapper.text()).toContain("Estimated fee");
    expect(wrapper.text()).toContain("Settlement path");
  });

  it("renders a polished preview quote action", () => {
    const wrapper = mount(AssetSwapView);
    expect(wrapper.text()).toContain("Preview quote");
    expect(wrapper.text()).toContain("Route Market");
    expect(wrapper.text()).toContain("Swap Flow");
  });

  it("does not render backend warning copy in the screenshot UI", () => {
    const wrapper = mount(AssetSwapView);
    expect(wrapper.text()).not.toContain("Backend integration pending");
    expect(wrapper.text()).not.toContain("SupaQt");
    expect(wrapper.text()).not.toContain("Live swap requirements");
    expect(wrapper.text()).not.toContain("Swap safety preview");
    expect(wrapper.text()).not.toContain("does not sign");
    expect(wrapper.text()).not.toContain("broadcast");
    expect(wrapper.text()).not.toContain("Requires live quote API");
    expect(wrapper.text()).not.toContain("Swaps are preview-only");
  });
});
