// packages/api/src/routes/payments.ts
//
// Sidecoin monetization endpoints (D1-backed). FULLY WHITE-LABELED: the user
// NEVER sees NOWPayments. We use the NOWPayments *direct* Payments API
// (POST /payment) to mint a deposit address + exact pay amount, then our own
// UI renders the QR, address, price-lock timer, and status. The public key
// embedded in order_id is the SOLE canonical Founder identity; email is an
// optional receipt attribute only.
//
//   POST /v1/pay/create            -> create a direct crypto payment
//   GET  /v1/pay/status?paymentId= -> live status (proxied) + our founder data
//   GET  /v1/pay/currencies        -> available pay currencies (proxied)
//   POST /v1/webhook/nowpayments   -> IPN: HMAC-SHA512 verify, mint/credit
//
// Money model (Mullvad-style): one purchase = plan x quantity, paid up front,
// NO auto-renew. PRO is active while now < founders.paid_through. Stacking
// purchases extends from MAX(now, paid_through) so unused time is never burnt.

import type { Env } from "../lib/env.js";
import { json, err } from "../lib/shared.js";

const NOWPAYMENTS_API = "https://api.nowpayments.io/v1";
const IPN_CALLBACK_URL = "https://sidecoin.app/v1/webhook/nowpayments";

// Pricing (USD).
const PRICE_MONTHLY_USD = 5;
const PRICE_YEARLY_USD = 36;

// Temporary production minimum while NOWPayments is effectively routing to
// XMR outcome, where $5 is below the current provider minimum.
const MIN_MONTHLY_QUANTITY = 2;

// Seconds in an average month (30.44 days). Used to extend paid_through.
const SECONDS_PER_MONTH = 2_629_800;

// Sane upper bound on quantity to stop absurd invoices.
const MAX_QUANTITY = 120;

type Plan = "monthly" | "yearly";

interface CreateBody {
  plan?: unknown;
  quantity?: unknown;
  publicKey?: unknown;
  email?: unknown;
  payCurrency?: unknown;
}

/**
 * publicKey is validated as 66-char hex, so it can NEVER contain the "."
 * delimiter — no encoding needed, the key embeds directly in order_id.
 */
function buildOrderId(plan: Plan, quantity: number, publicKey: string): string {
  return `sc.${plan}.${quantity}.${publicKey}`;
}

interface ParsedOrder {
  plan: Plan;
  quantity: number;
  publicKey: string;
}

function parseOrderId(orderId: string): ParsedOrder | null {
  const parts = orderId.split(".");
  if (parts.length !== 4) return null;
  const [tag, plan, qtyRaw, publicKey] = parts;
  if (tag !== "sc") return null;
  if (plan !== "monthly" && plan !== "yearly") return null;
  if (!/^\d+$/.test(qtyRaw)) return null;
  const quantity = Number(qtyRaw);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return null;
  }
  if (!/^[0-9a-fA-F]{66}$/.test(publicKey)) return null;
  return { plan, quantity, publicKey: publicKey.toLowerCase() };
}

function priceFor(plan: Plan, quantity: number): number {
  return plan === "monthly"
    ? PRICE_MONTHLY_USD * quantity
    : PRICE_YEARLY_USD * quantity;
}

function durationMonths(plan: Plan, quantity: number): number {
  return plan === "monthly" ? quantity : quantity * 12;
}

function minimumQuantityFor(plan: Plan): number {
  return plan === "monthly" ? MIN_MONTHLY_QUANTITY : 1;
}

function currencyDisplayName(currency: string): string {
  const labels: Record<string, string> = {
    btc: "BTC",
    eth: "ETH",
    ltc: "LTC",
    xmr: "XMR",
    trx: "TRX",
    xlm: "XLM",
    xrp: "XRP",
    dash: "DASH",
    bch: "BCH",
    doge: "DOGE",
    maticmainnet: "MATIC",
    bnbbsc: "BNB Smart Chain",
    usdcerc20: "USDC ERC-20",
    usdterc20: "USDT ERC-20",
    usdttrc20: "USDT TRC-20",
    usdcsol: "USDC Solana",
    xec: "XEC",
    sol: "SOL",
  };

  return labels[currency.toLowerCase()] ?? currency.toUpperCase();
}

