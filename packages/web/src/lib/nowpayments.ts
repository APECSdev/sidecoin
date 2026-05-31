// packages/web/src/lib/nowpayments.ts
//
// NOWPayments API client for Sidecoin Pro purchases.
// Uses the NOWPayments REST API directly (no hosted checkout).
//
// Docs: https://documenter.getpostman.com/view/7907941/S1a32n38
//
// Environment variables (set in Cloudflare Pages dashboard):
//   PUBLIC_NOWPAYMENTS_API_URL — base URL (default: https://api.nowpayments.io/v1)
//   NOWPAYMENTS_API_KEY        — API key (server-side only, used via proxy/edge fn)

// ─── Configuration ───────────────────────────────────────────

const API_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.PUBLIC_NOWPAYMENTS_API_URL) ||
  "https://api.nowpayments.io/v1";

// ─── Debug Logging ───────────────────────────────────────────

const DEBUG =
  typeof import.meta !== "undefined" && import.meta.env?.DEV;

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log("[nowpayments]", ...args);
  }
}

function debugError(...args: unknown[]): void {
  console.error("[nowpayments]", ...args);
}

// ─── Types ───────────────────────────────────────────────────

export interface Plan {
  id: "pro-1y" | "pro-2y";
  label: string;
  priceUSD: number;
  durationMonths: number;
}

export const PLANS: Record<string, Plan> = {
  "pro-1y": {
    id: "pro-1y",
    label: "Founding Member — 1 Year",
    priceUSD: 25,
    durationMonths: 12,
  },
  "pro-2y": {
    id: "pro-2y",
    label: "Founding Member — 2 Years",
    priceUSD: 35,
    durationMonths: 24,
  },
};

/** Curated list of cryptocurrencies shown by default */
export const FEATURED_CURRENCIES = ["btc", "eth", "usdcerc20", "ltc"] as const;

export interface CurrencyInfo {
  code: string;
  name: string;
  /** Minimum payment amount in this currency */
  minAmount?: number;
}

export interface EstimateResponse {
  /** Estimated crypto amount to pay */
  estimated_amount: number;
  currency_from: string;
  currency_to: string;
}

