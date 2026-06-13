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

  it("renders Thunder-specific overview actions", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    expect(wrapper.text()).toContain("Create invoice");
    expect(wrapper.text()).toContain("Send payment");
    expect(wrapper.text()).toContain("Channel liquidity");
    expect(wrapper.text()).toContain("Liquidity planner");
  });

  it("can switch to the Thunder Payments tab", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    const payments = wrapper.findAll("button").find((b) => b.text() === "Payments");
    expect(payments).toBeDefined();

    await payments!.trigger("click");

    expect(wrapper.text()).toContain("Thunder Payments");
    expect(wrapper.text()).toContain("Send Payment");
    expect(wrapper.text()).toContain("Create Invoice");
    expect(wrapper.text()).toContain("Route estimate");
    expect(wrapper.text()).toContain("Payment ID");
    expect(wrapper.text()).toContain("thunder-pay-7f4a");
  });

  it("can switch to the Thunder Channels tab", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    const channels = wrapper.findAll("button").find((b) => b.text() === "Channels");
    expect(channels).toBeDefined();

    await channels!.trigger("click");

    expect(wrapper.text()).toContain("Thunder Channels");
    expect(wrapper.text()).toContain("Open channels");
    expect(wrapper.text()).toContain("Inbound liquidity");
    expect(wrapper.text()).toContain("Outbound liquidity");
    expect(wrapper.text()).toContain("Average health");
    expect(wrapper.text()).toContain("routing-peer-01");
    expect(wrapper.text()).toContain("merchant-hub");
    expect(wrapper.text()).toContain("backup-route");
  });

  it("can switch to the Thunder Liquidity tab", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    const liquidity = wrapper.findAll("button").find((b) => b.text() === "Liquidity");
    expect(liquidity).toBeDefined();

    await liquidity!.trigger("click");

    expect(wrapper.text()).toContain("Liquidity Planner");
    expect(wrapper.text()).toContain("Available to send");
    expect(wrapper.text()).toContain("Available to receive");
    expect(wrapper.text()).toContain("Route coverage");
    expect(wrapper.text()).toContain("Suggested action");
    expect(wrapper.text()).toContain("Recommendations");
    expect(wrapper.text()).toContain("Add inbound capacity");
    expect(wrapper.text()).toContain("Display-only liquidity view");
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
