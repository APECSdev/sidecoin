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

  it("renders the Sidecoin challenge URI", () => {
    const wrapper = mount(App);

    expect(wrapper.text()).toContain("sidecoin://hub/challenge");
    expect(wrapper.text()).toContain("hub=https%3A%2F%2Fhub.sidecoin.app");
    expect(wrapper.text()).toContain("nonce=coming-soon");
  });

  it("tells users to scan with the Sidecoin app", () => {
    const wrapper = mount(App);

    expect(wrapper.text()).toContain("SCAN with your Sidecoin app");
    expect(wrapper.text()).toContain("secure portal challenge");
  });
});
