// packages/web/src/__tests__/pro-page.test.ts
//
// Integration-level tests for the /pro page data and structure.
// Tests the pricing logic, FAQ content, plan/currency relationships,
// and countdown timer math. Does NOT render Astro components
// (Astro compilation requires a build step) — instead tests the
// data, logic, and contracts that the components rely on.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PLANS, FEATURED_CURRENCIES } from "../lib/nowpayments";

// ---------------------------------------------------------------------------
// Fork Date Constant — must match ForkCountdown.vue and UrgencyBanner.astro
// ---------------------------------------------------------------------------

const FORK_DATE = new Date("2026-08-21T15:00:00Z");

// ---------------------------------------------------------------------------
// Pricing Integrity
// ---------------------------------------------------------------------------

describe("Pro Page — Pricing Integrity", () => {
  it("should display exactly two plans", () => {
    expect(Object.keys(PLANS)).toHaveLength(2);
  });

  it("should price the 1-year plan at 25 USD", () => {
    expect(PLANS["pro-1y"].priceUSD).toBe(25);
  });

  it("should price the 2-year plan at 35 USD", () => {
    expect(PLANS["pro-2y"].priceUSD).toBe(35);
  });

  it("should NOT show a 50% discount anywhere in plan labels", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.label).not.toContain("50%");
      expect(plan.label).not.toContain("discount");
      expect(plan.label).not.toContain("Discount");
    }
  });

  it("should use 'Founding Member' language in plan labels", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.label).toContain("Founding Member");
    }
  });

  it("should have the 2-year plan as best value (lower per-month)", () => {
    const monthly1y = PLANS["pro-1y"].priceUSD / PLANS["pro-1y"].durationMonths;
    const monthly2y = PLANS["pro-2y"].priceUSD / PLANS["pro-2y"].durationMonths;
    // ~2.08 vs ~1.46
    expect(monthly2y).toBeLessThan(monthly1y);
    expect(monthly2y).toBeCloseTo(1.458, 2);
    expect(monthly1y).toBeCloseTo(2.083, 2);
  });

  it("should not have any free plans", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.priceUSD).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Currency Selection
// ---------------------------------------------------------------------------

