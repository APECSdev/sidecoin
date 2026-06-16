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

  it("explains that live swaps require SupaQt backend support", () => {
    const wrapper = mount(AssetSwapView);
    expect(wrapper.text()).toContain("Backend integration pending");
    expect(wrapper.text()).toContain("waiting on SupaQt swap backend support");
    expect(wrapper.text()).toContain("Live swap requirements");
  });

  it("renders standard DEX-style swap fields without enabling execution", () => {
    const wrapper = mount(AssetSwapView);
    expect(wrapper.text()).toContain("From");
    expect(wrapper.text()).toContain("To");
    expect(wrapper.text()).toContain("Route");
    expect(wrapper.text()).toContain("Slippage tolerance");
    expect(wrapper.text()).toContain("Network fee");
    expect(wrapper.text()).toContain("Requires live quote API");
  });

  it("shows the disabled preview-only action", () => {
    const wrapper = mount(AssetSwapView);
    const button = wrapper
      .findAll("button")
      .find((candidate) => candidate.text() === "Swaps are preview-only");

    expect(button?.exists()).toBe(true);
    expect(button?.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).not.toContain("Review swap");
    expect(wrapper.text()).not.toContain("Execute swap");
    expect(wrapper.text()).not.toContain("Broadcast");
  });

  it("renders planned safety warnings", () => {
    const wrapper = mount(AssetSwapView);
    expect(wrapper.text()).toContain("Swap safety preview");
    expect(wrapper.text()).toContain("Quotes can expire before signing.");
    expect(wrapper.text()).toContain("Fees and route availability can change.");
    expect(wrapper.text()).toContain("Settlement may take multiple confirmations.");
  });
});
