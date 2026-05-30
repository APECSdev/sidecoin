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
// ---------------------------------------------------------------------------

const MOCK_SIDECHAINS = [
  { slot: 0, name: "Thunder Network", description: "Payment channels.", active: true },
  { slot: 1, name: "zSide", description: "Privacy sidechain.", active: true },
  { slot: 2, name: "BitNames", description: "Naming system.", active: true },
  { slot: 3, name: "BitAssets", description: "Tokenized assets.", active: true },
  { slot: 4, name: "Photon", description: "EVM-compatible.", active: true },
  { slot: 5, name: "Truthcoin", description: "Prediction markets.", active: true },
  { slot: 6, name: "CoinShift", description: "Atomic swaps.", active: true },
  { slot: 7, name: "Sidechain #8 (TBA)", description: "Reserved.", active: false },
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
      expect(wrapper.text()).toContain(sc.name);
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
    expect(wrapper.text()).not.toContain("Slot 0");
  });
});
