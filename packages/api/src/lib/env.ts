// packages/api/src/lib/env.ts
//
// The Worker's full binding surface. shared.ts owns the upstream-adapter Env
// (SupaQt base URL + optional provider key); this extends it with the
// monetization bindings (D1 + NOWPayments/Resend secrets) so the giant
// shared.ts stays a minimal, single-purpose source of truth. The runtime env
// always carries every binding regardless of which type a handler accepts;
// handlers that only touch upstream keep accepting the base Env, while the
// payment/founder handlers accept this wider type.

import type { Env as BaseEnv } from "./shared.js";

export interface Env extends BaseEnv {
  /** Founders + payments D1 database (binding "DB"). */
  DB: D1Database;
  /** NOWPayments REST key (x-api-key) for creating invoices. */
  NOWPAYMENTS_API_KEY?: string;
  /** NOWPayments IPN secret for HMAC-SHA512 webhook verification. */
  NOWPAYMENTS_IPN_SECRET?: string;
  /** Optional Resend key for receipt emails (deferred; best-effort no-op). */
  RESEND_API_KEY?: string;
}
