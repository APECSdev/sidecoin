// packages/wallet/src/__tests__/DashboardView.test.ts
//
// Tests for DashboardView.vue.
// Covers loading/error states, platform activity fan-out, aggregate inflow,
// Basic/PRO dashboard card treatment, the fork banner, Demo Mode, the bigint
// formatSats helper, and the L1 wallet balance card.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import DashboardView from "../views/DashboardView.vue";
import { saveWallet } from "../keystore";
import { DEMO_MODE_STORAGE_KEY } from "../demo";

// ---------------------------------------------------------------------------
// Mock the API module
//
// Spread the REAL module (so satsToBtc — used in the template — stays the
// genuine lossless formatter) and override only the network data functions.
// ---------------------------------------------------------------------------

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    getSidechains: vi.fn(),
    getDeposits: vi.fn(),
    getL1Balance: vi.fn(),
  };
});

import { getSidechains, getDeposits, getL1Balance } from "../api";

const mockGetSidechains = vi.mocked(getSidechains);
const mockGetDeposits = vi.mocked(getDeposits);
const mockGetL1Balance = vi.mocked(getL1Balance);

const VALID_12 =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

// ---------------------------------------------------------------------------
// Fixtures
//
// Slots match the authoritative registry (sparse, per-proposal):
// thunder=9, bitnames=2, zside=98. Never sequential, never the array index.
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
    slot: 2,
    id: "bitnames",
    displayName: "BitNames",
    description: "Identity records",
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

function chainBalance(totalSats: bigint, seen: boolean) {
  return {
    chainId: "signet",
    address: "tb1qexample",
    source: "indexed" as const,
    totalSats,
    seen,
    updatedAtHeight: seen ? 210123 : null,
    note: "indexed balance from upstream (sats)",
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
    localStorage.clear(); // ensure the no-wallet (setup-required) L1 state
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

  it("should render Drivechains Financial Hub copy", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Drivechains Financial Hub");
  });

  it("should call getSidechains once on mount", async () => {
    await mountDashboard();
    expect(mockGetSidechains).toHaveBeenCalledTimes(1);
  });

  it("should call getDeposits once per platform slot", async () => {
    await mountDashboard();
    expect(mockGetDeposits).toHaveBeenCalledTimes(SUMMARIES.length);
    expect(mockGetDeposits).toHaveBeenCalledWith(9);
    expect(mockGetDeposits).toHaveBeenCalledWith(2);
    expect(mockGetDeposits).toHaveBeenCalledWith(98);
  });

  it("should display the platform activity label", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Platform Activity");
  });

  it("should sum inflow across platforms and format it", async () => {
    // 100000000 * 3 = 300000000 sats = 3.00000000
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("3.00000000");
  });

  it("should display the aggregate event and platform counts", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("3 events across 3 platforms");
  });

  it("should explain the financial hub activity model", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain(
      "Track balances, deposits, and platform activity across the Drivechains Financial Hub.",
    );
  });

  it("should render each platform displayName", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Thunder Network");
    expect(wrapper.text()).toContain("BitNames");
    expect(wrapper.text()).toContain("zSide");
  });

  it("should show active platform status badges", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Active");
  });

  it("should display open Basic platform activity and slot data", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("1 event · slot 9");
    expect(wrapper.text()).toContain("1 event · slot 2");
  });

  it("should show PRO treatment for premium platform analytics", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("PRO");
    expect(wrapper.text()).toContain("Unlock platform analytics with Sidecoin PRO.");
    expect(wrapper.text()).toContain("Unlock analytics");
  });

  it("should not render the broad historical analysis upsell on first landing", async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).not.toContain("Unlock Historical Analysis with Sidecoin PRO");
    expect(wrapper.text()).not.toContain("Historical portfolio analysis");
    expect(wrapper.text()).not.toContain("Advanced wallet insights");
    expect(wrapper.text()).not.toContain("Upgrade to PRO");
    expect(wrapper.text()).not.toContain("View PRO benefits");
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
    expect(wrapper.text()).toContain("7 platforms at launch");
  });

  it("should show a friendly error (not the raw error) when getSidechains fails", async () => {
    // The raw transport string must NOT leak to the user — it goes to the
    // console only. The UI shows a friendly, actionable message instead.
    mockGetSidechains.mockRejectedValue(new Error("Connection refused"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Error loading dashboard");
    expect(wrapper.text()).toContain(
      "We couldn't load your dashboard. Please check your connection and try again.",
    );
    // The raw error string is logged for developers, never rendered.
    expect(wrapper.text()).not.toContain("Connection refused");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[DashboardView] Failed to load data:",
      expect.any(Error),
    );
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

  it("should use Demo Mode display data when enabled", async () => {
    localStorage.setItem(DEMO_MODE_STORAGE_KEY, "1");

    const wrapper = await mountDashboard();

    expect(mockGetSidechains).not.toHaveBeenCalled();
    expect(mockGetDeposits).not.toHaveBeenCalled();
    expect(mockGetL1Balance).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Demo Mode");
    expect(wrapper.text()).toContain("Sample financial hub activity is enabled");
    expect(wrapper.text()).toContain("1.32257244");
    expect(wrapper.text()).toContain("28 events across 8 platforms");
    expect(wrapper.text()).toContain("RISCy");
  });

  // --- L1 wallet balance card ----------------------------------------------

  it("should show 'Wallet setup required' for the L1 balance when no wallet exists", async () => {
    // beforeEach cleared localStorage, so loadWallet() returns null.
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("L1 Wallet Balance");
    expect(wrapper.text()).toContain("Wallet setup required");
    expect(mockGetL1Balance).not.toHaveBeenCalled();
  });

  it("should display the derived L1 balance when a wallet exists", async () => {
    saveWallet(VALID_12);
    mockGetL1Balance.mockResolvedValue(chainBalance(133700000n, true));
    const wrapper = await mountDashboard();

    expect(mockGetL1Balance).toHaveBeenCalledTimes(1);
    // The address queried is the real BIP-84 signet receive address derived
    // from the stored mnemonic — never a hardcoded string.
    const queried = mockGetL1Balance.mock.calls[0][0];
    expect(queried.startsWith("tb1q")).toBe(true);

    // 133700000 sats = 1.337 BTC.
    expect(wrapper.text()).toContain("1.337");
    expect(wrapper.text()).toContain("BTC");
  });

  it("should show a not-yet-indexed note when the address is unseen", async () => {
    saveWallet(VALID_12);
    mockGetL1Balance.mockResolvedValue(chainBalance(0n, false));
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain("Address not yet seen on-chain");
  });
});