export interface InvoiceRequest {
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  order_id: string;
  order_description: string;
  /** Wallet-derived user identifier */
  payer_email?: string;
  /** URL to redirect after payment (not used in API flow, but stored) */
  success_url?: string;
  /** Custom fields passed through to webhook */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface PaymentResponse {
  payment_id: string;
  payment_status: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  order_id: string;
  order_description: string;
  /** ISO 8601 timestamp — payment created */
  created_at: string;
  /** ISO 8601 timestamp — price lock expires */
  expiration_estimate_date: string;
  /** QR code data — the pay_address with amount encoded */
  purchase_id: string;
}

export interface PaymentStatus {
  payment_id: string;
  payment_status:
    | "waiting"
    | "confirming"
    | "confirmed"
    | "sending"
    | "partially_paid"
    | "finished"
    | "failed"
    | "refunded"
    | "expired";
  pay_amount: number;
  actually_paid: number;
  pay_currency: string;
  outcome_amount: number;
  outcome_currency: string;
}

// ─── API Client ──────────────────────────────────────────────

/**
 * Fetch available currencies from NOWPayments.
 *
 * This is a public endpoint — no API key required.
 */
export async function getAvailableCurrencies(): Promise<string[]> {
  debug("Fetching available currencies");

  try {
    const res = await fetch(`${API_URL}/currencies`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      debugError("Failed to fetch currencies", res.status, res.statusText);
      throw new Error(`Failed to fetch currencies: ${res.status}`);
    }

    const data = await res.json();
    debug("Available currencies:", data.currencies?.length);
    return data.currencies ?? [];
  } catch (err) {
    debugError("getAvailableCurrencies error:", err);
    throw err;
  }
}

/**
 * Get estimated price in a specific cryptocurrency.
 *
 * Public endpoint — no API key required.
 */
export async function getEstimate(
  amountUSD: number,
  payCurrency: string,
): Promise<EstimateResponse> {
  debug("Getting estimate", { amountUSD, payCurrency });

  try {
    const params = new URLSearchParams({
      amount: amountUSD.toString(),
      currency_from: "usd",
      currency_to: payCurrency.toLowerCase(),
    });

    const res = await fetch(`${API_URL}/estimate?${params}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const body = await res.text();
      debugError("Estimate failed", res.status, body);
      throw new Error(`Estimate failed: ${res.status}`);
    }

    const data: EstimateResponse = await res.json();
    debug("Estimate result:", data);
    return data;
  } catch (err) {
    debugError("getEstimate error:", err);
    throw err;
  }
}

/**
 * Create a payment invoice.
 *
 * ⚠️  REQUIRES API KEY — this must be called through a server-side
 * proxy (Cloudflare Pages Function, edge middleware, or your own API).
 * The API key must NEVER be exposed to the client.
 *
 * The client calls YOUR endpoint (e.g. /api/create-payment),
 * which calls NOWPayments with the key attached.
 */
export async function createPayment(
  apiKey: string,
  request: InvoiceRequest,
): Promise<PaymentResponse> {
  debug("Creating payment", {
    amount: request.price_amount,
    currency: request.pay_currency,
    orderId: request.order_id,
  });

  try {
    const res = await fetch(`${API_URL}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const body = await res.text();
      debugError("Create payment failed", res.status, body);
      throw new Error(`Create payment failed: ${res.status} — ${body}`);
    }

    const data: PaymentResponse = await res.json();
    debug("Payment created", data.payment_id);
    return data;
  } catch (err) {
    debugError("createPayment error:", err);
    throw err;
  }
}

/**
 * Check payment status.
 *
 * ⚠️  REQUIRES API KEY — same server-side proxy constraint.
 */
export async function getPaymentStatus(
  apiKey: string,
  paymentId: string,
): Promise<PaymentStatus> {
  debug("Checking payment status", paymentId);

  try {
    const res = await fetch(`${API_URL}/payment/${paymentId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      debugError("Payment status check failed", res.status, body);
      throw new Error(`Payment status check failed: ${res.status}`);
    }

    const data: PaymentStatus = await res.json();
    debug("Payment status:", data.payment_status);
    return data;
  } catch (err) {
    debugError("getPaymentStatus error:", err);
    throw err;
  }
}

/**
 * Get the minimum payment amount for a given currency.
 *
 * Public endpoint — no API key required.
 */
export async function getMinimumAmount(
  payCurrency: string,
): Promise<number> {
  debug("Fetching minimum amount for", payCurrency);

  try {
    const params = new URLSearchParams({
      currency_from: payCurrency.toLowerCase(),
      currency_to: payCurrency.toLowerCase(),
    });

    const res = await fetch(`${API_URL}/min-amount?${params}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      debugError("Min amount fetch failed", res.status);
      return 0;
    }

    const data = await res.json();
    debug("Minimum amount:", data.min_amount);
    return data.min_amount ?? 0;
  } catch (err) {
    debugError("getMinimumAmount error:", err);
    return 0;
  }
}

/**
 * Generate a BIP-21 / EIP-681 payment URI for QR code display.
 *
 * Produces URIs like:
 *   bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?amount=0.00042
 *   ethereum:0x123...?value=15000000000000000
 */
export function buildPaymentURI(
  currency: string,
  address: string,
  amount: number,
): string {
  const lc = currency.toLowerCase();

  // Bitcoin-family
  if (["btc", "ltc", "bch", "doge"].includes(lc)) {
    const scheme: Record<string, string> = {
      btc: "bitcoin",
      ltc: "litecoin",
      bch: "bitcoincash",
      doge: "dogecoin",
    };
    const uri = `${scheme[lc] ?? lc}:${address}?amount=${amount}`;
    debug("Built payment URI:", uri);
    return uri;
  }

  // Ethereum-family (ETH, ERC-20 tokens)
  if (["eth", "usdcerc20", "usdterc20"].includes(lc)) {
    // For native ETH: ethereum:<address>?value=<wei>
    // For ERC-20 display purposes we just use the address + amount
    const uri = `ethereum:${address}?value=${amount}`;
    debug("Built payment URI:", uri);
    return uri;
  }

  // Fallback: just the address
  debug("No URI scheme for", lc, "— returning address");
  return address;
}
