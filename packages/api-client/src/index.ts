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

/** UTXO as returned by the adapter (valueSats is a decimal string). */
interface WireUtxo {
  chainId: string;
  address: string;
  txid: string;
  vout: number;
  valueSats: string;
  scriptPubKey: string;
  confirmations: number;
  blockHeight: number;
  isCoinbase: boolean;
}

/**
 * UTXO with valueSats coerced to bigint for safe arithmetic. blockHeight is
 * -1 for an unconfirmed (mempool) output. isCoinbase carries the upstream
 * coinbase fact verbatim — maturity is NOT pre-filtered here; coin selection
 * MUST apply the per-UTXO guard (skip coinbase with confirmations < the
 * chain's coinbase maturity).
 */
export interface Utxo extends Omit<WireUtxo, "valueSats"> {
  valueSats: bigint;
}

/**
 * Result of getUtxos. utxos is the COMPLETE spendable set (the adapter pages
 * upstream). truncated is true only if the adapter hit its page cap before
 * the full set was retrieved — coin selection should treat a truncated set as
 * incomplete rather than authoritative.
 */
export interface UtxosResult {
  chainId: string;
  address: string;
  utxos: Utxo[];
  truncated: boolean;
}

/**
 * Slot-addressed wallet balance (sidechains). source distinguishes the
 * authoritative indexed balance ("indexed") from the deposit-inflow fallback
 * ("derived"). totalSats is the balance in sats (bigint). seen=false means
 * the address was never observed upstream. updatedAtHeight is the indexed
 * height, or null when derived / never seen. provisioned/depositCount/
 * truncated are meaningful mainly for the derived fallback.
 */
export interface WalletBalance {
  slot: number;
  chainId: string;
  address: string;
  source: "indexed" | "derived";
  provisioned: boolean;
  totalSats: bigint;
  depositCount: number;
  truncated: boolean;
  seen: boolean;
  updatedAtHeight: number | null;
  note: string;
}

/**
 * ChainId-addressed indexed balance for ANY chain, including L1/signet (which
 * has no sidechain slot). Always sourced from the upstream balance index.
 * seen=false => address never observed (totalSats 0n, updatedAtHeight null).
 */
export interface ChainBalance {
  chainId: string;
  address: string;
  source: "indexed";
  totalSats: bigint;
  seen: boolean;
  updatedAtHeight: number | null;
  note: string;
}

/**
 * Receipt for a relayed broadcast (chainId-addressed; camelCase). Broadcast
 * is signet/L1 only today, so there is no slot here.
 */
