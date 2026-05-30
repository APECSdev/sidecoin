// packages/desktop/src/__tests__/ReceiveView.test.ts
//
// Tests for ReceiveView.vue.
// Covers address display, copy button, loading/error states,
// and QR code placeholder.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ReceiveView from "../views/ReceiveView.vue";

// ---------------------------------------------------------------------------
// Mock @tauri-apps/api/core
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReceiveView.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(
      "bc1q0000000000000000000000000000000000000000" as never
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render the 'Receive eCash' heading", async () => {
    const wrapper = mount(ReceiveView);
    await flushPromises();
    expect(wrapper.find("h2").text()).toBe("Receive eCash");
  });

  it("should display the receive address", async () => {
    const wrapper = mount(ReceiveView);
    await flushPromises();
    expect(wrapper.text()).toContain(
      "bc1q0000000000000000000000000000000000000000"
    );
  });

  it("should display 'Your Receive Address' label", async () => {
    const wrapper = mount(ReceiveView);
    await flushPromises();
    expect(wrapper.text()).toContain("Your Receive Address");
  });

  it("should render a Copy Address button", async () => {
    const wrapper = mount(ReceiveView);
    await flushPromises();
    const button = wrapper.find("button");
    expect(button.exists()).toBe(true);
    expect(button.text()).toBe("Copy Address");
  });

  it("should call invoke with get_receive_address on mount", async () => {
    mount(ReceiveView);
    await flushPromises();
    expect(mockInvoke).toHaveBeenCalledWith("get_receive_address");
  });

  it("should show error state when invoke fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInvoke.mockRejectedValue(new Error("Address gen failed"));
    const wrapper = mount(ReceiveView);
    await flushPromises();
    expect(wrapper.text()).toContain("Error generating address");
    expect(wrapper.text()).toContain("Address gen failed");
    consoleSpy.mockRestore();
  });

  it("should log error to console when address generation fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInvoke.mockRejectedValue(new Error("No connection"));
    mount(ReceiveView);
    await flushPromises();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[ReceiveView] Failed to get address:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("should render the QR code placeholder", async () => {
    const wrapper = mount(ReceiveView);
    await flushPromises();
    expect(wrapper.text()).toContain("QR code");
  });

  it("should change button text to 'Copied ✓' after clicking copy", async () => {
    // Mock clipboard API via Object.defineProperty (clipboard is a read-only getter)
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const wrapper = mount(ReceiveView);
    await flushPromises();

    const button = wrapper.find("button");
    await button.trigger("click");
    await flushPromises();

    expect(button.text()).toBe("Copied ✓");
    expect(writeTextMock).toHaveBeenCalledWith(
      "bc1q0000000000000000000000000000000000000000"
    );
  });

  it("should handle clipboard errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("Clipboard blocked")),
      },
      writable: true,
      configurable: true,
    });

    const wrapper = mount(ReceiveView);
    await flushPromises();

    const button = wrapper.find("button");
    await button.trigger("click");
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[ReceiveView] Failed to copy:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
