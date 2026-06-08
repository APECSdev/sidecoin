// packages/wallet/src/__tests__/DashboardView.test.ts
//
// Tests for DashboardView.vue.
// Covers loading/error states, the multi-sidechain deposit fan-out,
// aggregate inflow, per-chain breakdown, the fork banner, and the
// bigint formatSats helper.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import DashboardView from "../views/DashboardView.vue";

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------

vi.mock("../api", () => ({
  getSidechains: vi.fn(),
  getDeposits: vi.fn(),
}));

import { getSidechains, getDeposits } from "../api";

const mockGetSidechains = vi.mocked(getSidechains);
const mockGetDeposits = vi.mocked(getDeposits);

// ---------------------------------------------------------------------------
// Fixtures
//
// Slots match the authoritative registry (sparse, per-proposal):
// thunder=9, zside=98. Never sequential, never the array index.
// ---------------------------------------------------------------------------

const SUMMARIES = [
  {
    slot: 9,
    id: "thunder",
    displayName: "Thunder Network",
    description: "Payment channels",
    status: "active",
  },
  {
    slot: 98,
    id: "zside",
    displayName: "zSide",
    description: "Shielded txs",
    status: "active",
  },
];

function deposit(valueSats: bigint, slot: number) {
  return {
    slot,
    chainId: `chain-${slot}`,
    l1Txid: "a".repeat(64),
    vout: 0,
    ctipSeq: 1,
    address: "tb1qexample",
    valueSats,
    status: "credited",
    confirmations: 6,
    firstSeenTs: 1787320000,
    l1ConfirmedTs: 1787320600,
    l2CreditedTs: 1787321200,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [{ path: "/", name: "dashboard", component: DashboardView }],
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
    mockGetSidechains.mockResolvedValue(SUMMARIES);
    mockGetDeposits.mockImplementation(async (slot: number) => ({
      slot,
      chainId: `chain-${slot}`,
      provisioned: slot === 9,
      deposits: [deposit(100000000n, slot)],
      nextCursor: null,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render the Dashboard heading", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.find("h2").text()).toBe("Dashboard");
  });

  it("should call getSidechains once on mount", async () => {
    await mountDashboard();
    expect(mockGetSidechains).toHaveBeenCalledTimes(1);
  });

  it("should call getDeposits once per sidechain slot", async () => {
    await mountDashboard();
    expect(mockGetDeposits).toHaveBeenCalledTimes(SUMMARIES.length);
    expect(mockGetDeposits).toHaveBeenCalledWith(9);
    expect(mockGetDeposits).toHaveBeenCalledWith(98);
  });

  it("should display the aggregate inflow label", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Total Deposit Inflow (all chains)");
  });

  it("should sum inflow across chains and format it", async () => {
    // 100000000 + 100000000 = 200000000 sats = 2.00000000
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("2.00000000");
  });

  it("should display the aggregate deposit and chain counts", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("2 deposits across 2 sidechains");
  });

  it("should clarify this is derived inflow, not spendable balance", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("not spendable balance");
  });

  it("should render each sidechain displayName", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Thunder Network");
    expect(wrapper.text()).toContain("zSide");
  });

  it("should show a Provisioned badge for provisioned chains", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Provisioned");
  });

  it("should show a Pending badge for unprovisioned chains", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Pending");
  });

  it("should display per-chain deposit counts and slots", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("1 deposits · slot 9");
    expect(wrapper.text()).toContain("1 deposits · slot 98");
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

  it("should show error state when getSidechains fails", async () => {
    mockGetSidechains.mockRejectedValue(new Error("Connection refused"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Error loading dashboard");
    expect(wrapper.text()).toContain("Connection refused");
    consoleSpy.mockRestore();
  });

  it("should show error state when a getDeposits call fails", async () => {
    mockGetDeposits.mockRejectedValue(new Error("Slot unavailable"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Error loading dashboard");
    consoleSpy.mockRestore();
  });

  it("should log error to console when loading fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetSidechains.mockRejectedValue(new Error("Timeout"));
    await mountDashboard();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[DashboardView] Failed to load data:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("should format large satoshi sums correctly", async () => {
    mockGetSidechains.mockResolvedValue([SUMMARIES[0]]);
    mockGetDeposits.mockImplementation(async (slot: number) => ({
      slot,
      chainId: `chain-${slot}`,
      provisioned: true,
      deposits: [deposit(2100000000000000n, slot)],
      nextCursor: null,
    }));
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("21000000.00000000");
  });
});