export interface BroadcastReceipt {
  chainId: string;
  txid: string;
  accepted: boolean;
  broadcastAt: number;
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

function coerceUtxo(w: WireUtxo): Utxo {
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

export interface GetUtxosParams {
  /**
   * Global confirmations floor applied to ALL outputs (adapter/upstream
   * default 1). NOT a coinbase-maturity filter — the per-UTXO isCoinbase
   * flag is the surgical guard coin selection applies. Pass 0 to include
   * mempool (0-conf) outputs.
   */
  minConfirmations?: number;
}

export class SidecoinClient {
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(opts: ClientOptions = {}) {
    this.base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    // Bind the default global fetch to globalThis. Stored as an instance
    // property and later called as `this.f(...)`, an unbound native fetch
    // would receive the client as its `this` and throw "Illegal invocation"
    // on Cloudflare Workers (and some browsers). Injected impls are used as-is.
    this.f = opts.fetchImpl ?? fetch.bind(globalThis);
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

  private async post<T>(path: string, payload: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.f(`${this.base}${path}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
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

  /**
   * GET /wallet/:slot/balance — slot-addressed (sidechains). Authoritative
   * indexed balance when available (source="indexed"), otherwise a
   * deposit-inflow fallback (source="derived", NOT a spendable balance).
   * For L1/signet (no slot), use getChainBalance instead.
   */
  async getWalletBalance(
    slot: number,
    address: string,
  ): Promise<WalletBalance> {
    const q = new URLSearchParams({ address });
    const r = await this.get<{
      slot: number;
      chainId: string;
      address: string;
      source: "indexed" | "derived";
      provisioned: boolean;
      totalSats: string;
      depositCount: number;
      truncated: boolean;
      seen: boolean;
      updatedAtHeight: number | null;
      note: string;
    }>(`/wallet/${slot}/balance`, q);

    return { ...r, totalSats: coerceSats(r.totalSats, "totalSats") };
  }

  /**
   * GET /chains/:chainId/address/:address/balance — chainId-addressed indexed
   * balance for ANY chain, including L1/signet. This is the ONLY way to read
   * an L1/signet balance (signet has no sidechain slot). An unknown address
   * is not an error: it returns totalSats 0n with seen=false.
   */
  async getChainBalance(
    chainId: string,
    address: string,
  ): Promise<ChainBalance> {
    const r = await this.get<{
      chainId: string;
      address: string;
      source: "indexed";
      totalSats: string;
      seen: boolean;
      updatedAtHeight: number | null;
      note: string;
    }>(`/chains/${chainId}/address/${address}/balance`);

    return { ...r, totalSats: coerceSats(r.totalSats, "totalSats") };
  }

  /**
   * GET /chains/:chainId/address/:address/utxos — chainId-addressed spendable
   * UTXO set for ANY chain, including L1/signet (no sidechain slot). The
   * adapter pages upstream, so the returned set is COMPLETE; check truncated
   * (true only if the adapter's page cap was hit) before treating it as
   * authoritative for coin selection. An unknown address is not an error: it
   * returns an empty utxos array. Each UTXO's valueSats is coerced to bigint.
   *
   * IMPORTANT: coinbase maturity is NOT pre-filtered. Coin selection MUST
   * apply the per-UTXO guard (skip a UTXO where isCoinbase && confirmations <
   * the chain's coinbase maturity). The optional minConfirmations is a GLOBAL
   * floor across all outputs, not a maturity filter.
   */
  async getUtxos(
    chainId: string,
    address: string,
    params: GetUtxosParams = {},
  ): Promise<UtxosResult> {
    const q = new URLSearchParams();
    if (params.minConfirmations != null) {
      q.set("min_confirmations", String(params.minConfirmations));
    }

    const r = await this.get<{
      chainId: string;
      address: string;
      utxos: WireUtxo[];
      truncated: boolean;
    }>(`/chains/${chainId}/address/${address}/utxos`, q);

    return {
      chainId: r.chainId,
      address: r.address,
      utxos: r.utxos.map(coerceUtxo),
      truncated: r.truncated,
    };
  }

  /**
   * POST /chains/:chainId/broadcast — relay a fully-signed raw transaction
   * to a chain's node. The adapter forwards it and returns the resulting
   * txid; it never signs. Broadcast is signet/L1 ONLY today — pass "signet".
   * L2 chainIds throw ApiError "broadcast_unsupported" (501) for now
   * (dedicated sidechain endpoints are planned). Re-broadcasting an
   * already-known tx is idempotent (accepted:true, same txid).
   *
   * Throws ApiError on failure, code mirroring the adapter envelope:
   *   "malformed_tx"          (400) — bad/undecodable tx hex
   *   "rejected"              (422) — node refused; reason in message. DO NOT
   *                                   retry the same bytes.
   *   "unknown_chain"         (404) — unknown/disabled chain
   *   "rate_limited"          (429) — per-identity budget; details.retryAfter
   *                                   (s). Honor it before retrying.
   *   "broadcast_unsupported" (501) — chain not broadcastable yet; do not
   *                                   retry, use wallet verbs
   *   "relay_error"           (502) — transport; retry with backoff
   *   "broadcast_unavailable" (503) — relay down; retry later with backoff
   *   "network_error"         (0)   — transport failure
   */
  async broadcast(chainId: string, txHex: string): Promise<BroadcastReceipt> {
    return this.post<BroadcastReceipt>(
      `/chains/${chainId}/broadcast`,
      { txHex },
    );
  }
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
