// packages/wallet/src/__tests__/PlatformDetailView.test.ts

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import PlatformDetailView from "../views/PlatformDetailView.vue";
import SidechainsView from "../views/SidechainsView.vue";

async function mountPlatform(path: string) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: "/platforms", name: "platforms", component: SidechainsView },
      { path: "/platforms/:platformId", name: "platform-detail", component: PlatformDetailView },
    ],
  });

  router.push(path);
  await router.isReady();

  return mount(PlatformDetailView, {
    global: {
      plugins: [router],
    },
  });
}

describe("PlatformDetailView.vue", () => {
  it("renders Thunder as a dedicated platform page", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    expect(wrapper.text()).toContain("Thunder Network");
    expect(wrapper.text()).toContain("Platform · Slot 9");
    expect(wrapper.text()).toContain("Payments");
  });

  it("renders horizontal feature tabs", async () => {
    const wrapper = await mountPlatform("/platforms/zside");
    expect(wrapper.text()).toContain("Shield");
    expect(wrapper.text()).toContain("Private Send");
    expect(wrapper.text()).toContain("Unshield");
  });

  it("can switch feature tabs", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const records = wrapper.findAll("button").find((b) => b.text() === "Records");
    expect(records).toBeDefined();

    await records!.trigger("click");
    expect(wrapper.text()).toContain("Manage records");
  });

  it("shows a not-found state for unknown platforms", async () => {
    const wrapper = await mountPlatform("/platforms/unknown");
    expect(wrapper.text()).toContain("Platform not found");
  });
});
