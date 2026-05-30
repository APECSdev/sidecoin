// packages/desktop/src/__tests__/DashboardView.test.ts
//
// Tests for DashboardView.vue.
// Covers loading state, balance display, block info display,
// fork countdown banner, error state, and the formatSats helper logic.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import DashboardView from "../views/DashboardView.vue";

// ---------------------------------------------------------------------------
// Mock @tauri-apps/api/core — the desktop views call invoke() directly
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  mockInvoke.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "get_balance":
        return { confirmed: 0, unconfirmed: 0, total: 0 };
      case "get_latest_block":
        return {
          height: 0,
          hash: "0000000000000000000000000000000000000000000000000000000000000000",
          timestamp: 0,
        };
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DashboardView.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render the Dashboard heading", async () => {
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.find("h2").text()).toBe("Dashboard");
  });

  it("should display total balance formatted as coin", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "get_balance":
          return { confirmed: 100000000, unconfirmed: 0, total: 100000000 };
        case "get_latest_block":
          return { height: 0, hash: "00".repeat(32), timestamp: 0 };
        default:
          throw new Error(`Unknown command: ${cmd}`);
      }
    });
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("1.00000000");
  });

  it("should display zero balance correctly", async () => {
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("0.00000000");
  });

  it("should display confirmed and unconfirmed labels", async () => {
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("Confirmed:");
    expect(wrapper.text()).toContain("Unconfirmed:");
  });

  it("should display 'eCash' currency label", async () => {
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("eCash");
  });

  it("should display block height", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "get_balance":
          return { confirmed: 0, unconfirmed: 0, total: 0 };
        case "get_latest_block":
          return {
            height: 964001,
            hash: "000000000000000000abcdef1234567890abcdef1234567890abcdef12345678",
            timestamp: 1787320800,
          };
        default:
          throw new Error(`Unknown command: ${cmd}`);
      }
    });
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("964,001");
  });

  it("should display block hash", async () => {
    const testHash = "000000000000000000abcdef1234567890abcdef1234567890abcdef12345678";
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "get_balance":
          return { confirmed: 0, unconfirmed: 0, total: 0 };
        case "get_latest_block":
          return { height: 964001, hash: testHash, timestamp: 1787320800 };
        default:
          throw new Error(`Unknown command: ${cmd}`);
      }
    });
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain(testHash);
  });

  it("should display 'Height:' and 'Hash:' labels", async () => {
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("Height:");
    expect(wrapper.text()).toContain("Hash:");
  });

  it("should render the fork countdown banner", async () => {
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("eCash Hard Fork");
    expect(wrapper.text()).toContain("2026-08-21 15:00Z");
    expect(wrapper.text()).toContain("Block ~964,000");
  });

  it("should render BIP-300/301 drivechain info in fork banner", async () => {
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("BIP-300 / BIP-301 Drivechains");
    expect(wrapper.text()).toContain("7 sidechains at launch");
  });

  it("should show error state when invoke fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInvoke.mockRejectedValue(new Error("Connection refused"));
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("Error loading wallet data");
    expect(wrapper.text()).toContain("Connection refused");
    consoleSpy.mockRestore();
  });

  it("should log error to console when invoke fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInvoke.mockRejectedValue(new Error("Timeout"));
    mount(DashboardView);
    await flushPromises();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[DashboardView] Failed to load data:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("should call invoke for get_balance and get_latest_block on mount", async () => {
    mount(DashboardView);
    await flushPromises();
    expect(mockInvoke).toHaveBeenCalledWith("get_balance");
    expect(mockInvoke).toHaveBeenCalledWith("get_latest_block");
  });

  it("should display 'Total Balance' label", async () => {
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("Total Balance");
  });

  it("should display 'Latest Block' label", async () => {
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("Latest Block");
  });

  it("should format large satoshi amounts correctly", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "get_balance":
          return {
            confirmed: 2100000000000000,
            unconfirmed: 0,
            total: 2100000000000000,
          };
        case "get_latest_block":
          return { height: 0, hash: "00".repeat(32), timestamp: 0 };
        default:
          throw new Error(`Unknown command: ${cmd}`);
      }
    });
    const wrapper = mount(DashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain("21000000.00000000");
  });
});
