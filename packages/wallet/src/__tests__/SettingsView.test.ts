// packages/wallet/src/__tests__/SettingsView.test.ts
//
// Tests for SettingsView.vue.
// Covers form rendering, save flow, default/custom adapter banners,
// Demo Mode, the collapsed debug info section, and API integration.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SettingsView from "../views/SettingsView.vue";
import { DEFAULT_BASE_URL } from "@sidecoin/api-client";
import { DEMO_MODE_STORAGE_KEY } from "../demo";

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------

vi.mock("../api", () => ({
  getApiBaseUrl: vi.fn(),
  setApiBaseUrl: vi.fn(),
}));

import { getApiBaseUrl, setApiBaseUrl } from "../api";

const mockGetApiBaseUrl = vi.mocked(getApiBaseUrl);
const mockSetApiBaseUrl = vi.mocked(setApiBaseUrl);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsView.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    mockGetApiBaseUrl.mockReturnValue("");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should render the 'Settings' heading", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.find("h2").text()).toBe("Settings");
  });

  it("should show the default adapter banner when no custom URL is set", () => {
    mockGetApiBaseUrl.mockReturnValue("");
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Using Default Adapter");
    expect(wrapper.text()).toContain(DEFAULT_BASE_URL);
  });

  it("should show the custom adapter banner when a URL is configured", async () => {
    mockGetApiBaseUrl.mockReturnValue("http://127.0.0.1:8332/v1");
    const wrapper = mount(SettingsView);
    await flushPromises();
    expect(wrapper.text()).toContain("Custom Adapter");
    expect(wrapper.text()).toContain("http://127.0.0.1:8332/v1");
  });

  it("should render the Adapter Base URL input", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Adapter Base URL");
    const inputs = wrapper.findAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it("should render the Electrum Server URL input", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Electrum Server URL");
    const inputs = wrapper.findAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("should have an empty Adapter URL by default (uses client default)", () => {
    const wrapper = mount(SettingsView);
    const inputs = wrapper.findAll("input");
    expect((inputs[0].element as HTMLInputElement).value).toBe("");
  });

  it("should use DEFAULT_BASE_URL as the Adapter URL placeholder", () => {
    const wrapper = mount(SettingsView);
    const inputs = wrapper.findAll("input");
    expect(inputs[0].attributes("placeholder")).toBe(DEFAULT_BASE_URL);
  });

  it("should have default Electrum URL of tcp://127.0.0.1:50001", () => {
    const wrapper = mount(SettingsView);
    const inputs = wrapper.findAll("input");
    expect((inputs[1].element as HTMLInputElement).value).toBe(
      "tcp://127.0.0.1:50001",
    );
  });

  it("should populate Adapter URL from existing API config", async () => {
    mockGetApiBaseUrl.mockReturnValue("http://mynode:8332/v1");
    const wrapper = mount(SettingsView);
    await flushPromises();
    const inputs = wrapper.findAll("input");
    expect((inputs[0].element as HTMLInputElement).value).toBe(
      "http://mynode:8332/v1",
    );
  });

  it("should render Save Settings button", () => {
    const wrapper = mount(SettingsView);
    const button = wrapper.find("button[type='submit']");
    expect(button.exists()).toBe(true);
    expect(button.text()).toBe("Save Settings");
  });

  it("should call setApiBaseUrl with the entered URL on save", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const wrapper = mount(SettingsView);
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("http://127.0.0.1:8332/v1");
    await wrapper.find("form").trigger("submit.prevent");
    expect(mockSetApiBaseUrl).toHaveBeenCalledWith("http://127.0.0.1:8332/v1");
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
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("http://127.0.0.1:8332/v1");
    await wrapper.find("form").trigger("submit.prevent");
    expect(consoleSpy).toHaveBeenCalledWith("[SettingsView] Saving settings:", {
      nodeUrl: "http://127.0.0.1:8332/v1",
      electrumUrl: "tcp://127.0.0.1:50001",
    });
    consoleSpy.mockRestore();
  });

  // ── Demo Mode Section ──

  it("should render Demo Mode settings", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Experience");
    expect(wrapper.text()).toContain("Demo Mode");
    expect(wrapper.text()).toContain("Explore Sidecoin with sample balances");
  });

  it("should leave Demo Mode disabled by default", () => {
    const wrapper = mount(SettingsView);
    const checkbox = wrapper.find('input[aria-label="Demo Mode"]');
    expect((checkbox.element as HTMLInputElement).checked).toBe(false);
  });

  it("should initialize Demo Mode from localStorage", async () => {
    localStorage.setItem(DEMO_MODE_STORAGE_KEY, "1");
    const wrapper = mount(SettingsView);
    await flushPromises();
    const checkbox = wrapper.find('input[aria-label="Demo Mode"]');
    expect((checkbox.element as HTMLInputElement).checked).toBe(true);
  });

  it("should persist Demo Mode when toggled on", async () => {
    const wrapper = mount(SettingsView);
    const checkbox = wrapper.find('input[aria-label="Demo Mode"]');

    await checkbox.setValue(true);

    expect(localStorage.getItem(DEMO_MODE_STORAGE_KEY)).toBe("1");
  });

  it("should clear Demo Mode when toggled off", async () => {
    localStorage.setItem(DEMO_MODE_STORAGE_KEY, "1");
    const wrapper = mount(SettingsView);
    await flushPromises();

    const checkbox = wrapper.find('input[aria-label="Demo Mode"]');
    await checkbox.setValue(false);

    expect(localStorage.getItem(DEMO_MODE_STORAGE_KEY)).toBeNull();
  });

  // ── Debug Info Section ──

  it("should render the Debug Info section", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Debug Info");
  });

  it("should hide debug info by default", () => {
    const wrapper = mount(SettingsView);
    const details = wrapper.find("details");
    expect((details.element as HTMLDetailsElement).open).toBe(false);
  });

  it("should display version in debug info", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Version: 26.5.11");
  });

  it("should display platform as Web in debug info", () => {
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Platform: Web");
  });

  it("should display 'Adapter: Default' in debug info when using default", () => {
    mockGetApiBaseUrl.mockReturnValue("");
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("Adapter: Default");
  });

  it("should display 'Adapter: Custom' in debug info after a custom save", async () => {
    mockGetApiBaseUrl.mockReturnValue("http://127.0.0.1:8332/v1");
    const wrapper = mount(SettingsView);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.text()).toContain("Adapter: Custom");
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

  it("should list all platform names in debug info", () => {
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
