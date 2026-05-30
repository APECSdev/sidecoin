// packages/wallet/src/__tests__/SettingsView.test.ts
//
// Tests for SettingsView.vue.
// Covers form rendering, save functionality, mock/live mode banners,
// debug info section, and API integration.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SettingsView from "../views/SettingsView.vue";

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------

vi.mock("../api", () => ({
  getApiBaseUrl: vi.fn(),
  setApiBaseUrl: vi.fn(),
  isMockMode: vi.fn(),
}));

import { getApiBaseUrl, setApiBaseUrl, isMockMode } from "../api";

const mockGetApiBaseUrl = vi.mocked(getApiBaseUrl);
const mockSetApiBaseUrl = vi.mocked(setApiBaseUrl);
const mockIsMockMode = vi.mocked(isMockMode);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsView.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetApiBaseUrl.mockReturnValue("");
    mockIsMockMode.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should render the 'Settings' heading", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.find("h2").text()).toBe("Settings");
  });

  it("should show Demo Mode banner when in mock mode", () => {
    mockIsMockMode.mockReturnValue(true);
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Demo Mode Active");
    expect(wrapper.text()).toContain("Configure a node URL below");
  });

  it("should show Connected banner when not in mock mode", () => {
    mockIsMockMode.mockReturnValue(false);
    mockGetApiBaseUrl.mockReturnValue("http://127.0.0.1:8332");
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Connected");
    expect(wrapper.text()).toContain("http://127.0.0.1:8332");
  });

  it("should render Node RPC URL input", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Node RPC URL");
    const inputs = wrapper.findAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it("should render Electrum Server URL input", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Electrum Server URL");
    const inputs = wrapper.findAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("should have default Node URL of http://127.0.0.1:8332", () => {
    const wrapper = mount(SettingsView);
    const inputs = wrapper.findAll("input");
    expect((inputs[0].element as HTMLInputElement).value).toBe(
      "http://127.0.0.1:8332"
    );
  });

  it("should have default Electrum URL of tcp://127.0.0.1:50001", () => {
    const wrapper = mount(SettingsView);
    const inputs = wrapper.findAll("input");
    expect((inputs[1].element as HTMLInputElement).value).toBe(
      "tcp://127.0.0.1:50001"
    );
  });

  it("should populate Node URL from existing API config", () => {
    mockGetApiBaseUrl.mockReturnValue("http://mynode:8332");
    mockIsMockMode.mockReturnValue(false);
    const wrapper = mount(SettingsView);
    const inputs = wrapper.findAll("input");
    expect((inputs[0].element as HTMLInputElement).value).toBe(
      "http://mynode:8332"
    );
  });

  it("should render Save Settings button", () => {
    const wrapper = mount(SettingsView);
    const button = wrapper.find("button[type='submit']");
    expect(button.exists()).toBe(true);
    expect(button.text()).toBe("Save Settings");
  });

  it("should call setApiBaseUrl on save", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const wrapper = mount(SettingsView);
    await wrapper.find("form").trigger("submit.prevent");
    expect(mockSetApiBaseUrl).toHaveBeenCalledWith("http://127.0.0.1:8332");
    consoleSpy.mockRestore();
  });

  it("should change button text to 'Saved ✓' after saving", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const wrapper = mount(SettingsView);
    await wrapper.find("form").trigger("submit.prevent");
    const button = wrapper.find("button[type='submit']");
    expect(button.text()).toBe("Saved ✓");
    consoleSpy.mockRestore();
  });

  it("should revert button text after 2 seconds", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const wrapper = mount(SettingsView);
    await wrapper.find("form").trigger("submit.prevent");
    expect(wrapper.find("button[type='submit']").text()).toBe("Saved ✓");

    vi.advanceTimersByTime(2000);
    await flushPromises();

    expect(wrapper.find("button[type='submit']").text()).toBe("Save Settings");
    consoleSpy.mockRestore();
  });

  it("should log settings on save", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const wrapper = mount(SettingsView);
    await wrapper.find("form").trigger("submit.prevent");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[SettingsView] Saving settings:",
      {
        nodeUrl: "http://127.0.0.1:8332",
        electrumUrl: "tcp://127.0.0.1:50001",
      }
    );
    consoleSpy.mockRestore();
  });

  // ── Debug Info Section ──

  it("should render the Debug Info section", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Debug Info");
  });

  it("should display version in debug info", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Version: 26.5.11");
  });

  it("should display platform as Web in debug info", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Platform: Web");
  });

  it("should display Demo mode in debug info when in mock mode", () => {
    mockIsMockMode.mockReturnValue(true);
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Mode: Demo (mock)");
  });

  it("should display Live mode in debug info when connected", async () => {
    mockIsMockMode.mockReturnValue(false);
    mockGetApiBaseUrl.mockReturnValue("http://127.0.0.1:8332");
    const wrapper = mount(SettingsView);

    // Trigger save to update mockMode ref after isMockMode returns false
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.text()).toContain("Mode: Live");
    consoleSpy.mockRestore();
  });

  it("should display fork target in debug info", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Fork Target: 2026-08-21 15:00Z");
  });

  it("should display fork block in debug info", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Fork Block: ~964,000");
  });

  it("should list all sidechain names in debug info", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Thunder");
    expect(wrapper.text()).toContain("zSide");
    expect(wrapper.text()).toContain("BitNames");
    expect(wrapper.text()).toContain("BitAssets");
    expect(wrapper.text()).toContain("Photon");
    expect(wrapper.text()).toContain("Truthcoin");
    expect(wrapper.text()).toContain("CoinShift");
  });

  it("should display BIPs in debug info", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("BIPs: 300, 301");
  });

  it("should render a form element", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.find("form").exists()).toBe(true);
  });
});
