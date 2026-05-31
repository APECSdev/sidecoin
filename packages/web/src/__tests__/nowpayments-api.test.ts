// packages/web/src/__tests__/nowpayments-api.test.ts
//
// Tests for the NOWPayments API client functions.
// Uses fetch mocking — no real network calls.
// Covers getAvailableCurrencies, getEstimate, createPayment,
// getPaymentStatus, and getMinimumAmount.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAvailableCurrencies,
  getEstimate,
  createPayment,
  getPaymentStatus,
  getMinimumAmount,
} from "../lib/nowpayments";

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function mockFetchError(message: string) {
  fetchMock.mockRejectedValueOnce(new Error(message));
}

/**
 * Returns the fetch call that matches the given URL substring.
 * Useful when a function under test makes multiple fetch calls
 * (or when prior tests leave residual calls).
 */
function findCall(urlFragment: string): [string, RequestInit | undefined] | undefined {
  for (const call of fetchMock.mock.calls) {
    if ((call[0] as string).includes(urlFragment)) {
      return call as [string, RequestInit | undefined];
    }
  }
  return undefined;
}

/**
 * Returns the last fetch call made (most recent).
 */
function lastCall(): [string, RequestInit | undefined] {
  const calls = fetchMock.mock.calls;
  return calls[calls.length - 1] as [string, RequestInit | undefined];
}

// ---------------------------------------------------------------------------
// getAvailableCurrencies
// ---------------------------------------------------------------------------

