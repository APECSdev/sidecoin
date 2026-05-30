// packages/wallet/src/__tests__/SendView.test.ts
//
// Tests for SendView.vue.
// Covers form rendering, input binding, submit handling,
// button disable states, and result display.

import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import SendView from "../views/SendView.vue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountSend() {
  return mount(SendView);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SendView.vue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render the 'Send eCash' heading", () => {
    const wrapper = mountSend();
    expect(wrapper.find("h2").text()).toBe("Send eCash");
  });

  it("should render the recipient address input", () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    const addressInput = inputs.find(
      (i) => i.attributes("placeholder") === "ecash1q..."
    );
    expect(addressInput).toBeDefined();
  });

  it("should render the amount input", () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    const amountInput = inputs.find(
      (i) => i.attributes("placeholder") === "0.00000000"
    );
    expect(amountInput).toBeDefined();
  });

  it("should render the Send button", () => {
    const wrapper = mountSend();
    const button = wrapper.find("button[type='submit']");
    expect(button.exists()).toBe(true);
    expect(button.text()).toBe("Send");
  });

  it("should render 'Recipient Address' label", () => {
    const wrapper = mountSend();
    expect(wrapper.text()).toContain("Recipient Address");
  });

  it("should render 'Amount (eCash)' label", () => {
    const wrapper = mountSend();
    expect(wrapper.text()).toContain("Amount (eCash)");
  });

  it("should disable the Send button when address is empty", () => {
    const wrapper = mountSend();
    const button = wrapper.find("button[type='submit']");
    expect(button.attributes("disabled")).toBeDefined();
  });

  it("should disable the Send button when amount is empty", async () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("ecash1qtest");
    const button = wrapper.find("button[type='submit']");
    expect(button.attributes("disabled")).toBeDefined();
  });

  it("should enable the Send button when both fields are filled", async () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("ecash1qtest");
    await inputs[1].setValue("1.0");
    const button = wrapper.find("button[type='submit']");
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("should show result message after submit", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("ecash1qtest");
    await inputs[1].setValue("0.5");
    await wrapper.find("form").trigger("submit.prevent");
    expect(wrapper.text()).toContain("Send functionality not yet implemented");
    consoleSpy.mockRestore();
  });

  it("should log send request to console on submit", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("ecash1qmyaddr");
    await inputs[1].setValue("2.5");
    await wrapper.find("form").trigger("submit.prevent");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[SendView] Send requested:",
      { address: "ecash1qmyaddr", amount: "2.5" }
    );
    consoleSpy.mockRestore();
  });

  it("should render a form element", () => {
    const wrapper = mountSend();
    expect(wrapper.find("form").exists()).toBe(true);
  });

  it("should bind v-model on address input", async () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("bc1qtest123");
    expect((inputs[0].element as HTMLInputElement).value).toBe("bc1qtest123");
  });

  it("should bind v-model on amount input", async () => {
    const wrapper = mountSend();
    const inputs = wrapper.findAll("input");
    await inputs[1].setValue("0.001");
    expect((inputs[1].element as HTMLInputElement).value).toBe("0.001");
  });
});