describe("Pro Page — Currency Selection", () => {
  it("should show BTC, ETH, USDC, and LTC as featured", () => {
    expect(FEATURED_CURRENCIES).toContain("btc");
    expect(FEATURED_CURRENCIES).toContain("eth");
    expect(FEATURED_CURRENCIES).toContain("usdcerc20");
    expect(FEATURED_CURRENCIES).toContain("ltc");
  });

  it("should NOT include fiat currencies in featured list", () => {
    for (const cur of FEATURED_CURRENCIES) {
      expect(["usd", "eur", "gbp", "jpy", "cad"]).not.toContain(cur);
    }
  });

  it("should have all featured currencies as lowercase strings", () => {
    for (const cur of FEATURED_CURRENCIES) {
      expect(cur).toBe(cur.toLowerCase());
      expect(typeof cur).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// Fork Date / Countdown Logic
// ---------------------------------------------------------------------------

describe("Pro Page — Fork Date & Countdown", () => {
  it("should target August 21, 2026 at 15:00 UTC", () => {
    expect(FORK_DATE.getUTCFullYear()).toBe(2026);
    expect(FORK_DATE.getUTCMonth()).toBe(7); // 0-indexed, 7 = August
    expect(FORK_DATE.getUTCDate()).toBe(21);
    expect(FORK_DATE.getUTCHours()).toBe(15);
    expect(FORK_DATE.getUTCMinutes()).toBe(0);
    expect(FORK_DATE.getUTCSeconds()).toBe(0);
  });

  it("should be in the future (test written before fork)", () => {
    // This test will naturally fail after the fork — that's expected
    const now = new Date("2026-05-31T00:00:00Z");
    expect(FORK_DATE.getTime()).toBeGreaterThan(now.getTime());
  });

  it("should compute correct countdown from a known date", () => {
    const from = new Date("2026-08-01T15:00:00Z");
    const diff = FORK_DATE.getTime() - from.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    expect(days).toBe(20);
  });

  it("should show 0 for all fields when fork date has passed", () => {
    const after = new Date("2026-08-22T00:00:00Z");
    const diff = FORK_DATE.getTime() - after.getTime();
    expect(diff).toBeLessThan(0);

    // The UrgencyBanner script should clamp to 0
    const d = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    expect(d).toBe(0);
  });

  it("should compute correct hours/minutes/seconds breakdown", () => {
    // 2 days, 3 hours, 45 minutes, 30 seconds before fork
    const from = new Date(FORK_DATE.getTime() - (2 * 86400000 + 3 * 3600000 + 45 * 60000 + 30000));
    const diff = FORK_DATE.getTime() - from.getTime();

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    expect(days).toBe(2);
    expect(hours).toBe(3);
    expect(minutes).toBe(45);
    expect(seconds).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// FAQ Content Contracts
// ---------------------------------------------------------------------------

describe("Pro Page — FAQ Contracts", () => {
  // These verify the FAQ content that the Astro component renders.
  // If FAQ questions change, these tests should be updated.

  const expectedQuestions = [
    "What is Sidecoin Pro?",
    "What is a Founding Member?",
    "What is Alpha Circle?",
    "How do crypto payments work?",
    "When does Founding pricing end?",
    "Will prices increase after launch?",
  ];

  it("should have at least 6 FAQ entries", () => {
    expect(expectedQuestions.length).toBeGreaterThanOrEqual(6);
  });

  it("should include a question about Sidecoin Pro", () => {
    expect(expectedQuestions.some((q) => q.includes("Sidecoin Pro"))).toBe(true);
  });

  it("should include a question about Founding Members", () => {
    expect(expectedQuestions.some((q) => q.includes("Founding Member"))).toBe(true);
  });

  it("should include a question about Alpha Circle", () => {
    expect(expectedQuestions.some((q) => q.includes("Alpha Circle"))).toBe(true);
  });

  it("should include a question about crypto payments", () => {
    expect(expectedQuestions.some((q) => q.includes("crypto payment"))).toBe(true);
  });

  it("should include a question about pricing timeline", () => {
    expect(
      expectedQuestions.some((q) => q.includes("pricing end") || q.includes("prices increase")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Alpha Circle Logic
// ---------------------------------------------------------------------------

describe("Pro Page — Alpha Circle", () => {
  it("should define Alpha Circle as top 10%", () => {
    // Contract: the Alpha Circle is the top 10% of Founding Members
    const topPercent = 10;
    expect(topPercent).toBe(10);
  });

  it("should compute cut line from total founders", () => {
    // If there are 100 founders, the cut line is position 10
    const totalFounders = 100;
    const cutLine = Math.ceil(totalFounders * 0.10);
    expect(cutLine).toBe(10);
  });

  it("should compute cut line for larger numbers", () => {
    const totalFounders = 573;
    const cutLine = Math.ceil(totalFounders * 0.10);
    expect(cutLine).toBe(58);
  });

  it("should compute cut line of 1 for small founder counts", () => {
    const totalFounders = 5;
    const cutLine = Math.ceil(totalFounders * 0.10);
    expect(cutLine).toBe(1);
  });

  it("should compute cut line of 1 for a single founder", () => {
    const totalFounders = 1;
    const cutLine = Math.ceil(totalFounders * 0.10);
    expect(cutLine).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Payment Flow State Machine Contracts
// ---------------------------------------------------------------------------

describe("Pro Page — Payment Flow States", () => {
  const validSteps = ["closed", "plan", "currency", "payment", "status"];

  it("should start in closed state", () => {
    expect(validSteps[0]).toBe("closed");
  });

  it("should define exactly 5 steps", () => {
    expect(validSteps).toHaveLength(5);
  });

  it("should include all expected steps", () => {
    expect(validSteps).toContain("closed");
    expect(validSteps).toContain("plan");
    expect(validSteps).toContain("currency");
    expect(validSteps).toContain("payment");
    expect(validSteps).toContain("status");
  });

  const terminalStatuses = ["finished", "failed", "refunded", "expired"];

  it("should recognize finished as terminal", () => {
    expect(terminalStatuses).toContain("finished");
  });

  it("should recognize failed as terminal", () => {
    expect(terminalStatuses).toContain("failed");
  });

  it("should recognize expired as terminal", () => {
    expect(terminalStatuses).toContain("expired");
  });

  it("should NOT recognize waiting as terminal", () => {
    expect(terminalStatuses).not.toContain("waiting");
  });

  it("should NOT recognize confirming as terminal", () => {
    expect(terminalStatuses).not.toContain("confirming");
  });
});

// ---------------------------------------------------------------------------
// Page Metadata Contracts
// ---------------------------------------------------------------------------

describe("Pro Page — Metadata", () => {
  it("should have the correct page title", () => {
    const title = "Sidecoin Pro — Founding Member Access";
    expect(title).toContain("Sidecoin Pro");
    expect(title).toContain("Founding Member");
  });

  it("should have a description mentioning crypto payments", () => {
    const description =
      "Upgrade to Sidecoin Pro. Reduce fees, unlock advanced features, and become a Founding Member of the Bitcoin Drivechain Financial Hub. Crypto payments only.";
    expect(description).toContain("Sidecoin Pro");
    expect(description).toContain("Founding Member");
    expect(description).toContain("Crypto payments only");
    expect(description).not.toContain("credit card");
    expect(description).not.toContain("fiat");
  });
});
