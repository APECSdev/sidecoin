// packages/api/src/upstream.ts
//
// Thin client for the SupaQt read API (default https://supaqt.com/v1).
// Contract verified 2026-06-07; broadcast + rate-limit handoff 2026-06-11.
// SupaQt is READ-ONLY for reads; the broadcast route is the sole write path
// (relay-only — it forwards an already-signed tx to the chain's node and
// never signs). Broadcast is signet/L1 ONLY *today*; L2 sidechains return
// 501 for now, but dedicated sidechain broadcast endpoints are planned —
// when they ship they'll be the same chainId-addressed shape and need no
// client change. Reads are unauthenticated by default; an optional API key
// (Authorization: Bearer) is sent when configured, for an authorized-provider
// rate-limit exception. SupaQt returns snake_case rows and a bare-string
// error envelope ({ "error": "<msg>", ...context }) which we classify here so
// the worker can map upstream quirks to a clean, stable surface.

export const DEFAULT_SUPAQT_BASE = "https://supaqt.com/v1";

/**
 * DepositRecord exactly as SupaQt REST returns it (snake_case, verbatim).
 * NOTE: value_sats is a bigint decimal string and CAN exceed 2^53 — never
 * parse with Number/parseInt. l1_confirmations is hardcoded 0 in Tier-1
 * (means "unknown", not "zero confirmations").
 */
export interface UpstreamDepositRecord {
  l1_txid: string;
  vout: number;
  ctip_seq: number | null;
  address: string;
  value_sats: string;
  status: string;
  l1_confirmations: number;
  first_seen_ts: number | null;
  l1_confirmed_ts: number | null;
  l2_credited_ts: number | null;
}

export interface UpstreamDepositsPage {
  chainId: string;
  deposits: UpstreamDepositRecord[];
  next_cursor: string | null;
}

/**
 * Indexed balance exactly as SupaQt returns it (snake_case). Works on any
 * chain incl. signet. `balance` is a bigint sats decimal string ("0" for an
 * unknown address). updated_at_height === -1 means "address never seen"
 * (synthetic zero balance), NOT block height 0.
 */
export interface UpstreamBalance {
  chainId: string;
  address: string;
  balance: string;
  updated_at_height: number;
}

/**
 * Broadcast receipt exactly as SupaQt returns it (snake_case). broadcast_at
 * is unix seconds the relay accepted the tx. Re-broadcasting an already-known
 * tx is idempotent upstream (200 with the same txid, accepted:true).
 */
export interface UpstreamBroadcastReceipt {
  chainId: string;
  txid: string;
  accepted: boolean;
  broadcast_at: number;
}

/**
 * Shared classified-outcome variants. "not_provisioned" covers the biggest
 * known risk: the 6 drivechain DBs (everything except thunder) most likely
 * lack a `deposits` table, surfacing as a 400 "no such table" on the list
 * route and an unhandled platform 500 on the single route.
 *
 * These are split into route-specific unions below so the worker only has
 * to handle the variants a given call can actually produce, and `tsc`
 * narrows `ok` exhaustively (no leaked `undefined` message via `.data`).
 */
type OkOutcome<T> = { kind: "ok"; data: T };
type NotFoundOutcome = { kind: "not_found" };
type NotProvisionedOutcome = { kind: "not_provisioned" };
type UnknownChainOutcome = { kind: "unknown_chain" };
type ErrorOutcome = { kind: "error"; status: number; message: string };

/**
 * Outcome of `listDeposits`. The list route catches a missing table as a
 * 400 "no such table" -> not_provisioned, and a bad chainId as 404 ->
 * unknown_chain. It NEVER yields not_found (no single-row lookup).
 */
export type ListOutcome<T> =
  | OkOutcome<T>
  | NotProvisionedOutcome
  | UnknownChainOutcome
  | ErrorOutcome;

/**
 * Outcome of `getDeposit`. The single route does NOT catch DB errors (an
 * unhandled throw becomes a platform 500 -> not_provisioned) and a real
 * 404 -> not_found. It NEVER yields unknown_chain (no chain-level 404 on
 * the unwrapped single route).
 */
