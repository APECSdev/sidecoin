// packages/desktop/src/__tests__/App.test.ts
//
// Tests for the root App.vue component.
// Verifies the navigation sidebar, branding, route links,
// fork countdown info, and main content area render correctly.

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createWebHistory } from "vue-router";
import { createPinia } from "pinia";
import { defineComponent, h } from "vue";
import App from "../App.vue";

// ---------------------------------------------------------------------------
// Helpers — create a test router with stub components
// ---------------------------------------------------------------------------

function createStubComponent(name: string) {
  return defineComponent({
    name,
    render() {
      return h("div", { class: `stub-${name.toLowerCase()}` }, name);
    },
  });
}

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: "/", name: "dashboard", component: createStubComponent("Dashboard") },
      { path: "/send", name: "send", component: createStubComponent("Send") },
      { path: "/receive", name: "receive", component: createStubComponent("Receive") },
      { path: "/sidechains", name: "sidechains", component: createStubComponent("Sidechains") },
      { path: "/settings", name: "settings", component: createStubComponent("Settings") },
    ],
  });
}

async function mountApp() {
  const router = createTestRouter();
  const pinia = createPinia();

  router.push("/");
  await router.isReady();

  return mount(App, {
    global: {
      plugins: [router, pinia],
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("App.vue", () => {
  it("should render the app title 'Sidecoin'", async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain("Sidecoin");
  });

  it("should render the subtitle 'eCash Drivechains Wallet'", async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain("eCash Drivechains Wallet");
  });

  it("should render the fork countdown date", async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain("2026-08-21 15:00Z");
  });

  it("should render the fork block estimate", async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain("block ~964,000");
  });

  it("should render 'eCash Hard Fork' text", async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain("eCash Hard Fork");
  });

  it("should render navigation links for all 5 routes", async () => {
    const wrapper = await mountApp();
    const links = wrapper.findAll("a");

    const hrefs = links.map((l) => l.attributes("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/send");
    expect(hrefs).toContain("/receive");
    expect(hrefs).toContain("/sidechains");
    expect(hrefs).toContain("/settings");
  });

  it("should render navigation link text for all routes", async () => {
    const wrapper = await mountApp();
    const nav = wrapper.find("nav");
    expect(nav.text()).toContain("Dashboard");
    expect(nav.text()).toContain("Send");
    expect(nav.text()).toContain("Receive");
    expect(nav.text()).toContain("Sidechains");
    expect(nav.text()).toContain("Settings");
  });

  it("should have a nav element", async () => {
    const wrapper = await mountApp();
    expect(wrapper.find("nav").exists()).toBe(true);
  });

  it("should have a main element", async () => {
    const wrapper = await mountApp();
    expect(wrapper.find("main").exists()).toBe(true);
  });

  it("should render the RouterView content area", async () => {
    const wrapper = await mountApp();
    // The stub Dashboard component should render inside main
    expect(wrapper.find("main").text()).toContain("Dashboard");
  });
});
