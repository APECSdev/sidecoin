// packages/wallet/src/__tests__/PlatformDetailView.test.ts

import { beforeEach, describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import PlatformDetailView from "../views/PlatformDetailView.vue";
import SidechainsView from "../views/SidechainsView.vue";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    getCoinNewsFeeds: vi.fn(),
    getCoinNewsPosts: vi.fn(),
  };
});

import { getCoinNewsFeeds, getCoinNewsPosts } from "../api";

const mockGetCoinNewsFeeds = vi.mocked(getCoinNewsFeeds);
const mockGetCoinNewsPosts = vi.mocked(getCoinNewsPosts);


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
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCoinNewsFeeds.mockResolvedValue([
      {
        id: "us-weekly",
        name: "US Weekly",
        language: "en",
        enabled: true,
        post_count: 1,
      },
      {
        id: "japan-weekly",
        name: "Japan Weekly",
        language: "ja",
        enabled: true,
        post_count: 1,
      },
    ]);
    mockGetCoinNewsPosts.mockImplementation(async (feedId: string) => ({
      feed: {
        id: feedId,
        name: feedId === "japan-weekly" ? "Japan Weekly" : "US Weekly",
      },
      posts: [
        {
          id: `post_${feedId}`,
          title: feedId === "japan-weekly" ? "Live API Japan post" : "Live API wallet post",
          body: null,
          link: null,
          author: null,
          created_at: 1781568001,
          fee_sats: "1108",
          flag: null,
          txid: "a".repeat(64),
          status: "confirmed",
        },
      ],
      next_cursor: null,
    }));
  });


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
    expect(wrapper.text()).toContain("No live Thunder payments are indexed yet.");
    expect(wrapper.text()).not.toContain("thunder-pay-7f4a");
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
    expect(wrapper.text()).toContain("No live Thunder channels are indexed yet.");
    expect(wrapper.text()).not.toContain("routing-peer-01");
    expect(wrapper.text()).not.toContain("merchant-hub");
    expect(wrapper.text()).not.toContain("backup-route");
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
    expect(wrapper.text()).toContain("No live Thunder liquidity recommendations are indexed yet.");
    expect(wrapper.text()).toContain("No live Thunder liquidity diagnostics are indexed yet.");
    expect(wrapper.text()).not.toContain("Add inbound capacity");
    expect(wrapper.text()).not.toContain("Display-only liquidity view");
  });

  it("renders a clear PRO CTA for gated platforms", async () => {
    const wrapper = await mountPlatform("/platforms/zside");
    expect(wrapper.text()).toContain("Unlock zSide with Sidecoin PRO");
    expect(wrapper.text()).toContain("Platform wallet");
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
    expect(wrapper.text()).toContain("Live message data not indexed yet");
    expect(wrapper.text()).not.toContain("demo conversation events");
  });

  it("can switch to the BitNames Contacts tab", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const contacts = wrapper.findAll("button").find((b) => b.text() === "Contacts");
    expect(contacts).toBeDefined();

    await contacts!.trigger("click");

    expect(wrapper.text()).toContain("BitNames contacts");
    expect(wrapper.text()).toContain("No live BitNames contacts are indexed yet.");
    expect(wrapper.text()).toContain("No live BitNames contact is selected.");
    expect(wrapper.text()).toContain("Contact profile");
    expect(wrapper.text()).not.toContain("alice.bit");
    expect(wrapper.text()).not.toContain("merchant.bit");
    expect(wrapper.text()).not.toContain("support.bit");
  });

  it("shows an empty BitNames contact state instead of fake contacts", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const contacts = wrapper.findAll("button").find((b) => b.text() === "Contacts");
    expect(contacts).toBeDefined();

    await contacts!.trigger("click");

    expect(wrapper.text()).toContain("No live BitNames contacts are indexed yet.");
    expect(wrapper.text()).not.toContain("alice.bit");
    expect(wrapper.text()).not.toContain("merchant.bit");
    expect(wrapper.text()).not.toContain("support.bit");
  });

  it("can switch directly to the BitMessages tab", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const messages = wrapper.findAll("button").find((b) => b.text() === "Messages");
    expect(messages).toBeDefined();

    await messages!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("BitMessages");
    expect(wrapper.text()).toContain("Live Coin News");
    expect(wrapper.text()).toContain("US Weekly");
    expect(wrapper.text()).toContain("Japan Weekly");
    expect(wrapper.text()).toContain("Date");
    expect(wrapper.text()).toContain("Fee");
    expect(wrapper.text()).toContain("Title");
    expect(wrapper.text()).toContain("Live API Japan post");
    expect(wrapper.text()).toContain("No live BitNames contacts are indexed yet.");
    expect(wrapper.text()).toContain("No live BitNames messages are indexed yet.");
  });

  it("opens the local Coin News OP_RETURN composer from BitMessages", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const messages = wrapper.findAll("button").find((b) => b.text() === "Messages");
    expect(messages).toBeDefined();

    await messages!.trigger("click");
    await flushPromises();

    const broadcast = wrapper
      .findAll("button")
      .find((button) => button.text() === "Broadcast News" && button.attributes("disabled") === undefined);
    expect(broadcast).toBeDefined();

    await broadcast!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Compose Coin News");
    expect(wrapper.text()).toContain("Local OP_RETURN signing");
    expect(wrapper.text()).toContain("Build Signed News Transaction");
    expect(wrapper.text()).toContain("Public and permanent");
  });

  it("opens the local Coin News OP_RETURN composer from the sidebar button", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const messages = wrapper.findAll("button").find((b) => b.text() === "Messages");
    expect(messages).toBeDefined();

    await messages!.trigger("click");
    await flushPromises();

    const sidebarButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Open Feed Composer");
    expect(sidebarButton).toBeDefined();
    expect(sidebarButton!.attributes("disabled")).toBeUndefined();

    await sidebarButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Compose Coin News");
    expect(wrapper.text()).toContain("Local OP_RETURN signing");
    expect(wrapper.text()).toContain("Build Signed News Transaction");
    expect(wrapper.text()).toContain("Public and permanent");
  });


  it("does not render backend warning copy in the BitMessages screenshot UI", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const messages = wrapper.findAll("button").find((b) => b.text() === "Messages");
    expect(messages).toBeDefined();

    await messages!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("display-only");
    expect(wrapper.text()).not.toContain("no messages leave your wallet");
    expect(wrapper.text()).not.toContain("live messaging is connected");
    expect(wrapper.text()).not.toContain("Messaging preview disabled");
    expect(wrapper.text()).not.toContain("No network calls");
    expect(wrapper.text()).not.toContain("Send disabled");
    expect(wrapper.text()).not.toContain("SupaQt");
  });

  it("renders Elements Plus as a coming-soon platform with Slot TBD", async () => {
    const wrapper = await mountPlatform("/platforms/elementsplus");
    expect(wrapper.text()).toContain("Elements Plus");
    expect(wrapper.text()).toContain("Platform · Slot TBD");
    expect(wrapper.text()).toContain("Coming Soon");
    expect(wrapper.text()).toContain("Unlock Elements Plus with Sidecoin PRO");
  });

  it("shows a not-found state for unknown platforms", async () => {
    const wrapper = await mountPlatform("/platforms/unknown");
    expect(wrapper.text()).toContain("Platform not found");
  });
});
