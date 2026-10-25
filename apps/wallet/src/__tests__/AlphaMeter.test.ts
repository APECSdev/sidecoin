// apps/wallet/src/__tests__/AlphaMeter.test.ts
//
// Component tests for the AlphaMeter pill: live ticking, the
// click-to-explain modal, and the unlimited-plan short-circuit (no render).
// Ported 26.10.24 from apps/mobile/src/__tests__/AlphaMeter.test.tsx (the
// F-Droid null-render case is dropped — no store flavors on the web).
//
// Regression covered: the meter must visibly count down while a PRO session
// runs. The engine settles lazily and reads do NOT emit, so without the
// ALPHA_TICK_MS interval calling tickAlpha() the pill froze at its mount
// value until a blur/navigation forced a settle (found on-device).
//
// Module state is shared across tests in this file (same as mobile's
// suite): no test depends on an exact balance, only on relative drains.

import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

import AlphaMeter from "../components/AlphaMeter.vue";
import {
  ALPHA_TICK_MS,
  beginProSession,
  claimAlphaGrant,
  endProSession,
  getAlphaBalance,
  getAlphaState,
} from "../alpha";
import { refreshEntitlements, setEntitlementKey } from "../entitlements";

const PRO_PAYLOAD = {
  plan: "pro",
  status: "active",
  features: ["l1", "platform:zside", "wallet:coin-control"],
  expiresAt: null,
  checkedAt: null,
};

function proFetch(): typeof globalThis.fetch {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => PRO_PAYLOAD,
  })) as unknown as typeof globalThis.fetch;
}

describe("AlphaMeter", () => {
  afterEach(async () => {
    endProSession();
    vi.useRealTimers();
    // Restore the Basic default in case a test flipped the plan.
    await setEntitlementKey(null);
  });

  it("renders the balance and gauge for the metered free tier", () => {
    const wrapper = mount(AlphaMeter);
    expect(wrapper.text()).toContain(String(Math.floor(getAlphaBalance())));
  });

  it("counts down on the ALPHA_TICK_MS interval while a PRO session runs", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AlphaMeter);
    const rawStart = getAlphaBalance();
    expect(Math.floor(rawStart)).toBeGreaterThan(2); // fresh tank

    let t = 1_000_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => t);
    beginProSession("platform:zside");

    // Three ticks at 20 s each = 60 s = 100/60 ≈ 1.667 Alpha drained.
    for (let i = 0; i < 3; i += 1) {
      t += ALPHA_TICK_MS;
      vi.advanceTimersByTime(ALPHA_TICK_MS);
    }
    await nextTick();

    expect(getAlphaBalance()).toBeCloseTo(rawStart - 100 / 60, 5);
    const displayed = String(Math.floor(rawStart - 100 / 60));
    expect(wrapper.text()).toContain(displayed);
    expect(wrapper.text()).not.toContain(String(Math.floor(rawStart)));
    nowSpy.mockRestore();
  });

  it("opens the click-to-explain modal with grants and the PRO footer", async () => {
    const wrapper = mount(AlphaMeter);
    await wrapper.get('[data-test="alpha-meter"]').trigger("click");
    await nextTick();
    expect(document.body.textContent).toContain("How it works");
    expect(document.body.textContent).toMatch(/First L1 deposit received/);
    expect(document.body.textContent).toMatch(/never\s*drain|never\s+drain/);
  });

  it("renders nothing for unlimited (paid) plans", async () => {
    // Flip to a real PRO state through the refresh path (the wallet's
    // CURRENT_ENTITLEMENTS is a module binding — it cannot be mutated from
    // outside; refreshEntitlements is the legitimate seam).
    await setEntitlementKey("key-abc");
    await refreshEntitlements(proFetch());

    const wrapper = mount(AlphaMeter);
    await nextTick();
    expect(wrapper.find('[data-test="alpha-meter"]').exists()).toBe(false);
  });

  it("keeps rendering for the metered basic plan", () => {
    const wrapper = mount(AlphaMeter);
    expect(wrapper.find('[data-test="alpha-meter"]').exists()).toBe(true);
  });

  it("marks claimed grants in the explainer", async () => {
    claimAlphaGrant("grant:first-broadcast");
    const wrapper = mount(AlphaMeter);
    await wrapper.get('[data-test="alpha-meter"]').trigger("click");
    await nextTick();
    expect(document.body.textContent).toMatch(/First transaction broadcast/);
    expect(document.body.textContent).toContain("claimed");
    expect(getAlphaState().claimedGrants).toContain("grant:first-broadcast");
  });
});
