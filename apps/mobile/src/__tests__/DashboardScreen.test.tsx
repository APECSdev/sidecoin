// apps/mobile/src/__tests__/DashboardScreen.test.tsx
//
// Tests for the Dashboard screen — ported from
// apps/wallet/src/__tests__/DashboardView.test.ts and adapted to the React
// Native port. Covers loading/error states, platform activity fan-out,
// aggregate inflow, Basic/PRO dashboard card treatment, the fork banner, Demo
// Mode, the bigint formatSats helper, and the L1 wallet balance card.

import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";

import { DashboardScreen } from "../screens/DashboardScreen";

// ---------------------------------------------------------------------------
// Navigation — the dashboard navigates on its links and re-fetches the L1
// balance on focus. Both are no-ops here; useFocusEffect is turned into a
// plain mount effect so the focus refetch still runs.
// ---------------------------------------------------------------------------
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(cb, [cb]);
  },
}));

// ---------------------------------------------------------------------------
// Mock the API module
//
// Spread the REAL module (so satsToBtc — used in the template — stays the
// genuine lossless formatter) and override only the network data functions.
// ---------------------------------------------------------------------------
jest.mock("../api", () => {
  const actual = jest.requireActual("../api");
  return {
    ...actual,
    getSidechains: jest.fn(),
    getDeposits: jest.fn(),
    getL1Balance: jest.fn(),
    getCoinNewsFeeds: jest.fn(),
    getCoinNewsPosts: jest.fn(),
    getMarketPrice: jest.fn(),
  };
});

jest.mock("../keystore", () => ({
  loadWallet: jest.fn(async () => null),
  hasWallet: jest.fn(async () => false),
  saveWallet: jest.fn(async () => undefined),
  setWalletNetwork: jest.fn(async () => undefined),
  clearWallet: jest.fn(async () => undefined),
}));

// AsyncStorage backs Demo Mode. An in-memory store keeps the real ../demo
// helper (and its listener set) exercised rather than mocked.
jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        store.delete(k);
      }),
      clear: jest.fn(async () => {
        store.clear();
      }),
    },
  };
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getSidechains,
  getDeposits,
  getL1Balance,
  getCoinNewsFeeds,
  getCoinNewsPosts,
  getMarketPrice,
} from "../api";
import { loadWallet } from "../keystore";
import { DEMO_MODE_STORAGE_KEY } from "../demo";

const mockGetSidechains = getSidechains as jest.Mock;
const mockGetDeposits = getDeposits as jest.Mock;
const mockGetL1Balance = getL1Balance as jest.Mock;
const mockGetCoinNewsFeeds = getCoinNewsFeeds as jest.Mock;
const mockGetCoinNewsPosts = getCoinNewsPosts as jest.Mock;
const mockGetMarketPrice = getMarketPrice as jest.Mock;
const mockLoadWallet = loadWallet as jest.Mock;

// Default network is betanet, a mainnet fork, so it uses the "bc" HRP.
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

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear(); // ensure the no-wallet (setup-required) L1 state
  mockLoadWallet.mockResolvedValue(null);
  mockGetSidechains.mockResolvedValue(SUMMARIES);
  mockGetDeposits.mockImplementation(async (slot: number) => ({
    slot,
    chainId: `chain-${slot}`,
    provisioned: slot === 9,
    deposits: [deposit(100000000n, slot)],
    nextCursor: null,
  }));
  mockGetCoinNewsFeeds.mockResolvedValue([
    {
      id: "us-weekly",
      name: "US Weekly",
      language: "en",
      enabled: true,
      post_count: 1,
    },
  ]);
  mockGetCoinNewsPosts.mockResolvedValue({
    feed: { id: "us-weekly", name: "US Weekly" },
    posts: [
      {
        id: "post_live",
        title: "Live API wallet post",
        body: null,
        link: null,
        author: null,
        created_at: 1781568001,
        fee_sats: "1108",
        flag: 1,
        txid: "a".repeat(64),
        status: "confirmed",
      },
    ],
    next_cursor: null,
  });
  mockGetMarketPrice.mockResolvedValue({
    asset: "ECX",
    name: "eCash",
    price_usd: "30.00",
    source: "hardcoded",
    as_of: "2026-06-16T00:00:00Z",
  });
});

