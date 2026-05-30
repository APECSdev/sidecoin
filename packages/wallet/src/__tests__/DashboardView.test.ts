// packages/wallet/src/__tests__/DashboardView.test.ts
//
// Tests for DashboardView.vue.
// Covers loading state, mock mode banner, balance display,
// block info display, fork countdown banner, error state,
// and the formatSats helper logic.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import DashboardView from "../views/DashboardView.vue";

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------

vi.mock("../api", () => ({
  getBalance: vi.fn(),
  getLatestBlock: vi.fn(),
  isMockMode: vi.fn(),
}));

import { getBalance, getLatestBlock, isMockMode } from "../api";

const mockGetBalance = vi.mocked(getBalance);
const mockGetLatestBlock = vi.mocked(getLatestBlock);
const mockIsMockMode = vi.mocked(isMockMode);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: "/", name: "dashboard", component: DashboardView },
    ],
  });
}

async function mountDashboard() {
  const router = createTestRouter();
  router.push("/");
  await router.isReady();

  const wrapper = mount(DashboardView, {
    global: {
      plugins: [router],
    },
  });

  await flushPromises();
  return wrapper;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DashboardView.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMockMode.mockReturnValue(true);
    mockGetBalance.mockResolvedValue({
      confirmed: 0,
      unconfirmed: 0,
      total: 0,
    });
    mockGetLatestBlock.mockResolvedValue({
      height: 0,
      hash: "0000000000000000000000000000000000000000000000000000000000000000",
      timestamp: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render the Dashboard heading", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.find("h2").text()).toBe("Dashboard");
  });

  it("should show mock mode banner when in demo mode", async () => {
    mockIsMockMode.mockReturnValue(true);
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Demo Mode");
    expect(wrapper.text()).toContain("No backend configured");
    expect(wrapper.text()).toContain("Connect a node in Settings");
  });

  it("should NOT show mock mode banner when connected to backend", async () => {
    mockIsMockMode.mockReturnValue(false);
    const wrapper = await mountDashboard();
    expect(wrapper.text()).not.toContain("Demo Mode");
  });

  it("should display total balance formatted as coin", async () => {
    mockGetBalance.mockResolvedValue({
      confirmed: 100000000,
      unconfirmed: 0,
      total: 100000000,
    });
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("1.00000000");
  });

  it("should display zero balance correctly", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("0.00000000");
  });

  it("should display confirmed and unconfirmed labels", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Confirmed:");
    expect(wrapper.text()).toContain("Unconfirmed:");
  });

  it("should display 'eCash' currency label", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("eCash");
  });

  it("should display block height", async () => {
    mockGetLatestBlock.mockResolvedValue({
      height: 964001,
      hash: "000000000000000000abcdef1234567890abcdef1234567890abcdef12345678",
      timestamp: 1787320800,
    });
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("964,001");
  });

  it("should display block hash", async () => {
    const testHash = "000000000000000000abcdef1234567890abcdef1234567890abcdef12345678";
    mockGetLatestBlock.mockResolvedValue({
      height: 964001,
      hash: testHash,
      timestamp: 1787320800,
    });
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain(testHash);
  });

  it("should display 'Height:' and 'Hash:' labels", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Height:");
    expect(wrapper.text()).toContain("Hash:");
  });

  it("should render the fork countdown banner", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("eCash Hard Fork");
    expect(wrapper.text()).toContain("2026-08-21 15:00Z");
    expect(wrapper.text()).toContain("Block ~964,000");
  });

  it("should render BIP-300/301 drivechain info in fork banner", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("BIP-300 / BIP-301 Drivechains");
    expect(wrapper.text()).toContain("7 sidechains at launch");
  });

  it("should show error state when API fails", async () => {
    mockGetBalance.mockRejectedValue(new Error("Connection refused"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Error loading wallet data");
    expect(wrapper.text()).toContain("Connection refused");
    consoleSpy.mockRestore();
  });

  it("should log error to console when API fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetBalance.mockRejectedValue(new Error("Timeout"));
    await mountDashboard();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[DashboardView] Failed to load data:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("should call getBalance and getLatestBlock on mount", async () => {
    await mountDashboard();
    expect(mockGetBalance).toHaveBeenCalledTimes(1);
    expect(mockGetLatestBlock).toHaveBeenCalledTimes(1);
  });

  it("should call isMockMode on mount", async () => {
    await mountDashboard();
    expect(mockIsMockMode).toHaveBeenCalled();
  });

  it("should display 'Total Balance' label", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Total Balance");
  });

  it("should display 'Latest Block' label", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Latest Block");
  });

  it("should format large satoshi amounts correctly", async () => {
    mockGetBalance.mockResolvedValue({
      confirmed: 2100000000000000,
      unconfirmed: 0,
      total: 2100000000000000,
    });
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("21000000.00000000");
  });
});