describe("getAvailableCurrencies", () => {
  it("should return a list of currencies on success", async () => {
    mockFetchResponse({ currencies: ["btc", "eth", "ltc", "usdcerc20"] });

    const result = await getAvailableCurrencies();

    expect(result).toEqual(["btc", "eth", "ltc", "usdcerc20"]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("/currencies");
  });

  it("should return empty array when currencies field is missing", async () => {
    mockFetchResponse({});

    const result = await getAvailableCurrencies();

    expect(result).toEqual([]);
  });

  it("should throw on HTTP error", async () => {
    mockFetchResponse({ message: "Server error" }, 500);

    await expect(getAvailableCurrencies()).rejects.toThrow("Failed to fetch currencies: 500");
  });

  it("should throw on network error", async () => {
    mockFetchError("Network failure");

    await expect(getAvailableCurrencies()).rejects.toThrow("Network failure");
  });

  it("should use GET method", async () => {
    mockFetchResponse({ currencies: [] });

    await getAvailableCurrencies();

    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
  });

  it("should include Content-Type header", async () => {
    mockFetchResponse({ currencies: [] });

    await getAvailableCurrencies();

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

// ---------------------------------------------------------------------------
// getEstimate
// ---------------------------------------------------------------------------

describe("getEstimate", () => {
  it("should return estimated amount on success", async () => {
    mockFetchResponse({
      estimated_amount: 0.00042,
      currency_from: "usd",
      currency_to: "btc",
    });

    const result = await getEstimate(25, "btc");

    expect(result.estimated_amount).toBe(0.00042);
    expect(result.currency_from).toBe("usd");
    expect(result.currency_to).toBe("btc");
  });

  it("should pass amount and currencies as query params", async () => {
    mockFetchResponse({
      estimated_amount: 0.015,
      currency_from: "usd",
      currency_to: "eth",
    });

    await getEstimate(35, "ETH");

    const call = findCall("/estimate");
    expect(call).toBeDefined();
    const url = call![0];
    expect(url).toContain("amount=35");
    expect(url).toContain("currency_from=usd");
    expect(url).toContain("currency_to=eth");
  });

  it("should lowercase the currency parameter", async () => {
    mockFetchResponse({
      estimated_amount: 25,
      currency_from: "usd",
      currency_to: "usdcerc20",
    });

    await getEstimate(25, "USDCERC20");

    const call = findCall("/estimate");
    expect(call).toBeDefined();
    expect(call![0]).toContain("currency_to=usdcerc20");
  });

  it("should throw on HTTP error", async () => {
    mockFetchResponse("Bad request", 400);

    await expect(getEstimate(25, "btc")).rejects.toThrow("Estimate failed: 400");
  });

  it("should throw on network error", async () => {
    mockFetchError("timeout");

    await expect(getEstimate(25, "btc")).rejects.toThrow("timeout");
  });
});

// ---------------------------------------------------------------------------
// createPayment
// ---------------------------------------------------------------------------

describe("createPayment", () => {
  const testApiKey = "test-api-key-12345";

  const testRequest = {
    price_amount: 25,
    price_currency: "usd",
    pay_currency: "btc",
    order_id: "pro-1y-1234567890",
    order_description: "Founding Member — 1 Year",
  };

  it("should return payment data on success", async () => {
    const mockPayment = {
      payment_id: "pay-abc-123",
      payment_status: "waiting",
      pay_address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      pay_amount: 0.00042,
      pay_currency: "btc",
      price_amount: 25,
      price_currency: "usd",
      order_id: "pro-1y-1234567890",
      order_description: "Founding Member — 1 Year",
      created_at: "2026-05-31T00:00:00Z",
      expiration_estimate_date: "2026-05-31T00:20:00Z",
      purchase_id: "purch-xyz",
    };

    mockFetchResponse(mockPayment);

    const result = await createPayment(testApiKey, testRequest);

    expect(result.payment_id).toBe("pay-abc-123");
    expect(result.pay_address).toBe("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
    expect(result.pay_amount).toBe(0.00042);
  });

  it("should include x-api-key header", async () => {
    mockFetchResponse({
      payment_id: "pay-1",
      payment_status: "waiting",
      pay_address: "addr",
      pay_amount: 1,
      pay_currency: "btc",
      price_amount: 25,
      price_currency: "usd",
      order_id: "o1",
      order_description: "test",
      created_at: "2026-01-01T00:00:00Z",
      expiration_estimate_date: "2026-01-01T00:20:00Z",
      purchase_id: "p1",
    });

    await createPayment(testApiKey, testRequest);

    const call = findCall("/payment");
    expect(call).toBeDefined();
    const headers = call![1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(testApiKey);
  });

  it("should use POST method", async () => {
    mockFetchResponse({
      payment_id: "pay-1",
      payment_status: "waiting",
      pay_address: "addr",
      pay_amount: 1,
      pay_currency: "btc",
      price_amount: 25,
      price_currency: "usd",
      order_id: "o1",
      order_description: "test",
      created_at: "2026-01-01T00:00:00Z",
      expiration_estimate_date: "2026-01-01T00:20:00Z",
      purchase_id: "p1",
    });

    await createPayment(testApiKey, testRequest);

    const call = findCall("/payment");
    expect(call).toBeDefined();
    expect(call![1]?.method).toBe("POST");
  });

  it("should stringify the request body", async () => {
    mockFetchResponse({
      payment_id: "pay-1",
      payment_status: "waiting",
      pay_address: "addr",
      pay_amount: 1,
      pay_currency: "btc",
      price_amount: 25,
      price_currency: "usd",
      order_id: "o1",
      order_description: "test",
      created_at: "2026-01-01T00:00:00Z",
      expiration_estimate_date: "2026-01-01T00:20:00Z",
      purchase_id: "p1",
    });

    await createPayment(testApiKey, testRequest);

    const call = findCall("/payment");
    expect(call).toBeDefined();
    const body = call![1]?.body as string;
    const parsed = JSON.parse(body);
    expect(parsed.price_amount).toBe(25);
    expect(parsed.pay_currency).toBe("btc");
    expect(parsed.order_id).toBe("pro-1y-1234567890");
  });

  it("should throw on HTTP error with body", async () => {
    mockFetchResponse({ message: "Invalid currency" }, 400);

    await expect(createPayment(testApiKey, testRequest)).rejects.toThrow(
      "Create payment failed: 400",
    );
  });

  it("should throw on network error", async () => {
    mockFetchError("connection refused");

    await expect(createPayment(testApiKey, testRequest)).rejects.toThrow(
      "connection refused",
    );
  });
});

// ---------------------------------------------------------------------------
// getPaymentStatus
// ---------------------------------------------------------------------------

describe("getPaymentStatus", () => {
  const testApiKey = "test-api-key-12345";

  it("should return payment status on success", async () => {
    mockFetchResponse({
      payment_id: "pay-abc-123",
      payment_status: "waiting",
      pay_amount: 0.00042,
      actually_paid: 0,
      pay_currency: "btc",
      outcome_amount: 0,
      outcome_currency: "btc",
    });

    const result = await getPaymentStatus(testApiKey, "pay-abc-123");

    expect(result.payment_id).toBe("pay-abc-123");
    expect(result.payment_status).toBe("waiting");
    expect(result.actually_paid).toBe(0);
  });

  it("should include api key in headers", async () => {
    mockFetchResponse({
      payment_id: "pay-1",
      payment_status: "finished",
      pay_amount: 1,
      actually_paid: 1,
      pay_currency: "btc",
      outcome_amount: 1,
      outcome_currency: "btc",
    });

    await getPaymentStatus(testApiKey, "pay-1");

    const call = findCall("/payment/pay-1");
    expect(call).toBeDefined();
    const headers = call![1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(testApiKey);
  });

  it("should include payment ID in the URL path", async () => {
    mockFetchResponse({
      payment_id: "pay-xyz-789",
      payment_status: "confirming",
      pay_amount: 0.5,
      actually_paid: 0.5,
      pay_currency: "eth",
      outcome_amount: 0.5,
      outcome_currency: "eth",
    });

    await getPaymentStatus(testApiKey, "pay-xyz-789");

    const call = findCall("/payment/pay-xyz-789");
    expect(call).toBeDefined();
    expect(call![0]).toContain("/payment/pay-xyz-789");
  });

  it("should throw on HTTP error", async () => {
    mockFetchResponse({ message: "Not found" }, 404);

    await expect(getPaymentStatus(testApiKey, "bad-id")).rejects.toThrow(
      "Payment status check failed: 404",
    );
  });

  it("should report finished status", async () => {
    mockFetchResponse({
      payment_id: "pay-done",
      payment_status: "finished",
      pay_amount: 0.00042,
      actually_paid: 0.00042,
      pay_currency: "btc",
      outcome_amount: 25,
      outcome_currency: "usd",
    });

    const result = await getPaymentStatus(testApiKey, "pay-done");

    expect(result.payment_status).toBe("finished");
    expect(result.actually_paid).toBe(result.pay_amount);
  });

  it("should report partially_paid status", async () => {
    mockFetchResponse({
      payment_id: "pay-partial",
      payment_status: "partially_paid",
      pay_amount: 0.00042,
      actually_paid: 0.00020,
      pay_currency: "btc",
      outcome_amount: 12,
      outcome_currency: "usd",
    });

    const result = await getPaymentStatus(testApiKey, "pay-partial");

    expect(result.payment_status).toBe("partially_paid");
    expect(result.actually_paid).toBeLessThan(result.pay_amount);
  });
});

// ---------------------------------------------------------------------------
// getMinimumAmount
// ---------------------------------------------------------------------------

describe("getMinimumAmount", () => {
  it("should return minimum amount on success", async () => {
    mockFetchResponse({ min_amount: 0.0001 });

    const result = await getMinimumAmount("btc");

    expect(result).toBe(0.0001);
  });

  it("should lowercase the currency in query params", async () => {
    mockFetchResponse({ min_amount: 0.01 });

    await getMinimumAmount("ETH");

    const call = findCall("/min-amount");
    expect(call).toBeDefined();
    const url = call![0];
    expect(url).toContain("currency_from=eth");
    expect(url).toContain("currency_to=eth");
  });

  it("should return 0 on HTTP error (graceful fallback)", async () => {
    mockFetchResponse({ message: "error" }, 500);

    const result = await getMinimumAmount("btc");

    expect(result).toBe(0);
  });

  it("should return 0 on network error (graceful fallback)", async () => {
    mockFetchError("timeout");

    const result = await getMinimumAmount("btc");

    expect(result).toBe(0);
  });

  it("should return 0 when min_amount is missing from response", async () => {
    mockFetchResponse({});

    const result = await getMinimumAmount("btc");

    expect(result).toBe(0);
  });

  it("should use GET method", async () => {
    mockFetchResponse({ min_amount: 0.5 });

    await getMinimumAmount("ltc");

    const call = findCall("/min-amount");
    expect(call).toBeDefined();
    expect(call![1]?.method).toBe("GET");
  });
});