export type GetOutcome<T> =
  | OkOutcome<T>
  | NotFoundOutcome
  | NotProvisionedOutcome
  | ErrorOutcome;

/**
 * Outcome of `getBalance` (the real indexed balance route). A bad chainId
 * is 404 -> unknown_chain; an unprovisioned chain's balance index could
 * surface as "no such table" / platform 500 -> not_provisioned (so callers
 * can fall back to a derived balance). An unknown ADDRESS is NOT an error
 * here — upstream returns 200 with balance "0".
 */
export type GetBalanceOutcome<T> =
  | OkOutcome<T>
  | NotProvisionedOutcome
  | UnknownChainOutcome
  | ErrorOutcome;

/**
 * Outcome of `broadcast`. The relay route classifies the node's verdict:
 *   malformed     (400) — bad/undecodable hex
 *   rejected      (422) — node refused on the merits; reason carried verbatim.
 *                         DO NOT retry the same bytes — the tx was delivered
 *                         to bitcoind and rejected.
 *   unknown_chain (404) — disabled/unknown chain upstream
 *   unsupported   (501) — chain has no raw-tx submission *yet* (today: all
 *                         L2 sidechains). Do NOT retry the same call; use the
 *                         sidechain's own wallet verbs until a dedicated
 *                         broadcast endpoint ships.
 *   rate_limited  (429) — per-identity broadcast budget exceeded; honor
 *                         Retry-After.
 *   relay_error   (502) — relay/node transport problem; safe to retry w/ backoff.
 *   unavailable   (503) — relay not configured; retry later w/ backoff.
 *   error                — any other upstream/transport failure.
 */
export type BroadcastOutcome<T> =
  | OkOutcome<T>
  | { kind: "malformed"; message: string }
  | { kind: "rejected"; message: string }
  | UnknownChainOutcome
  | { kind: "unsupported"; message: string }
  | { kind: "rate_limited"; retryAfter: number }
  | { kind: "relay_error"; message: string }
  | { kind: "unavailable"; message: string }
  | ErrorOutcome;

/**
 * @deprecated Full historical union kept for backward compatibility with
 * any external importer. Prefer the route-specific `ListOutcome<T>` /
 * `GetOutcome<T>` so the impossible variant is unrepresentable per call.
 */
export type UpstreamOutcome<T> =
  | OkOutcome<T>
  | NotFoundOutcome
  | NotProvisionedOutcome
  | UnknownChainOutcome
  | ErrorOutcome;

function isNoSuchTable(msg: string): boolean {
  return msg.toLowerCase().includes("no such table");
}

export interface UpstreamClientOpts {
  baseUrl?: string;
  /**
   * Optional authorized-provider API key. When present it is sent as
   * `Authorization: Bearer <key>` on every read AND broadcast request, so
   * SupaQt can rate-limit us by key instead of by shared egress IP. Absent =>
   * anonymous per-IP limits (fail-open). Header name is provisional pending
   * SupaQt confirmation; change only authHeaders() if they pick another.
   */
  apiKey?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

export class UpstreamClient {
  private readonly base: string;
  private readonly apiKey?: string;
  private readonly f: typeof fetch;

  constructor(opts: UpstreamClientOpts = {}) {
    this.base = (opts.baseUrl ?? DEFAULT_SUPAQT_BASE).replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    // Bind the default global fetch to globalThis. Stored as an instance
    // property and later called as `this.f(...)`, an unbound native fetch
    // would receive the UpstreamClient as its `this` and throw "Illegal
    // invocation" on Cloudflare Workers, surfacing as a 502 upstream_error.
    // Injected impls (tests) are used as-is.
    this.f = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  /**
   * Authorized-provider auth header, or {} when no key is configured.
   * Provisional scheme: Authorization: Bearer <key>. If SupaQt chooses a
   * different header/scheme, this is the ONLY place that changes.
   */
  private authHeaders(): Record<string, string> {
    return this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
  }

  /** Low-level GET that always resolves to { status, body }. */
  private async raw(u: URL): Promise<{ status: number; body: unknown }> {
    const res = await this.f(u.toString(), {
      headers: { accept: "application/json", ...this.authHeaders() },
    });
    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // Platform 500s / non-JSON bodies (e.g. unhandled single-route
        // throw) land here; preserve the text under `error`.
        body = { error: text };
      }
    }
    return { status: res.status, body };
  }