interface ProviderErrorBody {
  status?: boolean;
  statusCode?: number;
  code?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

function parseProviderError(detail: string): ProviderErrorBody | null {
  if (!detail) return null;

  try {
    return JSON.parse(detail) as ProviderErrorBody;
  } catch {
    return null;
  }
}

function extractProviderCode(detail: string): string {
  const parsed = parseProviderError(detail);
  return (
    parsed?.code ??
    parsed?.error?.code ??
    ""
  );
}

function extractProviderMessage(detail: string): string {
  if (!detail) return "";

  const parsed = parseProviderError(detail);
  if (typeof parsed?.message === "string") {
    return parsed.message;
  }

  if (typeof parsed?.error?.message === "string") {
    return parsed.error.message;
  }

  if (typeof parsed?.error?.details === "string") {
    return extractProviderMessage(parsed.error.details);
  }

  return detail;
}

function isUnsupportedProviderCurrency(detail: string, currency: string): boolean {
  const message = extractProviderMessage(detail).toLowerCase();
  const lc = currency.toLowerCase();

  return (
    message.includes("currency") &&
    message.includes(lc) &&
    message.includes("not found")
  );
}

function isAmountMinimalError(detail: string): boolean {
  const code = extractProviderCode(detail).toUpperCase();
  const message = extractProviderMessage(detail).toLowerCase();

  return (
    code === "AMOUNT_MINIMAL_ERROR" ||
    (message.includes("less than minimal") || message.includes("minimum"))
  );
}

function sanitizedProviderDetails(detail: string, payCurrency: string, priceAmount: number) {
  const parsed = parseProviderError(detail);

  return {
    payCurrency,
    priceAmountUsd: priceAmount,
    providerCode: extractProviderCode(detail) || undefined,
    providerMessage: extractProviderMessage(detail) || undefined,
    providerStatusCode: parsed?.statusCode,
  };
}

export async function handlePayments(
  req: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (url.pathname === "/v1/pay/create" && req.method === "POST") {
    return createPayment(req, env);
  }
  if (url.pathname === "/v1/pay/status" && req.method === "GET") {
    return paymentStatus(env, url);
  }
  if (url.pathname === "/v1/pay/currencies" && req.method === "GET") {
    return listCurrencies(env);
  }
  if (url.pathname === "/v1/webhook/nowpayments" && req.method === "POST") {
    return handleWebhook(req, env);
  }
  return err("not_found", `no route for ${url.pathname}`, 404);
}

// --- POST /v1/pay/create ---------------------------------------------------

async function createPayment(req: Request, env: Env): Promise<Response> {
  if (!env.NOWPAYMENTS_API_KEY) {
    return err("not_configured", "payments are not configured", 503);
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return err("bad_request", "request body must be JSON", 400);
  }

  const plan = body.plan;
  if (plan !== "monthly" && plan !== "yearly") {
    return err("bad_plan", 'plan must be "monthly" or "yearly"', 400);
  }

  const quantity = Number(body.quantity);
  const minQuantity = minimumQuantityFor(plan);

  if (!Number.isInteger(quantity) || quantity < minQuantity || quantity > MAX_QUANTITY) {
    return err(
      "bad_quantity",
      plan === "monthly"
        ? `monthly checkout currently requires at least ${MIN_MONTHLY_QUANTITY} months`
        : `quantity must be an integer ${minQuantity}..${MAX_QUANTITY}`,
      400,
    );
  }

  const rawKey = typeof body.publicKey === "string" ? body.publicKey.trim() : "";
  if (!/^[0-9a-fA-F]{66}$/.test(rawKey)) {
    return err("bad_public_key", "publicKey must be a 66-char hex string", 400);
  }

  const publicKey = rawKey.toLowerCase();

  const payCurrencyRaw =
    typeof body.payCurrency === "string" ? body.payCurrency.trim().toLowerCase() : "";
  if (!/^[a-z0-9]+$/.test(payCurrencyRaw)) {
    return err("bad_currency", "payCurrency must be a currency code", 400);
  }

  const email =
    typeof body.email === "string" && body.email.trim() !== ""
      ? body.email.trim()
      : null;

  const orderId = buildOrderId(plan, quantity, publicKey);
  const priceAmount = priceFor(plan, quantity);
  const months = durationMonths(plan, quantity);
  const description =
    plan === "monthly"
      ? `Sidecoin PRO — ${quantity} month(s)`
      : `Sidecoin PRO — ${quantity} year(s)`;

  const npRequestBody = {
    price_amount: priceAmount,
    price_currency: "usd",
    pay_currency: payCurrencyRaw,
    order_id: orderId,
    order_description: description,
    ipn_callback_url: IPN_CALLBACK_URL,
  };

  console.log("[pay/create] creating NOWPayments payment", {
    price_amount: priceAmount,
    price_currency: "usd",
    pay_currency: payCurrencyRaw,
    plan,
    quantity,
    order_id_prefix: `sc.${plan}.${quantity}`,
  });

  let np: Response;
  try {
    np = await fetch(`${NOWPAYMENTS_API}/payment`, {
      method: "POST",
      headers: {
        "x-api-key": env.NOWPAYMENTS_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(npRequestBody),
    });
  } catch (e) {
    return err(
      "upstream_error",
      e instanceof Error ? e.message : "NOWPayments unreachable",
      502,
    );
  }

  if (!np.ok) {
    const detail = await np.text().catch(() => "");
    console.error("[pay/create] NOWPayments payment failed", {
      status: np.status,
      detail,
      pay_currency: payCurrencyRaw,
      price_amount: priceAmount,
    });

    if (np.status === 400 && isUnsupportedProviderCurrency(detail, payCurrencyRaw)) {
      return err(
        "unsupported_currency",
        `${currencyDisplayName(payCurrencyRaw)} is temporarily unavailable. Please choose another payment option.`,
        400,
        sanitizedProviderDetails(detail, payCurrencyRaw, priceAmount),
      );
    }

    if (np.status === 400 && isAmountMinimalError(detail)) {
      return err(
        "amount_below_minimum",
        `The selected payment option is below the crypto processor minimum. Monthly checkout currently starts at ${MIN_MONTHLY_QUANTITY} months ($${PRICE_MONTHLY_USD * MIN_MONTHLY_QUANTITY}). Please choose the minimum duration or try another currency.`,
        400,
        sanitizedProviderDetails(detail, payCurrencyRaw, priceAmount),
      );
    }

    return err(
      "payment_provider_error",
      "The crypto payment processor could not create this payment. Please try another currency or try again in a few minutes.",
      502,
      sanitizedProviderDetails(detail, payCurrencyRaw, priceAmount),
    );
  }

  const pay = (await np.json()) as {
    payment_id?: string | number;
    pay_address?: string;
    pay_amount?: number;
    pay_currency?: string;
    payment_status?: string;
    expiration_estimate_date?: string;
    outcome_amount?: number;
    outcome_currency?: string;
  };

  console.log("[pay/create] NOWPayments payment created", {
    payment_id: pay.payment_id != null ? String(pay.payment_id) : null,
    pay_currency: pay.pay_currency ?? payCurrencyRaw,
    outcome_currency: pay.outcome_currency ?? null,
    payment_status: pay.payment_status ?? null,
  });

  if (!pay.payment_id || !pay.pay_address || pay.pay_amount == null) {
    return err(
      "payment_provider_error",
      "NOWPayments did not return a usable payment",
      502,
    );
  }

  const paymentId = String(pay.payment_id);
  const now = Math.floor(Date.now() / 1000);

  try {
    await env.DB.prepare(
      `INSERT INTO payments
         (payment_id, identity, order_id, plan, quantity, duration_months,
          price_amount, pay_currency, email, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(payment_id) DO NOTHING`,
    )
      .bind(
        paymentId,
        publicKey,
        orderId,
        plan,
        quantity,
        months,
        priceAmount,
        pay.pay_currency ?? payCurrencyRaw,
        email,
        pay.payment_status ?? "waiting",
        now,
      )
      .run();
  } catch (e) {
    console.error("[pay/create] failed to record ledger row", e);
  }

  return json({
    orderId,
    paymentId,
    payAddress: pay.pay_address,
    payAmount: pay.pay_amount,
    payCurrency: pay.pay_currency ?? payCurrencyRaw,
    priceAmountUsd: priceAmount,
    durationMonths: months,
    expiresAt: pay.expiration_estimate_date ?? null,
  });
}

// --- GET /v1/pay/status?paymentId= -----------------------------------------

async function paymentStatus(env: Env, url: URL): Promise<Response> {
  const paymentId = url.searchParams.get("paymentId");
  if (!paymentId) {
    return err("missing_payment_id", "paymentId query param required", 400);
  }

  const row = await env.DB.prepare(
    `SELECT order_id, status, confirmed_at, founder_number, pay_currency
       FROM payments WHERE payment_id = ?`,
  )
    .bind(paymentId)
    .first<{
      order_id: string;
      status: string;
      confirmed_at: number | null;
      founder_number: number | null;
      pay_currency: string | null;
    }>();

  let liveStatus: string | null = null;
  let actuallyPaid: number | null = null;
  let payAmount: number | null = null;
  let payCurrency: string | null = row?.pay_currency ?? null;

  if (env.NOWPAYMENTS_API_KEY) {
    try {
      const np = await fetch(`${NOWPAYMENTS_API}/payment/${paymentId}`, {
        method: "GET",
        headers: { "x-api-key": env.NOWPAYMENTS_API_KEY },
      });
      if (np.ok) {
        const p = (await np.json()) as {
          payment_status?: string;
          actually_paid?: number;
          pay_amount?: number;
          pay_currency?: string;
        };
        liveStatus = p.payment_status ?? null;
        actuallyPaid = p.actually_paid ?? null;
        payAmount = p.pay_amount ?? null;
        payCurrency = p.pay_currency ?? payCurrency;
      } else {
        console.error("[pay/status] NOWPayments status", np.status);
      }
    } catch (e) {
      console.error("[pay/status] NOWPayments unreachable (non-fatal)", e);
    }
  }

  if (!row && liveStatus == null) {
    return json({
      paymentId,
      paymentStatus: "unknown",
      confirmed: false,
      founderNumber: null,
    });
  }

  return json({
    paymentId,
    orderId: row?.order_id ?? null,
    paymentStatus: liveStatus ?? row?.status ?? "unknown",
    payAmount,
    actuallyPaid,
    payCurrency,
    confirmed: row?.confirmed_at != null,
    founderNumber: row?.founder_number ?? null,
  });
}

// --- GET /v1/pay/currencies ------------------------------------------------

async function listCurrencies(env: Env): Promise<Response> {
  if (!env.NOWPAYMENTS_API_KEY) {
    return err("not_configured", "payments are not configured", 503);
  }
  try {
    const np = await fetch(`${NOWPAYMENTS_API}/currencies`, {
      method: "GET",
      headers: { "x-api-key": env.NOWPAYMENTS_API_KEY },
    });
    if (!np.ok) {
      console.error("[pay/currencies] NOWPayments", np.status);
      return err("payment_provider_error", `NOWPayments returned ${np.status}`, 502);
    }
    const data = (await np.json()) as { currencies?: string[] };
    return json({ currencies: data.currencies ?? [] });
  } catch (e) {
    return err(
      "upstream_error",
      e instanceof Error ? e.message : "NOWPayments unreachable",
      502,
    );
  }
}

// --- POST /v1/webhook/nowpayments ------------------------------------------

async function handleWebhook(req: Request, env: Env): Promise<Response> {
  if (!env.NOWPAYMENTS_IPN_SECRET) {
    console.error("[webhook] NOWPAYMENTS_IPN_SECRET not configured");
    return err("not_configured", "webhook not configured", 503);
  }

  const sig = req.headers.get("x-nowpayments-sig");
  if (!sig) {
    return err("unauthorized", "missing signature", 401);
  }

  const raw = await req.text();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return err("bad_request", "body must be JSON", 400);
  }

  const expected = await hmacSha512Hex(env.NOWPAYMENTS_IPN_SECRET, sortedJson(payload));
  if (!timingSafeEqual(expected, sig.toLowerCase())) {
    console.error("[webhook] signature mismatch");
    return err("unauthorized", "invalid signature", 401);
  }

  const paymentId = payload.payment_id != null ? String(payload.payment_id) : "";
  const orderId = payload.order_id != null ? String(payload.order_id) : "";
  const status = payload.payment_status != null ? String(payload.payment_status) : "";
  const payCurrency = payload.pay_currency != null ? String(payload.pay_currency) : null;
  const actuallyPaid = payload.actually_paid != null ? Number(payload.actually_paid) : null;

  if (!paymentId || !orderId) {
    console.error("[webhook] missing payment_id/order_id", paymentId, orderId);
    return json({ ok: true });
  }
  const parsed = parseOrderId(orderId);
  if (!parsed) {
    console.error("[webhook] unparseable order_id", orderId);
    return json({ ok: true });
  }

  const { plan, quantity, publicKey } = parsed;
  const months = durationMonths(plan, quantity);
  const priceAmount = priceFor(plan, quantity);
  const now = Math.floor(Date.now() / 1000);

  const existing = await env.DB.prepare(
    `SELECT confirmed_at FROM payments WHERE payment_id = ?`,
  )
    .bind(paymentId)
    .first<{ confirmed_at: number | null }>();
  const alreadyConfirmed = existing?.confirmed_at != null;

  await env.DB.prepare(
    `INSERT INTO payments
       (payment_id, identity, order_id, plan, quantity, duration_months,
        price_amount, pay_currency, actually_paid, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(payment_id) DO UPDATE SET
       status = excluded.status,
       pay_currency = excluded.pay_currency,
       actually_paid = excluded.actually_paid`,
  )
    .bind(
      paymentId,
      publicKey,
      orderId,
      plan,
      quantity,
      months,
      priceAmount,
      payCurrency,
      actuallyPaid,
      status,
      now,
    )
    .run();

  if (status === "finished" && !alreadyConfirmed) {
    const durationSecs = months * SECONDS_PER_MONTH;
    const avatarSeed = await sha256Hex(publicKey);

    const mint = await env.DB.prepare(
      `INSERT INTO founders
         (identity, avatar_seed, paid_through, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(identity) DO NOTHING`,
    )
      .bind(publicKey, avatarSeed, now + durationSecs, now, now)
      .run();

    if (mint.meta.changes === 0) {
      await env.DB.prepare(
        `UPDATE founders
            SET paid_through = MAX(?, paid_through) + ?,
                updated_at = ?
          WHERE identity = ?`,
      )
        .bind(now, durationSecs, now, publicKey)
        .run();
    }

    const provis = await env.DB.prepare(
      `SELECT email FROM payments
        WHERE order_id = ? AND email IS NOT NULL
        ORDER BY created_at ASC LIMIT 1`,
    )
      .bind(orderId)
      .first<{ email: string | null }>();
    if (provis?.email) {
      await env.DB.prepare(
        `UPDATE founders SET email = COALESCE(email, ?) WHERE identity = ?`,
      )
        .bind(provis.email, publicKey)
        .run();
    }

    const fn = await env.DB.prepare(
      `SELECT founder_number FROM founders WHERE identity = ?`,
    )
      .bind(publicKey)
      .first<{ founder_number: number }>();
    const founderNumber = fn?.founder_number ?? null;

    await env.DB.prepare(
      `UPDATE payments
          SET confirmed_at = ?, founder_number = ?
        WHERE payment_id = ?`,
    )
      .bind(now, founderNumber, paymentId)
      .run();

    try {
      await maybeSendReceipt(env, provis?.email ?? null, founderNumber, plan, quantity);
    } catch (e) {
      console.error("[webhook] receipt email failed (non-fatal)", e);
    }

    console.log(
      `[webhook] credited founder #${founderNumber} (${status}) order=${orderId}`,
    );
  } else {
    console.log(`[webhook] status=${status} order=${orderId} (no credit)`);
  }

  return json({ ok: true });
}

// --- crypto helpers --------------------------------------------------------

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortObject((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function sortedJson(payload: Record<string, unknown>): string {
  return JSON.stringify(sortObject(payload));
}

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// --- receipt email ---------------------------------------------------------

async function maybeSendReceipt(
  env: Env,
  email: string | null,
  founderNumber: number | null,
  plan: Plan,
  quantity: number,
): Promise<void> {
  if (!env.RESEND_API_KEY || !email) {
    console.log("[receipt] skipped (no RESEND_API_KEY or no email on file)");
    return;
  }
  const period =
    plan === "monthly" ? `${quantity} month(s)` : `${quantity} year(s)`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: "Sidecoin Founders <founders@sidecoin.app>",
      to: [email],
      subject: `Welcome, Founder #${founderNumber ?? "?"} — Sidecoin PRO is active`,
      text:
        `Your Sidecoin PRO is active for ${period}.\n\n` +
        `Founder number: #${founderNumber ?? "pending"}\n` +
        `Track your standing: https://sidecoin.app/founders\n\n` +
        `Thank you for supporting Drivechain development.`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail}`);
  }
}
