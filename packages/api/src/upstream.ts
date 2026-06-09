// packages/api/src/upstream.ts
//
// Thin client for the SupaQt read API (default https://supaqt.com/v1).
// Contract verified 2026-06-07. SupaQt is READ-ONLY and UNAUTHENTICATED.
// It returns snake_case rows and a bare-string error envelope
// ({ "error": "<msg>", ...context }) which we classify here so the worker
// can map upstream quirks to a clean, stable surface.

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
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

export class UpstreamClient {
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(opts: UpstreamClientOpts = {}) {
    this.base = (opts.baseUrl ?? DEFAULT_SUPAQT_BASE).replace(/\/+$/, "");
    // Bind the default global fetch to globalThis. Stored as an instance
    // property and later called as `this.f(...)`, an unbound native fetch
    // would receive the UpstreamClient as its `this` and throw "Illegal
    // invocation" on Cloudflare Workers, surfacing as a 502 upstream_error.
    // Injected impls (tests) are used as-is.
    this.f = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  /** Low-level GET that always resolves to { status, body }. */
  private async raw(u: URL): Promise<{ status: number; body: unknown }> {
    const res = await this.f(u.toString(), {
      headers: { accept: "application/json" },
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

  private static errString(body: unknown): string {
    if (body && typeof body === "object" && "error" in body) {
      const e = (body as { error: unknown }).error;
      if (typeof e === "string") return e;
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
}
