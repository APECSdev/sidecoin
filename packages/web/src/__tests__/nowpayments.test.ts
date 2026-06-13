// packages/web/src/__tests__/nowpayments.test.ts
//
// Unit tests for the NOWPayments client library.
// Covers plan definitions, featured currencies, payment URI builder,
// and type exports. Does NOT hit the network — API tests are in
// nowpayments-api.test.ts.

import { describe, it, expect } from "vitest";
import {
  PLANS,
  FEATURED_CURRENCIES,
  buildPaymentURI,
} from "../lib/nowpayments";
import type {
  Plan,
  CreatePaymentRequest,
  PaymentResponse,
  PaymentStatus,
} from "../lib/nowpayments";

// ---------------------------------------------------------------------------
// Plan Definitions
// ---------------------------------------------------------------------------

describe("PLANS", () => {
  it("should define exactly two plans", () => {
    const planIds = Object.keys(PLANS);
    expect(planIds).toHaveLength(2);
    expect(planIds).toContain("monthly");
    expect(planIds).toContain("yearly");
  });

  it("should have correct monthly plan details", () => {
    const plan = PLANS["monthly"];
    expect(plan.id).toBe("monthly");
    expect(plan.label).toBe("Sidecoin PRO — Monthly");
    expect(plan.priceUSD).toBe(5);
    expect(plan.periodUnit).toBe("month");
  });

  it("should have correct yearly plan details", () => {
    const plan = PLANS["yearly"];
    expect(plan.id).toBe("yearly");
    expect(plan.label).toBe("Sidecoin PRO — Yearly");
    expect(plan.priceUSD).toBe(36);
    expect(plan.periodUnit).toBe("year");
  });

  it("should price the yearly plan lower per-month than monthly", () => {
    const perMonthMonthly = PLANS["monthly"].priceUSD; // 5 / month
    const perMonthYearly = PLANS["yearly"].priceUSD / 12; // 36 / 12 = 3 / month
    expect(perMonthYearly).toBeLessThan(perMonthMonthly);
  });

  it("should have positive USD prices for all plans", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.priceUSD).toBeGreaterThan(0);
    }
  });

  it("should have a valid period unit for all plans", () => {
    for (const plan of Object.values(PLANS)) {
      expect(["month", "year"]).toContain(plan.periodUnit);
    }
  });

  it("should have non-empty labels for all plans", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.label.length).toBeGreaterThan(0);
    }
  });

  it("should have plan IDs matching their record keys", () => {
    for (const [key, plan] of Object.entries(PLANS)) {
      expect(plan.id).toBe(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Featured Currencies
// ---------------------------------------------------------------------------

describe("FEATURED_CURRENCIES", () => {
  it("should include BTC", () => {
    expect(FEATURED_CURRENCIES).toContain("btc");
  });

  it("should include ETH", () => {
    expect(FEATURED_CURRENCIES).toContain("eth");
  });

  it("should include LTC", () => {
    expect(FEATURED_CURRENCIES).toContain("ltc");
  });

  it("should not include USDC ERC-20 by default until live availability is confirmed", () => {
    expect(FEATURED_CURRENCIES).not.toContain("usdcerc20");
  });

  it("should not include XEC by default until live availability is confirmed", () => {
    expect(FEATURED_CURRENCIES).not.toContain("xec");
  });

  it("should not include SOL by default until live availability is confirmed", () => {
    expect(FEATURED_CURRENCIES).not.toContain("sol");
  });

  it("should have exactly 3 featured currencies", () => {
    expect(FEATURED_CURRENCIES).toHaveLength(3);
  });

  it("should contain only lowercase strings", () => {
    for (const cur of FEATURED_CURRENCIES) {
      expect(cur).toBe(cur.toLowerCase());
    }
  });
});

// ---------------------------------------------------------------------------
// buildPaymentURI
// ---------------------------------------------------------------------------

describe("buildPaymentURI", () => {
  describe("Bitcoin-family URIs", () => {
    it("should build a bitcoin: URI for BTC", () => {
      const uri = buildPaymentURI("btc", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", 0.00042);
      expect(uri).toBe("bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?amount=0.00042");
    });

    it("should build a litecoin: URI for LTC", () => {
      const uri = buildPaymentURI("ltc", "LcHKx4Tq7rN9Rr4Cn8h2jKMEaFbpSMkVo", 1.5);
      expect(uri).toBe("litecoin:LcHKx4Tq7rN9Rr4Cn8h2jKMEaFbpSMkVo?amount=1.5");
    });

    it("should build a bitcoincash: URI for BCH", () => {
      const uri = buildPaymentURI("bch", "qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a", 0.1);
      expect(uri).toBe("bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a?amount=0.1");
    });

    it("should build a dogecoin: URI for DOGE", () => {
      const uri = buildPaymentURI("doge", "DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L", 100);
      expect(uri).toBe("dogecoin:DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L?amount=100");
    });

    it("should build an ecash: URI for XEC", () => {
      const uri = buildPaymentURI("xec", "ecash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a", 1000);
      expect(uri).toBe("ecash:ecash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a?amount=1000");
    });

    it("should handle uppercase currency code for BTC", () => {
      const uri = buildPaymentURI("BTC", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", 0.5);
      expect(uri).toBe("bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?amount=0.5");
    });

    it("should handle mixed-case currency code for Ltc", () => {
      const uri = buildPaymentURI("Ltc", "LcHKx4Tq7rN9Rr4Cn8h2jKMEaFbpSMkVo", 2);
      expect(uri).toBe("litecoin:LcHKx4Tq7rN9Rr4Cn8h2jKMEaFbpSMkVo?amount=2");
    });
  });

  describe("Ethereum-family URIs", () => {
    it("should build an ethereum: URI for ETH", () => {
      const uri = buildPaymentURI("eth", "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28", 0.015);
      expect(uri).toBe("ethereum:0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28?value=0.015");
    });

    it("should still know how to build an ethereum: URI for USDC ERC-20", () => {
      const uri = buildPaymentURI("usdcerc20", "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28", 25);
      expect(uri).toBe("ethereum:0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28?value=25");
    });

    it("should build an ethereum: URI for USDT ERC-20", () => {
      const uri = buildPaymentURI("usdterc20", "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28", 35);
      expect(uri).toBe("ethereum:0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28?value=35");
    });

    it("should handle uppercase ETH", () => {
      const uri = buildPaymentURI("ETH", "0xAddress", 1);
      expect(uri).toBe("ethereum:0xAddress?value=1");
    });
  });

  describe("Fallback (unknown currencies)", () => {
    it("should return the raw address for unknown currencies", () => {
      const uri = buildPaymentURI("xmr", "44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A", 1.5);
      expect(uri).toBe("44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A");
    });

    it("should return the raw address for sol", () => {
      const uri = buildPaymentURI("sol", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", 10);
      expect(uri).toBe("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
    });

    it("should return the raw address for trx", () => {
      const uri = buildPaymentURI("trx", "TN2YqTv5e6bkBR7DpKaeHLGq1hKhVsqWZX", 500);
      expect(uri).toBe("TN2YqTv5e6bkBR7DpKaeHLGq1hKhVsqWZX");
    });
  });

  describe("Edge cases", () => {
    it("should handle zero amount for BTC", () => {
      const uri = buildPaymentURI("btc", "1addr", 0);
      expect(uri).toBe("bitcoin:1addr?amount=0");
    });

    it("should handle very small amount for BTC", () => {
      const uri = buildPaymentURI("btc", "1addr", 0.00000001);
      expect(uri).toBe("bitcoin:1addr?amount=1e-8");
    });

    it("should handle large amount for ETH", () => {
      const uri = buildPaymentURI("eth", "0xAddr", 999999.99);
      expect(uri).toBe("ethereum:0xAddr?value=999999.99");
    });

    it("should handle empty address (still builds URI)", () => {
      const uri = buildPaymentURI("btc", "", 1);
      expect(uri).toBe("bitcoin:?amount=1");
    });
  });
});

// ---------------------------------------------------------------------------
// Type Exports — compile-time verification
// ---------------------------------------------------------------------------

describe("Type exports", () => {
  it("should export Plan type with required fields", () => {
    const plan: Plan = {
      id: "monthly",
      label: "Test",
      priceUSD: 5,
      periodUnit: "month",
    };
    expect(plan.id).toBe("monthly");
  });

  it("should export CreatePaymentRequest type", () => {
    const req: CreatePaymentRequest = {
      plan: "monthly",
      quantity: 1,
      publicKey: "02abc",
      payCurrency: "btc",
    };
    expect(req.plan).toBe("monthly");
  });

  it("should allow CreatePaymentRequest with an optional email", () => {
    const req: CreatePaymentRequest = {
      plan: "yearly",
      quantity: 2,
      publicKey: "02abc",
      payCurrency: "eth",
      email: "founder@example.com",
    };
    expect(req.email).toBe("founder@example.com");
  });

  it("should export PaymentResponse type", () => {
    const res: PaymentResponse = {
      orderId: "order-1",
      paymentId: "pay-123",
      payAddress: "1addr",
      payAmount: 0.00042,
      payCurrency: "btc",
      priceAmountUsd: 5,
      durationMonths: 1,
      expiresAt: "2026-01-01T00:20:00Z",
    };
    expect(res.paymentId).toBe("pay-123");
  });

  it("should allow PaymentResponse with a null expiresAt", () => {
    const res: PaymentResponse = {
      orderId: "order-1",
      paymentId: "pay-123",
      payAddress: "1addr",
      payAmount: 0.00042,
      payCurrency: "btc",
      priceAmountUsd: 5,
      durationMonths: 1,
      expiresAt: null,
    };
    expect(res.expiresAt).toBeNull();
  });

  it("should export PaymentStatus type with all status values", () => {
    const statuses: PaymentStatus["paymentStatus"][] = [
      "waiting",
      "confirming",
      "confirmed",
      "sending",
      "partially_paid",
      "finished",
      "failed",
      "refunded",
      "expired",
      "unknown",
    ];
    expect(statuses).toHaveLength(10);
  });

  it("should export PaymentStatus type with founder fields", () => {
    const status: PaymentStatus = {
      paymentId: "pay-123",
      orderId: "order-1",
      paymentStatus: "waiting",
      payAmount: 0.00042,
      actuallyPaid: 0,
      payCurrency: "btc",
      confirmed: false,
      founderNumber: null,
    };
    expect(status.confirmed).toBe(false);
    expect(status.founderNumber).toBeNull();
  });
});
