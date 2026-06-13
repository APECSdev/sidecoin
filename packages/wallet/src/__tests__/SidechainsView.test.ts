// packages/wallet/src/__tests__/SidechainsView.test.ts
//
// Tests for the Platforms list view.
// Covers platform list rendering, slot display, active/pending badges,
// loading state, error state, and BIP info text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import SidechainsView from "../views/SidechainsView.vue";

vi.mock("../api", () => ({
  getSidechains: vi.fn(),
}));

import { getSidechains } from "../api";

const mockGetSidechains = vi.mocked(getSidechains);

const MOCK_SIDECHAINS = [
  { slot: 9, id: "thunder", displayName: "Thunder Network", description: "Payment channels.", status: "active" },
  { slot: 98, id: "zside", displayName: "zSide", description: "Privacy sidechain.", status: "active" },
  { slot: 2, id: "bitnames", displayName: "BitNames", description: "Naming system.", status: "active" },
  { slot: 4, id: "bitassets", displayName: "BitAssets", description: "Tokenized assets.", status: "active" },
  { slot: 99, id: "photon", displayName: "Photon", description: "Post-quantum crypto.", status: "active" },
  { slot: 13, id: "truthcoin", displayName: "Truthcoin", description: "Prediction markets.", status: "active" },
  { slot: 255, id: "coinshift", displayName: "CoinShift", description: "Atomic swaps.", status: "active" },
  { slot: 3, id: "riscy", displayName: "RISCy", description: "Reserved — not activated.", status: "proposed" },
];

function createTestRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: "/platforms", name: "platforms", component: SidechainsView },
      { path: "/platforms/:platformId", name: "platform-detail", component: { template: "<div />" } },
      { path: "/pro", name: "pro", component: { template: "<div />" } },
    ],
  });
}

async function mountPlatforms() {
  const router = createTestRouter();
  router.push("/platforms");
  await router.isReady();

  const wrapper = mount(SidechainsView, {
    global: {
      plugins: [router],
    },
  });

  await flushPromises();
  return wrapper;
}

describe("Platforms view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSidechains.mockResolvedValue(MOCK_SIDECHAINS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render the 'Platforms' heading", async () => {
    const wrapper = await mountPlatforms();
    expect(wrapper.find("h2").text()).toBe("Platforms");
  });

  it("should render BIP-300/301 subtitle", async () => {
    const wrapper = await mountPlatforms();
    expect(wrapper.text()).toContain("Drivechains Financial Hub");
    expect(wrapper.text()).toContain("Sidecoin PRO unlocks");
    expect(wrapper.text()).toContain("early access to proposed platforms like RISCy");
  });

  it("should render all 8 platform cards", async () => {
    const wrapper = await mountPlatforms();
    for (const sc of MOCK_SIDECHAINS) {
      expect(wrapper.text()).toContain(sc.displayName);
    }
  });

  it("should display BitNames before Thunder while preserving the rest of the API order", async () => {
    const wrapper = await mountPlatforms();
    const headings = wrapper.findAll("h3").map((heading) => heading.text());

    expect(headings.slice(0, 4)).toEqual([
      "BitNames",
      "Thunder Network",
      "zSide",
      "BitAssets",
    ]);
  });

  it("should display platform descriptions", async () => {
    const wrapper = await mountPlatforms();
    for (const sc of MOCK_SIDECHAINS) {
      expect(wrapper.text()).toContain(sc.description);
    }
  });

  it("should display slot numbers for each platform", async () => {
    const wrapper = await mountPlatforms();
    for (const sc of MOCK_SIDECHAINS) {
      expect(wrapper.text()).toContain(`Slot ${sc.slot}`);
    }
  });

  it("should render platform detail links", async () => {
    const wrapper = await mountPlatforms();
    const hrefs = wrapper.findAll("a").map((a) => a.attributes("href"));
    expect(hrefs).toContain("#/platforms/thunder");
    expect(hrefs).toContain("#/platforms/zside");
    expect(hrefs).toContain("#/platforms/riscy");
  });

  it("should show 'Active' badge for active platforms", async () => {
    const wrapper = await mountPlatforms();
    const html = wrapper.html();
    const activeMatches = html.match(/Active/g);
    expect(activeMatches).not.toBeNull();
    expect(activeMatches!.length).toBeGreaterThanOrEqual(7);
  });

  it("should show 'Proposed' badge for proposed platforms", async () => {
    const wrapper = await mountPlatforms();
    expect(wrapper.text()).toContain("Proposed");
  });

  it("should call getSidechains on mount", async () => {
    await mountPlatforms();
    expect(mockGetSidechains).toHaveBeenCalledTimes(1);
  });

  it("should show error state when API fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSidechains.mockRejectedValue(new Error("Sidechain fetch failed"));
    const wrapper = await mountPlatforms();
    expect(wrapper.text()).toContain("Error loading platforms");
    expect(wrapper.text()).toContain("Sidechain fetch failed");
    consoleSpy.mockRestore();
  });

  it("should log error to console when API fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSidechains.mockRejectedValue(new Error("Network down"));
    await mountPlatforms();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[SidechainsView] Failed to load sidechains:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("should render an empty list gracefully", async () => {
    mockGetSidechains.mockResolvedValue([]);
    const wrapper = await mountPlatforms();
    expect(wrapper.find("h2").text()).toBe("Platforms");
    expect(wrapper.text()).not.toContain("Slot 9");
  });
});
