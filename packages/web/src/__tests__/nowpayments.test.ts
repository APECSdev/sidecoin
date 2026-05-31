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
  EstimateResponse,
  InvoiceRequest,
  PaymentResponse,
  PaymentStatus,
  CurrencyInfo,
} from "../lib/nowpayments";

// ---------------------------------------------------------------------------
// Plan Definitions
// ---------------------------------------------------------------------------

describe("PLANS", () => {
  it("should define exactly two plans", () => {
    const planIds = Object.keys(PLANS);
    expect(planIds).toHaveLength(2);
    expect(planIds).toContain("pro-1y");
    expect(planIds).toContain("pro-2y");
  });

  it("should have correct 1-year plan details", () => {
    const plan = PLANS["pro-1y"];
    expect(plan.id).toBe("pro-1y");
    expect(plan.label).toBe("Founding Member — 1 Year");
    expect(plan.priceUSD).toBe(25);
    expect(plan.durationMonths).toBe(12);
  });

  it("should have correct 2-year plan details", () => {
    const plan = PLANS["pro-2y"];
    expect(plan.id).toBe("pro-2y");
    expect(plan.label).toBe("Founding Member — 2 Years");
    expect(plan.priceUSD).toBe(35);
    expect(plan.durationMonths).toBe(24);
  });

  it("should price the 2-year plan lower per-month than 1-year", () => {
    const perMonth1y = PLANS["pro-1y"].priceUSD / PLANS["pro-1y"].durationMonths;
    const perMonth2y = PLANS["pro-2y"].priceUSD / PLANS["pro-2y"].durationMonths;
    expect(perMonth2y).toBeLessThan(perMonth1y);
  });

  it("should have positive USD prices for all plans", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.priceUSD).toBeGreaterThan(0);
    }
  });

  it("should have positive duration for all plans", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.durationMonths).toBeGreaterThan(0);
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

  it("should include USDC (ERC-20)", () => {
    expect(FEATURED_CURRENCIES).toContain("usdcerc20");
  });

  it("should include LTC", () => {
    expect(FEATURED_CURRENCIES).toContain("ltc");
  });

  it("should have exactly 4 featured currencies", () => {
    expect(FEATURED_CURRENCIES).toHaveLength(4);
  });

  it("should contain only lowercase strings", () => {
    for (const cur of FEATURED_CURRENCIES) {
      expect(cur).toBe(cur.toLowerCase());
    }
  });
});

// ---------------------------------------------------------------------------
// buildPaymentURI — Bitcoin-family
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

    it("should handle uppercase currency code for BTC", () => {
      const uri = buildPaymentURI("BTC", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", 0.5);
      expect(uri).toBe("bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?amount=0.5");
    });

    it("should handle mixed-case currency code for Ltc", () => {
      const uri = buildPaymentURI("Ltc", "LcHKx4Tq7rN9Rr4Cn8h2jKMEaFbpSMkVo", 2);
      expect(uri).toBe("litecoin:LcHKx4Tq7rN9Rr4Cn8h2jKMEaFbpSMkVo?amount=2");
    });
  });

  // ─── Ethereum-family ─────────────────────────────────────

  describe("Ethereum-family URIs", () => {
    it("should build an ethereum: URI for ETH", () => {
      const uri = buildPaymentURI("eth", "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28", 0.015);
      expect(uri).toBe("ethereum:0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28?value=0.015");
    });

    it("should build an ethereum: URI for USDC ERC-20", () => {
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

  // ─── Fallback ────────────────────────────────────────────

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

  // ─── Edge cases ──────────────────────────────────────────

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
      id: "pro-1y",
      label: "Test",
      priceUSD: 10,
      durationMonths: 12,
    };
    expect(plan.id).toBe("pro-1y");
  });

  it("should export EstimateResponse type", () => {
    const est: EstimateResponse = {
      estimated_amount: 0.00042,
      currency_from: "usd",
      currency_to: "btc",
    };
    expect(est.estimated_amount).toBe(0.00042);
  });

  it("should export InvoiceRequest type", () => {
    const req: InvoiceRequest = {
      price_amount: 25,
      price_currency: "usd",
      pay_currency: "btc",
      order_id: "test-123",
      order_description: "Test order",
    };
    expect(req.price_amount).toBe(25);
  });

  it("should export PaymentResponse type", () => {
    const res: PaymentResponse = {
      payment_id: "pay-123",
      payment_status: "waiting",
      pay_address: "1addr",
      pay_amount: 0.00042,
      pay_currency: "btc",
      price_amount: 25,
      price_currency: "usd",
      order_id: "order-1",
      order_description: "Test",
      created_at: "2026-01-01T00:00:00Z",
      expiration_estimate_date: "2026-01-01T00:20:00Z",
      purchase_id: "purch-1",
    };
    expect(res.payment_id).toBe("pay-123");
  });

  it("should export PaymentStatus type with all status values", () => {
    const statuses: PaymentStatus["payment_status"][] = [
      "waiting",
      "confirming",
      "confirmed",
      "sending",
      "partially_paid",
      "finished",
      "failed",
      "refunded",
      "expired",
    ];
    expect(statuses).toHaveLength(9);
  });

  it("should export CurrencyInfo type", () => {
    const info: CurrencyInfo = {
      code: "btc",
      name: "Bitcoin",
      minAmount: 0.0001,
    };
    expect(info.code).toBe("btc");
  });

  it("should allow CurrencyInfo without optional minAmount", () => {
    const info: CurrencyInfo = {
      code: "eth",
      name: "Ethereum",
    };
    expect(info.minAmount).toBeUndefined();
  });
});