describe("DashboardScreen", () => {
  it("should render without crashing", async () => {
    const { toJSON } = render(<DashboardScreen />);
    await waitFor(() => {
      expect(mockGetSidechains).toHaveBeenCalled();
    });
    expect(toJSON()).not.toBeNull();
  });

  it("should render the Dashboard heading", async () => {
    render(<DashboardScreen />);
    expect(screen.getByText("Dashboard")).toBeTruthy();
  });

  it("should render Drivechains Financial Hub copy", async () => {
    render(<DashboardScreen />);
    expect(screen.getByText("Drivechains Financial Hub")).toBeTruthy();
  });

  it("should call getSidechains once on mount", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(mockGetSidechains).toHaveBeenCalledTimes(1);
    });
  });

  it("should call getDeposits once per platform slot", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(mockGetDeposits).toHaveBeenCalledTimes(SUMMARIES.length);
    });
    expect(mockGetDeposits).toHaveBeenCalledWith(9);
    expect(mockGetDeposits).toHaveBeenCalledWith(2);
    expect(mockGetDeposits).toHaveBeenCalledWith(98);
  });

  it("should display the platform activity label", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText("Platform Activity")).toBeTruthy();
    });
  });

  it("should sum inflow across platforms and format it", async () => {
    // 100000000 * 3 = 300000000 sats = 3.00000000
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/3\.00000000/)).toBeTruthy();
    });
  });

  it("should display the aggregate event and platform counts", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(
        screen.getByText(/3 events across 3 platforms/),
      ).toBeTruthy();
    });
  });

  it("should explain the financial hub activity model", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(
        screen.getByText(
          /Track balances, deposits, and platform activity across the/,
        ),
      ).toBeTruthy();
    });
  });

  it("should render each platform displayName", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText("Thunder Network")).toBeTruthy();
    });
    expect(screen.getByText("BitNames")).toBeTruthy();
    expect(screen.getByText("zSide")).toBeTruthy();
  });

  it("should show active platform status badges", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    });
  });

  it("should display open Basic platform activity and slot data", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/1 event · slot 9/)).toBeTruthy();
    });
    expect(screen.getByText(/1 event · slot 2/)).toBeTruthy();
  });

  it("should show PRO treatment for premium platform analytics", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(
        screen.getAllByText("Unlock platform analytics with Sidecoin PRO.").length,
      ).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Unlock analytics").length).toBeGreaterThan(0);
  });

  it("should not render the broad historical analysis upsell on first landing", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(mockGetSidechains).toHaveBeenCalled();
    });
    expect(
      screen.queryByText(/Unlock Historical Analysis with Sidecoin PRO/),
    ).toBeNull();
    expect(screen.queryByText(/Historical portfolio analysis/)).toBeNull();
    expect(screen.queryByText(/Advanced wallet insights/)).toBeNull();
    expect(screen.queryByText("Upgrade to PRO")).toBeNull();
    expect(screen.queryByText("View PRO benefits")).toBeNull();
  });

  it("should render the Coin News preview on first landing", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-summary-grid")).toBeTruthy();
    });
    expect(screen.getByTestId("dashboard-summary-values")).toBeTruthy();
    expect(screen.getAllByText("Coin News").length).toBeGreaterThan(0);
    expect(screen.getByText("Broadcast News")).toBeTruthy();
    expect(screen.getAllByText("US Weekly").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByText("Live API wallet post")).toBeTruthy();
    });
    expect(screen.getAllByText("Title").length).toBeGreaterThan(0);
    expect(mockGetCoinNewsPosts).toHaveBeenCalledWith("us-weekly", {
      limit: 5,
    });
  });

  it("should render the fork countdown banner", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/eCash Hard Fork/)).toBeTruthy();
    });
    expect(screen.getByText(/2026-10-31 15:00Z/)).toBeTruthy();
    expect(screen.getByText(/Block ~973,728/)).toBeTruthy();
  });

  it("should render BIP-300/301 drivechain info in fork banner", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/BIP-300 \/ BIP-301 Drivechains/)).toBeTruthy();
    });
    expect(screen.getByText(/7 platforms at launch/)).toBeTruthy();
  });

  it("should show a friendly error (not the raw error) when getSidechains fails", async () => {
    // The raw transport string must NOT leak to the user — it goes to the
    // console only. The UI shows a friendly, actionable message instead.
    mockGetSidechains.mockRejectedValue(new Error("Connection refused"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText("Error loading dashboard")).toBeTruthy();
    });
    expect(
      screen.getByText(
        "We couldn't load your dashboard. Please check your connection and try again.",
      ),
    ).toBeTruthy();
    // The raw error string is logged for developers, never rendered.
    expect(screen.queryByText("Connection refused")).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[DashboardScreen] Failed to load data:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("should show error state when a getDeposits call fails", async () => {
    mockGetDeposits.mockRejectedValue(new Error("Slot unavailable"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText("Error loading dashboard")).toBeTruthy();
    });
    consoleSpy.mockRestore();
  });

  it("should log error to console when loading fails", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetSidechains.mockRejectedValue(new Error("Timeout"));
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "[DashboardScreen] Failed to load data:",
        expect.any(Error),
      );
    });
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
    render(<DashboardScreen />);
    await waitFor(() => {
      // The aggregate card and the single-platform card both format the same
      // satoshi sum, so more than one match is expected.
      expect(
        screen.getAllByText(/21000000\.00000000/).length,
      ).toBeGreaterThan(0);
    });
  });

  it("should render the live ECX market price", async () => {
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText("ECX (Projected) Market Price")).toBeTruthy();
    });
    expect(screen.getByText(/USD 30\.00/)).toBeTruthy();
    expect(mockGetMarketPrice).toHaveBeenCalledWith("ecash");
    // Source is now eCash Farm (linked), not SupaQt.
    expect(screen.getByTestId("market-price-source")).toBeTruthy();
    expect(screen.getByText(/eCash Farm/)).toBeTruthy();
  });

  it("should use Demo Mode display data when enabled", async () => {
    await AsyncStorage.setItem(DEMO_MODE_STORAGE_KEY, "1");

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getAllByText("Demo Mode").length).toBeGreaterThan(0);
    });
    expect(mockGetSidechains).not.toHaveBeenCalled();
    expect(mockGetDeposits).not.toHaveBeenCalled();
    expect(mockGetL1Balance).not.toHaveBeenCalled();
    expect(
      screen.getByText("Sample financial hub activity is enabled"),
    ).toBeTruthy();
    expect(screen.getByText(/1\.32257244/)).toBeTruthy();
    expect(screen.getByText(/28 events across 8 platforms/)).toBeTruthy();
    expect(screen.getByText("RISCy")).toBeTruthy();
  });

  // --- L1 wallet balance card ----------------------------------------------

  it("should show 'Wallet setup required' for the L1 balance when no wallet exists", async () => {
    // beforeEach cleared storage, so loadWallet() resolves null.
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText("L1 Wallet Balance")).toBeTruthy();
    });
    expect(screen.getByText(/Wallet setup required/)).toBeTruthy();
    expect(mockGetL1Balance).not.toHaveBeenCalled();
  });

  it("should display the derived L1 balance when a wallet exists", async () => {
    mockLoadWallet.mockResolvedValue({
      mnemonic: VALID_12,
      network: "betanet",
      createdAt: 1787320000000,
      version: 1,
    });
    mockGetL1Balance.mockResolvedValue(chainBalance(133700000n, true));
    render(<DashboardScreen />);

    await waitFor(() => {
      expect(mockGetL1Balance).toHaveBeenCalledTimes(1);
    });
    // The address queried is the real BIP-84 receive address derived from the
    // stored mnemonic — never a hardcoded string. The default network is
    // betanet, which is a mainnet fork, so it uses the "bc" HRP.
    const queried = mockGetL1Balance.mock.calls[0][0];
    expect(queried.startsWith("bc1q")).toBe(true);

    // 133700000 sats = 1.337 eCash.
    await waitFor(() => {
      expect(screen.getAllByText(/1\.337/).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("eCash").length).toBeGreaterThan(0);
  });

  it("should show a balance skeleton while the L1 balance is in flight", async () => {
    // A promise that never settles keeps the card in its loading state, which
    // is the only way to observe the skeleton (the default mocks resolve on
    // the next microtask).
    mockLoadWallet.mockResolvedValue({
      mnemonic: VALID_12,
      network: "betanet",
      createdAt: 1787320000000,
      version: 1,
    });
    mockGetL1Balance.mockReturnValue(new Promise(() => {}));
    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-balance-skeleton")).toBeTruthy();
    });
    // The old plain-text placeholder must be gone, or the skeleton is additive.
    expect(screen.queryByText("Loading balance…")).toBeNull();
  });

  it("should replace the balance skeleton once the balance resolves", async () => {
    mockLoadWallet.mockResolvedValue({
      mnemonic: VALID_12,
      network: "betanet",
      createdAt: 1787320000000,
      version: 1,
    });
    mockGetL1Balance.mockResolvedValue(chainBalance(133700000n, true));
    render(<DashboardScreen />);

    // The real balance lands and the placeholder is torn down.
    await waitFor(() => {
      expect(screen.getAllByText(/1\.337/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByTestId("dashboard-balance-skeleton")).toBeNull();
  });

  it("should show a market skeleton while the price is in flight", async () => {
    mockGetMarketPrice.mockReturnValue(new Promise(() => {}));
    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-market-skeleton")).toBeTruthy();
    });
    expect(screen.queryByText("Loading market price…")).toBeNull();
  });

  it("should show a not-yet-indexed note when the address is unseen", async () => {
    mockLoadWallet.mockResolvedValue({
      mnemonic: VALID_12,
      network: "betanet",
      createdAt: 1787320000000,
      version: 1,
    });
    mockGetL1Balance.mockResolvedValue(chainBalance(0n, false));
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Address not yet seen on-chain/)).toBeTruthy();
    });
  });
});