  /**
   * Low-level POST (JSON body) that always resolves to { status, body,
   * retryAfter }. retryAfter is the parsed Retry-After header (seconds),
   * defaulting to 60 when the header is absent or non-numeric — used to
   * honor the upstream 429 broadcast budget.
   */
  private async rawPost(
    u: URL,
    payload: unknown,
  ): Promise<{ status: number; body: unknown; retryAfter: number }> {
    const res = await this.f(u.toString(), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...this.authHeaders(),
      },
      body: JSON.stringify(payload),
    });
    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // Non-JSON bodies (platform 500 etc.); preserve under `error`.
        body = { error: text };
      }
    }
    const ra = res.headers.get("retry-after");
    const retryAfter = ra && /^\d+$/.test(ra) ? Number(ra) : 60;
    return { status: res.status, body, retryAfter };
  }

  private static errString(body: unknown): string {
    if (body && typeof body === "object" && "error" in body) {
      const e = (body as { error: unknown }).error;
      if (typeof e === "string") return e;
    }
    return "";
  }

  /** Read a string-valued field off a JSON body, or "" when absent. */
  private static field(body: unknown, key: string): string {
    if (body && typeof body === "object" && key in body) {
      const v = (body as Record<string, unknown>)[key];
      if (typeof v === "string") return v;
    }
    return "";
  }

  /** GET /chains/:chainId/deposits (keyset paginated). */
  async listDeposits(
    chainId: string,
    params: {
      address?: string;
      status?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<ListOutcome<UpstreamDepositsPage>> {
    const u = new URL(`${this.base}/chains/${chainId}/deposits`);
    if (params.address) u.searchParams.set("address", params.address);
    if (params.status) u.searchParams.set("status", params.status);
    if (params.limit != null) {
      u.searchParams.set("limit", String(params.limit));
    }
    if (params.cursor) u.searchParams.set("cursor", params.cursor);

    let r: { status: number; body: unknown };
    try {
      r = await this.raw(u);
    } catch (e) {
      return {
        kind: "error",
        status: 502,
        message: e instanceof Error ? e.message : "upstream fetch failed",
      };
    }

    const { status, body } = r;
    if (status === 200) {
      return { kind: "ok", data: body as UpstreamDepositsPage };
    }

    const msg = UpstreamClient.errString(body);
    // Missing deposits table: reported as 400 "no such table" (list route
    // catches it) OR as a platform 500. Both mean "chain not provisioned".
    if (isNoSuchTable(msg) || status === 500) {
      return { kind: "not_provisioned" };
    }
    if (status === 404) return { kind: "unknown_chain" };
    return { kind: "error", status, message: msg || `upstream ${status}` };
  }

  /** GET /chains/:chainId/deposits/:l1Txid/:vout (single, unwrapped). */
  async getDeposit(
    chainId: string,
    l1Txid: string,
    vout: number,
  ): Promise<GetOutcome<UpstreamDepositRecord>> {
    const u = new URL(
      `${this.base}/chains/${chainId}/deposits/${l1Txid}/${vout}`,
    );

    let r: { status: number; body: unknown };
    try {
      r = await this.raw(u);
    } catch (e) {
      return {
        kind: "error",
        status: 502,
        message: e instanceof Error ? e.message : "upstream fetch failed",
      };
    }

    const { status, body } = r;
    if (status === 200) {
      return { kind: "ok", data: body as UpstreamDepositRecord };
    }

    const msg = UpstreamClient.errString(body);
    // Single route does NOT catch DB errors -> unhandled throw -> platform
    // 500 (non-JSON). Treat 500 / "no such table" as not provisioned.
    if (isNoSuchTable(msg) || status === 500) {
      return { kind: "not_provisioned" };
    }
    if (status === 404) return { kind: "not_found" };
    return { kind: "error", status, message: msg || `upstream ${status}` };
  }

  /**
   * GET /chains/:chainId/address/:address/balance — the real indexed balance
   * (any chain incl. signet). Unknown address is a 200 with balance "0", not
   * an error. A bad chainId is 404; an unprovisioned chain's balance index
   * may surface as 500 / "no such table" -> not_provisioned so callers can
   * fall back to a derived balance.
   */
  async getBalance(
    chainId: string,
    address: string,
  ): Promise<GetBalanceOutcome<UpstreamBalance>> {
    const u = new URL(
      `${this.base}/chains/${chainId}/address/${address}/balance`,
    );

    let r: { status: number; body: unknown };
    try {
      r = await this.raw(u);
    } catch (e) {
      return {
        kind: "error",
        status: 502,
        message: e instanceof Error ? e.message : "upstream fetch failed",
      };
    }

    const { status, body } = r;
    if (status === 200) {
      return { kind: "ok", data: body as UpstreamBalance };
    }

    const msg = UpstreamClient.errString(body);
    if (isNoSuchTable(msg) || status === 500) {
      return { kind: "not_provisioned" };
    }
    if (status === 404) return { kind: "unknown_chain" };
    return { kind: "error", status, message: msg || `upstream ${status}` };
  }

  /**
   * POST /chains/:chainId/broadcast — relay a fully-signed raw transaction
   * to the chain's node. The worker only relays; it never signs. Body is
   * { tx_hex }. Broadcast is signet/L1 ONLY *today* — L2 chainIds yield 501
   * (unsupported) for now; dedicated sidechain broadcast endpoints are
   * planned and will arrive on this same chainId-addressed shape. Returns the
   * node's resulting txid on success.
   *
   * Classification (see BroadcastOutcome): 200 ok (incl. idempotent
   * re-broadcast), 400 malformed, 422 rejected (verbatim reason, do not
   * retry), 404 unknown_chain, 429 rate_limited (Retry-After), 501
   * unsupported (no raw-tx submission yet), 502 relay_error / 503
   * unavailable (transport — retry w/ backoff).
   */
  async broadcast(
    chainId: string,
    txHex: string,
  ): Promise<BroadcastOutcome<UpstreamBroadcastReceipt>> {
    const u = new URL(`${this.base}/chains/${chainId}/broadcast`);

    let r: { status: number; body: unknown; retryAfter: number };
    try {
      r = await this.rawPost(u, { tx_hex: txHex });
    } catch (e) {
      return {
        kind: "error",
        status: 502,
        message: e instanceof Error ? e.message : "upstream fetch failed",
      };
    }

    const { status, body, retryAfter } = r;
    if (status === 200) {
      return { kind: "ok", data: body as UpstreamBroadcastReceipt };
    }

    const code = UpstreamClient.errString(body);
    // 400 { error:"malformed_tx", message } -> bad/undecodable hex.
    if (status === 400 || code === "malformed_tx") {
      return {
        kind: "malformed",
        message:
          UpstreamClient.field(body, "message") || "malformed transaction",
      };
    }
    // 422 { error:"rejected", reason } -> node refused on the merits; verbatim.
    if (status === 422 || code === "rejected") {
      return {
        kind: "rejected",
        message:
          UpstreamClient.field(body, "reason") ||
          "transaction rejected by node",
      };
    }
    // 429 { error:"rate_limited", scope:"broadcast" } + Retry-After.
    if (status === 429 || code === "rate_limited") {
      return { kind: "rate_limited", retryAfter };
    }
    // 501 -> no raw-tx submission yet (today: all L2 sidechains). Do not
    // retry the same call until a dedicated broadcast endpoint ships.
    if (status === 501 || code === "broadcast_unsupported") {
      return {
        kind: "unsupported",
        message:
          UpstreamClient.field(body, "message") ||
          "broadcast not available for this chain yet",
      };
    }
    // 502 -> relay/node transport problem; safe to retry with backoff.
    if (status === 502) {
      return { kind: "relay_error", message: code || "relay error" };
    }
    // 503 -> relay not configured; retry later with backoff.
    if (status === 503 || code === "broadcast_unavailable") {
      return {
        kind: "unavailable",
        message: code || "broadcast temporarily unavailable",
      };
    }
    // 404 { chainId, known:false } -> chain unknown/disabled upstream.
    if (status === 404) return { kind: "unknown_chain" };
    return { kind: "error", status, message: code || `upstream ${status}` };
  }
}
