// packages/wallet/src/__tests__/App.test.ts
//
// Tests for the root App.vue component.
// Verifies the navigation, branding, route links, theme class, and main
// content area.

import { beforeEach, describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import { createPinia } from "pinia";
import { defineComponent, h } from "vue";
import App from "../App.vue";
import { THEME_STORAGE_KEY } from "../theme";

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
    history: createWebHashHistory(),
    routes: [
      { path: "/", name: "dashboard", component: createStubComponent("Dashboard") },
      { path: "/send", name: "send", component: createStubComponent("Send") },
      { path: "/receive", name: "receive", component: createStubComponent("Receive") },
      { path: "/swap", name: "swap", component: createStubComponent("Swap") },
      { path: "/platforms", name: "platforms", component: createStubComponent("Platforms") },
      { path: "/hardware", name: "hardware", component: createStubComponent("Hardware") },
      { path: "/toolbox", name: "toolbox", component: createStubComponent("Toolbox") },
      { path: "/pro", name: "pro", component: createStubComponent("Pro") },
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

describe("App.vue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should render the app title 'Sidecoin'", async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain("Sidecoin");
  });

  it("should render the subtitle 'Drivechains Financial Hub'", async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain("Drivechains Financial Hub");
  });

  it("should not render the 'Web Edition' label", async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).not.toContain("Web Edition");
  });

  it("should render the fork countdown date", async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain("2026-08-21 15:00Z");
  });

  it("should use the default theme class by default", async () => {
    const wrapper = await mountApp();
    expect(wrapper.classes()).toContain("theme-default");
  });

  it("should apply a persisted Rosé theme class", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "rose");
    const wrapper = await mountApp();
    expect(wrapper.classes()).toContain("theme-rose");
  });

  it("should apply a persisted Cypherpunk theme class", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "cypherpunk");
    const wrapper = await mountApp();
    expect(wrapper.classes()).toContain("theme-cypherpunk");
  });

  it("should render navigation links for all 8 primary wallet routes", async () => {
    const wrapper = await mountApp();
    const hrefs = wrapper.findAll("a").map((l) => l.attributes("href"));

    expect(hrefs).toContain("#/");
    expect(hrefs).toContain("#/send");
    expect(hrefs).toContain("#/receive");
    expect(hrefs).toContain("#/swap");
    expect(hrefs).toContain("#/platforms");
    expect(hrefs).toContain("#/hardware");
    expect(hrefs).toContain("#/toolbox");
    expect(hrefs).toContain("#/settings");
    expect(hrefs).toContain("#/pro");
  });

  it("should render navigation link text for all primary routes", async () => {
    const wrapper = await mountApp();
    const nav = wrapper.find("nav");

    expect(nav.text()).toContain("Home");
    expect(nav.text()).toContain("Send");
    expect(nav.text()).toContain("Receive");
    expect(nav.text()).toContain("Swap");
    expect(nav.text()).toContain("Platforms");
    expect(nav.text()).toContain("Hardware");
    expect(nav.text()).toContain("Tools");
    expect(nav.text()).toContain("Settings");
    expect(nav.text()).toContain("Upgrade to PRO");
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
    expect(wrapper.find("main").text()).toContain("Dashboard");
  });
});
