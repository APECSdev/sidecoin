// packages/wallet/src/__tests__/SidechainsView.test.ts
//
// Tests for SidechainsView.vue.
// Covers sidechain list rendering, slot display, active/pending badges,
// loading state, error state, and BIP info text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SidechainsView from "../views/SidechainsView.vue";

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------

vi.mock("../api", () => ({
  getSidechains: vi.fn(),
}));

import { getSidechains } from "../api";

const mockGetSidechains = vi.mocked(getSidechains);

// ---------------------------------------------------------------------------
// Helpers
//
// Slots MUST match the authoritative registry in
// packages/shared/src/sidechains/registry.ts. BIP-300 slots are SPARSE and
// assigned per proposal — never sequential, never the array index.
//   thunder=9 zside=98 bitnames=2 bitassets=4 photon=99 truthcoin=13
//   coinshift=255 riscy=3 (proposed)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SidechainsView.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSidechains.mockResolvedValue(MOCK_SIDECHAINS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render the 'Sidechains' heading", async () => {
    const wrapper = mount(SidechainsView);
    await flushPromises();
    expect(wrapper.find("h2").text()).toBe("Sidechains");
  });

  it("should render BIP-300/301 subtitle", async () => {
    const wrapper = mount(SidechainsView);
    await flushPromises();
    expect(wrapper.text()).toContain("BIP-300 / BIP-301 Drivechains");
    expect(wrapper.text()).toContain("7 sidechains at launch");
  });

  it("should render all 8 sidechain cards", async () => {
    const wrapper = mount(SidechainsView);
    await flushPromises();
    for (const sc of MOCK_SIDECHAINS) {
      expect(wrapper.text()).toContain(sc.displayName);
    }
  });

  it("should display sidechain descriptions", async () => {
    const wrapper = mount(SidechainsView);
    await flushPromises();
    for (const sc of MOCK_SIDECHAINS) {
      expect(wrapper.text()).toContain(sc.description);
    }
  });

  it("should display slot numbers for each sidechain", async () => {
    const wrapper = mount(SidechainsView);
    await flushPromises();
    for (const sc of MOCK_SIDECHAINS) {
      expect(wrapper.text()).toContain(`Slot ${sc.slot}`);
    }
  });

  it("should show 'Active' badge for active sidechains", async () => {
    const wrapper = mount(SidechainsView);
    await flushPromises();
    const html = wrapper.html();
    // 7 active sidechains should have "Active" text
    const activeMatches = html.match(/Active/g);
    expect(activeMatches).not.toBeNull();
    expect(activeMatches!.length).toBeGreaterThanOrEqual(7);
  });

  it("should show 'Pending' badge for inactive sidechains", async () => {
    const wrapper = mount(SidechainsView);
    await flushPromises();
    expect(wrapper.text()).toContain("Pending");
  });

  it("should call getSidechains on mount", async () => {
    mount(SidechainsView);
    await flushPromises();
    expect(mockGetSidechains).toHaveBeenCalledTimes(1);
  });

  it("should show error state when API fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSidechains.mockRejectedValue(new Error("Sidechain fetch failed"));
    const wrapper = mount(SidechainsView);
    await flushPromises();
    expect(wrapper.text()).toContain("Error loading sidechains");
    expect(wrapper.text()).toContain("Sidechain fetch failed");
    consoleSpy.mockRestore();
  });

  it("should log error to console when API fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSidechains.mockRejectedValue(new Error("Network down"));
    mount(SidechainsView);
    await flushPromises();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[SidechainsView] Failed to load sidechains:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("should render an empty list gracefully", async () => {
    mockGetSidechains.mockResolvedValue([]);
    const wrapper = mount(SidechainsView);
    await flushPromises();
    // Should still show heading and subtitle but no cards
    expect(wrapper.find("h2").text()).toBe("Sidechains");
    expect(wrapper.text()).not.toContain("Slot 9");
  });
});
