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
      { path: "/pro", name: "pro", component: { template: "<div />" } },
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
    expect(wrapper.text()).toContain("Overview");
    expect(wrapper.text()).toContain("Parent Chain");
    expect(wrapper.text()).toContain("Activity");
    expect(wrapper.text()).toContain("Payments");
  });

  it("renders horizontal feature tabs for Basic platforms", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    expect(wrapper.text()).toContain("Payments");
    expect(wrapper.text()).toContain("Channels");
    expect(wrapper.text()).toContain("Liquidity");
  });

  it("renders a clear PRO CTA for gated platforms", async () => {
    const wrapper = await mountPlatform("/platforms/zside");
    expect(wrapper.text()).toContain("Unlock zSide with Sidecoin PRO");
    expect(wrapper.text()).toContain("Platform wallet preview");
    expect(wrapper.text()).toContain("Historical analysis across platforms");
    expect(wrapper.text()).toContain("Early access to proposed platforms like RISCy");
  });

  it("can switch feature tabs", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const records = wrapper.findAll("button").find((b) => b.text() === "Records");
    expect(records).toBeDefined();

    await records!.trigger("click");
    expect(wrapper.text()).toContain("Manage records");
  });

  it("renders BitNames Contacts and Messages tabs", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    expect(wrapper.text()).toContain("Contacts");
    expect(wrapper.text()).toContain("Messages");
    expect(wrapper.text()).toContain("demo conversation events");
  });

  it("can switch to the BitNames Contacts tab", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const contacts = wrapper.findAll("button").find((b) => b.text() === "Contacts");
    expect(contacts).toBeDefined();

    await contacts!.trigger("click");

    expect(wrapper.text()).toContain("BitNames contacts");
    expect(wrapper.text()).toContain("alice.bit");
    expect(wrapper.text()).toContain("merchant.bit");
    expect(wrapper.text()).toContain("support.bit");
    expect(wrapper.text()).toContain("Contact profile preview");
  });

  it("can open the BitNames Messages preview from Contacts", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const contacts = wrapper.findAll("button").find((b) => b.text() === "Contacts");
    expect(contacts).toBeDefined();

    await contacts!.trigger("click");

    const message = wrapper.findAll("button").find((b) => b.text() === "Message");
    expect(message).toBeDefined();

    await message!.trigger("click");

    expect(wrapper.text()).toContain("BitNames Messages");
    expect(wrapper.text()).toContain("Demo conversation");
    expect(wrapper.text()).toContain("No network calls, signing, encryption claims, or message");
    expect(wrapper.text()).toContain("Send disabled");
  });

  it("can switch directly to the BitNames Messages tab", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const messages = wrapper.findAll("button").find((b) => b.text() === "Messages");
    expect(messages).toBeDefined();

    await messages!.trigger("click");

    expect(wrapper.text()).toContain("BitNames Messages");
    expect(wrapper.text()).toContain("Chatting as");
    expect(wrapper.text()).toContain("sidecoin.bit");
    expect(wrapper.text()).toContain("Preview only");
    const textarea = wrapper.find("textarea");
    expect(textarea.exists()).toBe(true);
    expect(textarea.attributes("placeholder")).toBe(
      "Messaging preview disabled until BitNames messaging is connected.",
    );
  });

  it("shows a not-found state for unknown platforms", async () => {
    const wrapper = await mountPlatform("/platforms/unknown");
    expect(wrapper.text()).toContain("Platform not found");
  });
});
