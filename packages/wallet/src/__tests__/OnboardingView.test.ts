// packages/wallet/src/__tests__/OnboardingView.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import OnboardingView from "../views/OnboardingView.vue";
import { hasWallet } from "../keystore";

const push = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

const VALID_12 =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("OnboardingView", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockClear();
  });

  it("generates, requires confirmation, then persists and routes home", async () => {
    const w = mount(OnboardingView);
    await w.findAll("button")[0].trigger("click"); // Generate
    const continueBtn = w.findAll("button").find((b) => b.text() === "Continue")!;
    expect(continueBtn.attributes("disabled")).toBeDefined();

    await w.find('input[type="checkbox"]').setValue(true);
    await continueBtn.trigger("click");

    expect(hasWallet()).toBe(true);
    expect(push).toHaveBeenCalledWith({ name: "dashboard" });
  });

  it("imports a valid phrase", async () => {
    const w = mount(OnboardingView);
    await w.findAll("button")[1].trigger("click"); // Import
    await w.find("textarea").setValue(VALID_12);
    await w.findAll("button").find((b) => b.text() === "Import")!.trigger("click");
    expect(hasWallet()).toBe(true);
  });

  it("disables import for an invalid phrase", async () => {
    const w = mount(OnboardingView);
    await w.findAll("button")[1].trigger("click");
    await w.find("textarea").setValue("not a real phrase");
    const importBtn = w.findAll("button").find((b) => b.text() === "Import")!;
    expect(importBtn.attributes("disabled")).toBeDefined();
  });
});
