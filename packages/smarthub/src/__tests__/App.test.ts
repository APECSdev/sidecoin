// packages/smarthub/src/__tests__/App.test.ts

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import App from "../App.vue";

describe("App", () => {
  it("renders the Smart Hub title", () => {
    const wrapper = mount(App);

    expect(wrapper.find("h1").attributes("aria-label")).toBe("Sidecoin Smart Hub");
    expect(wrapper.text()).toContain("SidΞcoin");
    expect(wrapper.text()).toContain("Smart Hub");
  });

  it("renders the coming soon banner", () => {
    const wrapper = mount(App);

    expect(wrapper.text()).toContain("Coming Soon...");
  });

  it("renders the Sidecoin challenge URI with a generated nonce", () => {
    const wrapper = mount(App);
    const text = wrapper.text();

    expect(text).toContain("sidecoin://hub/challenge");
    expect(text).toContain("hub=https%3A%2F%2Fhub.sidecoin.app");
    expect(text).toMatch(/nonce=[0-9a-f]{32}/);
    expect(text).not.toContain("nonce=coming-soon");
  });

  it("generates a fresh nonce for each mounted challenge", () => {
    const first = mount(App).text().match(/nonce=([0-9a-f]{32})/);
    const second = mount(App).text().match(/nonce=([0-9a-f]{32})/);

    expect(first?.[1]).toBeDefined();
    expect(second?.[1]).toBeDefined();
    expect(first?.[1]).not.toBe(second?.[1]);
  });

  it("tells users to scan with the Sidecoin app", () => {
    const wrapper = mount(App);

    expect(wrapper.text()).toContain("SCAN with your Sidecoin app");
    expect(wrapper.text()).toContain("secure portal challenge");
  });
});
