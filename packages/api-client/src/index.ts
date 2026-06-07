// packages/api-client/src/index.ts
//
// Frozen public client for the Sidecoin adapter API. Talks ONLY to the
// adapter (default https://sidecoin.app/v1) — never to SupaQt directly.
//
// The adapter returns a stable, slot-addressed, camelCase surface with a
// normalized error envelope { error: { code, message, details? } }.
// Amounts (valueSats/totalSats) arrive as decimal strings and CAN exceed
// 2^53; this client coerces them to bigint and REJECTS unsafe input.

export const DEFAULT_BASE_URL = "https://sidecoin.app/v1";

/** The network this client is built for. Used to guard against mismatches. */
export const EXPECTED_NETWORK = "ecash-signet" as const;

export function isExpectedNetwork(n: string): boolean {
  return n === EXPECTED_NETWORK;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown for any non-2xx response or transport failure. Mirrors the
 * adapter's normalized envelope: code is the machine-readable string,
 * message is human-readable, httpStatus is the HTTP status (0 = transport).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    httpStatus: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Wire types (camelCase, as returned by the adapter)
// ---------------------------------------------------------------------------

export interface SidechainSummary {
  slot: number;
  id: string;
  displayName: string;
  description: string;
  status: string;
}

/** Deposit as returned by the adapter (valueSats is a decimal string). */
interface WireDeposit {
  slot: number;
  chainId: string;
  l1Txid: string;
  vout: number;
  ctipSeq: number | null;
  address: string;
  valueSats: string;
  status: string;
  confirmations: number | null;
  firstSeenTs: number | null;
  l1ConfirmedTs: number | null;
  l2CreditedTs: number | null;
}

/** Deposit with valueSats coerced to bigint for safe arithmetic. */
export interface Deposit extends Omit<WireDeposit, "valueSats"> {
  valueSats: bigint;
}

export interface DepositsPage {
  slot: number;
  chainId: string;
  provisioned: boolean;
  deposits: Deposit[];
  nextCursor: string | null;
}

export interface WalletBalance {
  slot: number;
  chainId: string;
  address: string;
  provisioned: boolean;
  totalSats: bigint;
  depositCount: number;
  truncated: boolean;
  note: string;
}

// ---------------------------------------------------------------------------
// BigInt coercion (rejects unsafe input)
// ---------------------------------------------------------------------------

function coerceSats(v: unknown, field: string): bigint {
  if (typeof v !== "string" || !/^\d+$/.test(v)) {
    throw new ApiError(
      "bad_amount",
      `expected non-negative integer string for ${field}, got ${String(v)}`,
      0,
    );
  }
  return BigInt(v);
}

function coerceDeposit(w: WireDeposit): Deposit {
  return { ...w, valueSats: coerceSats(w.valueSats, "valueSats") };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface ClientOptions {
  baseUrl?: string;
  /** Injectable fetch for tests / non-browser runtimes. */
  fetchImpl?: typeof fetch;
}

export interface ListDepositsParams {
  address?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export class SidecoinClient {
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(opts: ClientOptions = {}) {
    this.base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.f = opts.fetchImpl ?? fetch;
  }

  private async get<T>(path: string, query?: URLSearchParams): Promise<T> {
    const qs = query && [...query.keys()].length ? `?${query}` : "";
    let res: Response;
    try {
      res = await this.f(`${this.base}${path}${qs}`, {
        headers: { accept: "application/json" },
      });
    } catch (e) {
      throw new ApiError(
        "network_error",
        e instanceof Error ? e.message : "request failed",
        0,
      );
    }

    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!res.ok) {
      const env =
        body && typeof body === "object" && "error" in body
          ? (body as { error: { code?: string; message?: string; details?: unknown } })
              .error
          : undefined;
      throw new ApiError(
        env?.code ?? "http_error",
        env?.message ?? `HTTP ${res.status}`,
        res.status,
        env?.details,
      );
    }
    return body as T;
  }

  /** GET /sidechains — active drivechains known to the adapter. */
  async getSidechains(): Promise<SidechainSummary[]> {
    const r = await this.get<{ sidechains: SidechainSummary[] }>(
      "/sidechains",
    );
    return r.sidechains;
  }

  /** GET /wallet/:slot/deposits */
  async getDeposits(
    slot: number,
    params: ListDepositsParams = {},
  ): Promise<DepositsPage> {
    const q = new URLSearchParams();
    if (params.address) q.set("address", params.address);
    if (params.status) q.set("status", params.status);
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.cursor) q.set("cursor", params.cursor);

    const r = await this.get<{
      slot: number;
      chainId: string;
      provisioned: boolean;
      deposits: WireDeposit[];
      nextCursor: string | null;
    }>(`/wallet/${slot}/deposits`, q);

    return {
      slot: r.slot,
      chainId: r.chainId,
      provisioned: r.provisioned,
      deposits: r.deposits.map(coerceDeposit),
      nextCursor: r.nextCursor,
    };
  }

  /** GET /wallet/:slot/deposits/:l1Txid/:vout */
  async getDeposit(
    slot: number,
    l1Txid: string,
    vout: number,
  ): Promise<Deposit> {
    const w = await this.get<WireDeposit>(
      `/wallet/${slot}/deposits/${l1Txid}/${vout}`,
    );
    return coerceDeposit(w);
  }

  /** GET /wallet/:slot/balance — DERIVED inflow, not spendable balance. */
  async getWalletBalance(
    slot: number,
    address: string,
  ): Promise<WalletBalance> {
    const q = new URLSearchParams({ address });
    const r = await this.get<{
      slot: number;
      chainId: string;
      address: string;
      provisioned: boolean;
      totalSats: string;
      depositCount: number;
      truncated: boolean;
      note: string;
    }>(`/wallet/${slot}/balance`, q);

    return { ...r, totalSats: coerceSats(r.totalSats, "totalSats") };
  }
}

// ---------------------------------------------------------------------------
// Idempotency key (for future write paths; read API has none today)
// ---------------------------------------------------------------------------

/**
 * Generate a fresh idempotency key. Uses crypto.randomUUID when available,
 * falling back to a timestamp+random composite.
 */
export function newIdempotencyKey(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `idk-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Poller (exponential backoff + jitter)
// ---------------------------------------------------------------------------

export interface PollerOptions<T> {
  /** One polling attempt. */
  fetch: () => Promise<T>;
  /** Return true to stop polling and resolve with the value. */
  done: (value: T) => boolean;
  /** Base delay in ms (default 1000). */
  baseDelayMs?: number;
  /** Max delay cap in ms (default 30000). */
  maxDelayMs?: number;
  /** Max attempts before rejecting (default 20). */
  maxAttempts?: number;
  /** Jitter ratio 0..1 of the computed delay (default 0.5). */
  jitter?: number;
  /** Injectable sleep for tests. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Injectable RNG (0..1) for tests. */
  randomImpl?: () => number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

/**
 * Poll until `done` is satisfied. Delay grows exponentially from baseDelayMs
 * (capped at maxDelayMs) with proportional jitter. Rejects with ApiError
 * "poll_timeout" if maxAttempts is exhausted.
 */
export function createPoller<T>(opts: PollerOptions<T>): () => Promise<T> {
  const base = opts.baseDelayMs ?? 1000;
  const cap = opts.maxDelayMs ?? 30000;
  const maxAttempts = opts.maxAttempts ?? 20;
  const jitter = opts.jitter ?? 0.5;
  const sleep = opts.sleepImpl ?? defaultSleep;
  const rng = opts.randomImpl ?? Math.random;

  return async function run(): Promise<T> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const value = await opts.fetch();
      if (opts.done(value)) return value;

      if (attempt < maxAttempts - 1) {
        const raw = Math.min(cap, base * 2 ** attempt);
        const delay = raw * (1 - jitter + jitter * rng());
        await sleep(delay);
      }
    }
    throw new ApiError(
      "poll_timeout",
      `polling gave up after ${maxAttempts} attempts`,
      0,
    );
  };
}
