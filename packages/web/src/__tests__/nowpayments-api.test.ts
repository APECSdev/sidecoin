// packages/web/src/__tests__/nowpayments-api.test.ts
//
// Tests for the NOWPayments API client functions.
// Uses fetch mocking — no real network calls.
// WHITE-LABEL: these functions talk ONLY to our own Worker (/v1/pay/*),
// never to NOWPayments directly, and the browser never holds the API key.
// Covers getAvailableCurrencies, createPayment, and getPaymentStatus.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAvailableCurrencies,
  createPayment,
  getPaymentStatus,
} from "../lib/nowpayments";
import type { CreatePaymentRequest } from "../lib/nowpayments";

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

function mockFetchTextResponse(body: string, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(JSON.parse(body)),
    text: () => Promise.resolve(body),
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
// createPayment
// ---------------------------------------------------------------------------

describe("createPayment", () => {
  const testRequest: CreatePaymentRequest = {
    plan: "monthly",
    quantity: 1,
    publicKey: "0317162c921dc4d2518f9a101db33695df1afb56ab82f5ff3e5da6eec3ca5cd917",
    payCurrency: "btc",
  };

  it("should return payment data on success", async () => {
    const mockPayment = {
      orderId: "monthly-1234567890",
      paymentId: "pay-abc-123",
      payAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      payAmount: 0.00042,
      payCurrency: "btc",
      priceAmountUsd: 5,
      durationMonths: 1,
      expiresAt: "2026-05-31T00:20:00Z",
    };

    mockFetchResponse(mockPayment);

    const result = await createPayment(testRequest);

    expect(result.paymentId).toBe("pay-abc-123");
    expect(result.payAddress).toBe("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
    expect(result.payAmount).toBe(0.00042);
  });

  it("should NOT include an api key header (white-label: key stays in the Worker)", async () => {
    mockFetchResponse({
      orderId: "o1",
      paymentId: "pay-1",
      payAddress: "addr",
      payAmount: 1,
      payCurrency: "btc",
      priceAmountUsd: 5,
      durationMonths: 1,
      expiresAt: null,
    });

    await createPayment(testRequest);

    const call = findCall("/pay/create");
    expect(call).toBeDefined();
    const headers = call![1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("should call our own /pay/create endpoint with POST", async () => {
    mockFetchResponse({
      orderId: "o1",
      paymentId: "pay-1",
      payAddress: "addr",
      payAmount: 1,
      payCurrency: "btc",
      priceAmountUsd: 5,
      durationMonths: 1,
      expiresAt: null,
    });

    await createPayment(testRequest);

    const call = findCall("/pay/create");
    expect(call).toBeDefined();
    expect(call![0]).toContain("/pay/create");
    expect(call![1]?.method).toBe("POST");
  });

  it("should stringify the request body", async () => {
    mockFetchResponse({
      orderId: "o1",
      paymentId: "pay-1",
      payAddress: "addr",
      payAmount: 1,
      payCurrency: "btc",
      priceAmountUsd: 5,
      durationMonths: 1,
      expiresAt: null,
    });

    await createPayment(testRequest);

    const call = findCall("/pay/create");
    expect(call).toBeDefined();
    const body = call![1]?.body as string;
    const parsed = JSON.parse(body);
    expect(parsed.plan).toBe("monthly");
    expect(parsed.quantity).toBe(1);
    expect(parsed.payCurrency).toBe("btc");
    expect(parsed.publicKey).toBe(testRequest.publicKey);
  });

  it("should preserve structured backend error messages", async () => {
    mockFetchResponse(
      {
        error: {
          code: "unsupported_currency",
          message: "USDC ERC-20 is temporarily unavailable. Please choose BTC, ETH, or LTC.",
        },
      },
      400,
    );

    await expect(createPayment(testRequest)).rejects.toThrow(
      "USDC ERC-20 is temporarily unavailable. Please choose BTC, ETH, or LTC.",
    );
  });

  it("should fall back to HTTP status when error body is unstructured JSON", async () => {
    mockFetchResponse({ message: "" }, 400);

    await expect(createPayment(testRequest)).rejects.toThrow(
      "Create payment failed: 400",
    );
  });

  it("should fall back to HTTP status when error body is not JSON", async () => {
    mockFetchTextResponse("Bad gateway", 502);

    await expect(createPayment(testRequest)).rejects.toThrow(
      "Create payment failed: 502",
    );
  });

  it("should throw on network error", async () => {
    mockFetchError("connection refused");

    await expect(createPayment(testRequest)).rejects.toThrow(
      "connection refused",
    );
  });
});

// ---------------------------------------------------------------------------
// getPaymentStatus
// ---------------------------------------------------------------------------

describe("getPaymentStatus", () => {
  it("should return payment status on success", async () => {
    mockFetchResponse({
      paymentId: "pay-abc-123",
      orderId: "monthly-1234567890",
      paymentStatus: "waiting",
      payAmount: 0.00042,
      actuallyPaid: 0,
      payCurrency: "btc",
      confirmed: false,
      founderNumber: null,
    });

    const result = await getPaymentStatus("pay-abc-123");

    expect(result.paymentId).toBe("pay-abc-123");
    expect(result.paymentStatus).toBe("waiting");
    expect(result.actuallyPaid).toBe(0);
  });

  it("should NOT include an api key header (white-label: key stays in the Worker)", async () => {
    mockFetchResponse({
      paymentId: "pay-1",
      orderId: "o1",
      paymentStatus: "finished",
      payAmount: 1,
      actuallyPaid: 1,
      payCurrency: "btc",
      confirmed: true,
      founderNumber: 42,
    });

    await getPaymentStatus("pay-1");

    const call = findCall("/pay/status");
    expect(call).toBeDefined();
    const headers = call![1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("should include the payment ID in the query string", async () => {
    mockFetchResponse({
      paymentId: "pay-xyz-789",
      orderId: "o1",
      paymentStatus: "confirming",
      payAmount: 0.5,
      actuallyPaid: 0.5,
      payCurrency: "eth",
      confirmed: false,
      founderNumber: null,
    });

    await getPaymentStatus("pay-xyz-789");

    const call = findCall("/pay/status");
    expect(call).toBeDefined();
    expect(call![0]).toContain("paymentId=pay-xyz-789");
  });

  it("should throw on HTTP error", async () => {
    mockFetchResponse({ message: "Not found" }, 404);

    await expect(getPaymentStatus("bad-id")).rejects.toThrow(
      "Payment status check failed: 404",
    );
  });

  it("should report finished status", async () => {
    mockFetchResponse({
      paymentId: "pay-done",
      orderId: "o1",
      paymentStatus: "finished",
      payAmount: 0.00042,
      actuallyPaid: 0.00042,
      payCurrency: "btc",
      confirmed: true,
      founderNumber: 7,
    });

    const result = await getPaymentStatus("pay-done");

    expect(result.paymentStatus).toBe("finished");
    expect(result.actuallyPaid).toBe(result.payAmount);
    expect(result.confirmed).toBe(true);
    expect(result.founderNumber).toBe(7);
  });

  it("should report partially_paid status", async () => {
    mockFetchResponse({
      paymentId: "pay-partial",
      orderId: "o1",
      paymentStatus: "partially_paid",
      payAmount: 0.00042,
      actuallyPaid: 0.00020,
      payCurrency: "btc",
      confirmed: false,
      founderNumber: null,
    });

    const result = await getPaymentStatus("pay-partial");

    expect(result.paymentStatus).toBe("partially_paid");
    expect(result.actuallyPaid!).toBeLessThan(result.payAmount!);
  });
});
