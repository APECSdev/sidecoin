// packages/web/src/lib/nowpayments.ts
//
// Sidecoin Pro payment client. WHITE-LABEL: this talks ONLY to our own API
// (/v1/pay/*), never to NOWPayments directly. The API key lives exclusively
// in the Worker (sidecoin-api); the browser never sees it, and the user never
// sees NOWPayments branding.
//
// Endpoints (served by packages/api/src/routes/payments.ts):
//   POST /v1/pay/create            -> create a direct crypto payment
//   GET  /v1/pay/status?paymentId= -> live status + founder number
//   GET  /v1/pay/currencies        -> available pay currencies
//
// Env:
//   PUBLIC_API_BASE — base of our API (default "/v1", same-origin in prod).
//     Override in local dev, e.g. "https://sidecoin.app/v1".

// ─── Configuration ───────────────────────────────────────────

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.PUBLIC_API_BASE) ||
  "/v1";

// ─── Debug Logging ───────────────────────────────────────────

const DEBUG = typeof import.meta !== "undefined" && import.meta.env?.DEV;

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
  id: "monthly" | "yearly";
  label: string;
  priceUSD: number;
  /** Unit of one quantity step, for the duration stepper labels. */
  periodUnit: "month" | "year";
}

export const PLANS: Record<string, Plan> = {
  monthly: {
    id: "monthly",
    label: "Sidecoin PRO — Monthly",
    priceUSD: 5,
    periodUnit: "month",
  },
  yearly: {
    id: "yearly",
    label: "Sidecoin PRO — Yearly",
    priceUSD: 36,
    periodUnit: "year",
  },
};

/**
 * Curated low-minimum payment options for the temporary XMR-outcome period.
 *
 * Live NOWPayments testing confirmed that $10 direct payments succeed for
 * these currencies while $5 currently fails against the active outcome route.
 *
 * Intentionally excluded for now:
 *   - xlm / xrp: may require memo/tag/extra-id handling, which the current UI
 *     does not yet display.
 */
export const FEATURED_CURRENCIES = [
  "ltc",
  "btc",
  "eth",
  "xmr",
  "trx",
  "dash",
  "bch",
  "maticmainnet",
  "bnbbsc",
] as const;

/** Request body for POST /v1/pay/create. */
export interface CreatePaymentRequest {
  plan: "monthly" | "yearly";
  quantity: number;
  publicKey: string;
  payCurrency: string;
  email?: string;
}

/** Response from POST /v1/pay/create. */
export interface PaymentResponse {
  orderId: string;
  paymentId: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  priceAmountUsd: number;
  durationMonths: number;
  /** ISO 8601 price-lock expiry, or null if upstream didn't provide one. */
  expiresAt: string | null;
}

/** Response from GET /v1/pay/status. */
export interface PaymentStatus {
  paymentId: string;
  orderId: string | null;
  paymentStatus:
    | "waiting"
    | "confirming"
    | "confirmed"
    | "sending"
    | "partially_paid"
    | "finished"
    | "failed"
    | "refunded"
    | "expired"
    | "unknown";
  payAmount: number | null;
  actuallyPaid: number | null;
  payCurrency: string | null;
  confirmed: boolean;
  founderNumber: number | null;
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
}

export class PaymentApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = "PaymentApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ─── API Client (our API only) ───────────────────────────────

/**
 * Create a crypto payment via our Worker. The Worker calls NOWPayments with
 * the secret key attached; the browser never holds it.
 */
export async function createPayment(
  request: CreatePaymentRequest,
): Promise<PaymentResponse> {
  debug("Creating payment", {
    plan: request.plan,
    quantity: request.quantity,
    currency: request.payCurrency,
  });

  try {
    const res = await fetch(`${API_BASE}/pay/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const body = await res.text();
      debugError("Create payment failed", res.status, body);

      let message = `Create payment failed: ${res.status}`;
      let code = "payment_create_failed";
      let details: unknown;

      try {
        const parsed = JSON.parse(body) as ApiErrorBody;
        if (parsed.error?.message) {
          message = parsed.error.message;
        } else if (parsed.message) {
          message = parsed.message;
        }
        if (parsed.error?.code) {
          code = parsed.error.code;
        }
        details = parsed.error?.details;
      } catch {
        // Keep the generic status-based message if the response is not JSON.
      }

      throw new PaymentApiError(message, code, res.status, details);
    }

    const data: PaymentResponse = await res.json();
    debug("Payment created", data.paymentId);
    return data;
  } catch (err) {
    debugError("createPayment error:", err);
    throw err;
  }
}

/** Check payment status via our Worker (live status + founder number). */
export async function getPaymentStatus(
  paymentId: string,
): Promise<PaymentStatus> {
  debug("Checking payment status", paymentId);

  try {
    const params = new URLSearchParams({ paymentId });
    const res = await fetch(`${API_BASE}/pay/status?${params}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const body = await res.text();
      debugError("Payment status check failed", res.status, body);
      throw new Error(`Payment status check failed: ${res.status}`);
    }

    const data: PaymentStatus = await res.json();
    debug("Payment status:", data.paymentStatus);
    return data;
  } catch (err) {
    debugError("getPaymentStatus error:", err);
    throw err;
  }
}

/** Fetch the available pay currencies (proxied through our Worker). */
export async function getAvailableCurrencies(): Promise<string[]> {
  debug("Fetching available currencies");

  try {
    const res = await fetch(`${API_BASE}/pay/currencies`, {
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
 * Generate a payment URI for QR code display.
 */
export function buildPaymentURI(
  currency: string,
  address: string,
  amount: number,
): string {
  const lc = currency.toLowerCase();

  // Bitcoin-family
  if (["btc", "ltc", "bch", "doge", "xec"].includes(lc)) {
    const scheme: Record<string, string> = {
      btc: "bitcoin",
      ltc: "litecoin",
      bch: "bitcoincash",
      doge: "dogecoin",
      xec: "ecash",
    };
    const uri = `${scheme[lc] ?? lc}:${address}?amount=${amount}`;
    debug("Built payment URI:", uri);
    return uri;
  }

  // Dash
  if (lc === "dash") {
    const uri = `dash:${address}?amount=${amount}`;
    debug("Built payment URI:", uri);
    return uri;
  }

  // Monero
  if (lc === "xmr") {
    const uri = `monero:${address}?tx_amount=${amount}`;
    debug("Built payment URI:", uri);
    return uri;
  }

  // Ethereum-family (ETH, ERC-20 tokens). For non-Ethereum EVM chains like
  // maticmainnet/bnbbsc, return the raw address so wallets do not accidentally
  // open the wrong chain.
  if (["eth", "usdcerc20", "usdterc20"].includes(lc)) {
    const uri = `ethereum:${address}?value=${amount}`;
    debug("Built payment URI:", uri);
    return uri;
  }

  // Fallback: just the address
  debug("No URI scheme for", lc, "— returning address");
  return address;
}
