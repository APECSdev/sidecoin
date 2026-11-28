// apps/mobile/src/api/thunderEsplora.ts
//
// Client for the drivechain-esplora Thunder index (the default Thunder
// backend on every network with one — eCash mainnet today; betanet is
// retired, its infrastructure went dark 2026-11-27).
//
// The index walks the sidechain block by block, keeps an address index in
// Postgres, and answers an Esplora-compatible REST surface. It exists
// because the node's own RPC cannot: its UTXO table keys by outpoint only
// (get_utxos scans the whole table per call) and it exposes no transaction
// heights, times or fees. The index adds real confirmations, chronological
// ordering, fee data, per-address deposit rows, and the mainchain CTIP
// (GET /drivechain/sidechain/9) — everything the thin-client flow needs.
//
// Wire contract: github.com/octobocto/drivechain-esplora (MIT),
// internal/api/{server,esplora,address,handlers,write}.go, read 2026-11-27:
//   GET  /blocks/tip/height              → plain text
//   GET  /address/{a}                    → {chain_stats, mempool_stats}
//   GET  /address/{a}/utxo               → [UTXO]   (row carries no address;
//                                                 the route is the key)
//   GET  /address/{a}/deposits           → [UTXO]   (BIP300 M5 credits)
//   GET  /address/{a}/txs/chain[/{last}] → [Tx]     (25/page, newest first)
//   GET  /address/{a}/txs/mempool        → [Tx]
//   GET  /tx/{txid}                      → Tx
//   GET  /tx/{txid}/outspend/{vout}      → Outspend
//   POST /tx                             → body = the authorized transaction
//                                          as JSON, verbatim into the
//                                          node's submit_transaction; the
//                                          answer is the txid as PLAIN TEXT
//   GET  /drivechain/sidechain/9         → slot + treasury (the CTIP)
//   GET  /fee-estimates                  → {target: sat/vB}
//
// Outpoint kinds (internal/chain/outpoint.go): "regular" | "coinbase" |
// "deposit" | "unsuccessful_withdrawal" (+ truthcoin-only kinds). A deposit
// row's txid is a MAINCHAIN txid in BITCOIN DISPLAY order (sourceString);
// regular/coinbase txids are raw sidechain byte order. A UTXO row carries
// no address — the route key is the owner.
//
// Base URLs live in @sidecoin/shared (thunder.THUNDER_NETWORKS) so every
// app shares one deployment table.

import { thunder } from "@sidecoin/shared";
import type { ThunderPointedOutput } from "@sidecoin/shared";

export interface ThunderEsploraStatus {
  confirmed: boolean;
  block_height: number | null;
  block_hash: string | null;
  block_time: number | null;
}

export interface ThunderEsploraTxoStats {
  funded_txo_count: number;
  funded_txo_sum: number;
  spent_txo_count: number;
  spent_txo_sum: number;
  tx_count: number;
}

export interface ThunderEsploraAddressInfo {
  address: string;
  chain_stats: ThunderEsploraTxoStats;
  mempool_stats: ThunderEsploraTxoStats;
}

export interface ThunderEsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: ThunderEsploraStatus;
  outpoint_kind: string;
  height_exact?: boolean;
  content_type: string;
  content?: unknown;
}

export interface ThunderEsploraVout {
  scriptpubkey: string;
  scriptpubkey_address: string;
  value: number;
  outpoint_kind: string;
  content_type: string;
  content?: unknown;
}

export interface ThunderEsploraVin {
  txid: string;
  vout: number;
  prevout?: ThunderEsploraVout | null;
  is_coinbase?: boolean;
}

export interface ThunderEsploraTx {
  txid: string;
  size: number;
  fee: number;
  vin: ThunderEsploraVin[];
  vout: ThunderEsploraVout[];
  status: ThunderEsploraStatus;
}

export interface ThunderEsploraTreasury {
  txid: string;
  vout: number;
  value_sats: number;
}

export interface ThunderEsploraSidechain {
  slot: number;
  title: string;
  description: string;
  vote_count: number;
  proposal_height: number;
  activation_height: number;
  treasury: ThunderEsploraTreasury | null;
}

export class ThunderEsploraError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ThunderEsploraError";
  }
}

/** The index answering 404 "the index holds no blocks yet" — a live but
 * empty chain, not a connection failure. */
export const THUNDER_INDEX_EMPTY_STATUS = 404;

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function esploraFetch(path: string, baseUrl: string, init?: RequestInit): Promise<Response> {
  const res = await globalThis.fetch(`${normalizeBase(baseUrl)}${path}`, init);
  return res;
}

async function readJson<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ThunderEsploraError(
      `${what} failed: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

/** GET /blocks/tip/height — plain text. Throws ThunderEsploraError(404) when
 * the index is live but holds no blocks yet. */
export async function getThunderTipHeight(baseUrl: string): Promise<number> {
  const res = await esploraFetch("/blocks/tip/height", baseUrl);
  if (!res.ok) {
    throw new ThunderEsploraError(`tip height failed: HTTP ${res.status}`, res.status);
  }
  const text = (await res.text()).trim();
  const height = Number(text);
  if (!Number.isInteger(height) || height < 0) {
    throw new ThunderEsploraError(`tip height is not an integer: "${text}"`, res.status);
  }
  return height;
}

/** GET /address/{a} — the cheap probe that decides whether an address has
 * ever been used (tx_count > 0) before paying for a UTXO/history fetch. */
export async function getThunderAddressInfo(
  baseUrl: string,
  address: string,
): Promise<ThunderEsploraAddressInfo> {
  const res = await esploraFetch(`/address/${encodeURIComponent(address)}`, baseUrl);
  return readJson(res, "address info");
}

/** GET /address/{a}/utxo — unspent outputs owned by the route address. */
export async function getThunderAddressUtxos(
  baseUrl: string,
  address: string,
): Promise<ThunderEsploraUtxo[]> {
  const res = await esploraFetch(`/address/${encodeURIComponent(address)}/utxo`, baseUrl);
  return readJson(res, "address utxos");
}

/** GET /address/{a}/deposits — the BIP300 M5 deposits credited to the
 * address. A deposit is not a sidechain transaction, so /txs never lists
 * it; this route does. */
export async function getThunderAddressDeposits(
  baseUrl: string,
  address: string,
): Promise<ThunderEsploraUtxo[]> {
  const res = await esploraFetch(`/address/${encodeURIComponent(address)}/deposits`, baseUrl);
  return readJson(res, "address deposits");
}

/** GET /address/{a}/txs/chain[/{last_seen}] — one page of confirmed
 * history, newest first. */
export async function getThunderAddressTxs(
  baseUrl: string,
  address: string,
  lastSeenTxid?: string,
): Promise<ThunderEsploraTx[]> {
  const suffix = lastSeenTxid ? `/${encodeURIComponent(lastSeenTxid)}` : "";
  const res = await esploraFetch(
    `/address/${encodeURIComponent(address)}/txs/chain${suffix}`,
    baseUrl,
  );
  return readJson(res, "address txs");
}

/** GET /address/{a}/txs/mempool — the node-accepted but unmined set. */
export async function getThunderAddressMempoolTxs(
  baseUrl: string,
  address: string,
): Promise<ThunderEsploraTx[]> {
  const res = await esploraFetch(`/address/${encodeURIComponent(address)}/txs/mempool`, baseUrl);
  return readJson(res, "address mempool txs");
}

/** GET /tx/{txid} — one transaction with full inputs/prevouts. */
export async function getThunderTx(baseUrl: string, txid: string): Promise<ThunderEsploraTx> {
  const res = await esploraFetch(`/tx/${encodeURIComponent(txid)}`, baseUrl);
  return readJson(res, "tx");
}

/** POST /tx — submit a locally-signed authorized transaction. The body is
 * relayed byte-for-byte into the node's submit_transaction; the answer is
 * the txid as PLAIN TEXT. */
export async function broadcastThunderTransaction(
  baseUrl: string,
  authorizedTxJson: unknown,
): Promise<string> {
  const res = await esploraFetch("/tx", baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(authorizedTxJson),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ThunderEsploraError(
      `broadcast failed: HTTP ${res.status}${text ? ` — ${text.slice(0, 300)}` : ""}`,
      res.status,
    );
  }
  const txid = (await res.text()).trim();
  if (!/^[0-9a-f]{64}$/.test(txid)) {
    throw new ThunderEsploraError(`broadcast returned a non-txid: "${txid.slice(0, 80)}"`, res.status);
  }
  return txid;
}

/** GET /drivechain/sidechain/{slot} — the sidechain's mainchain escrow:
 * activation heights and the treasury UTXO (the CTIP) an M5 deposit must
 * chain. */
export async function getThunderSidechainInfo(
  baseUrl: string,
  slot: number = thunder.THUNDER_SLOT,
): Promise<ThunderEsploraSidechain> {
  const res = await esploraFetch(`/drivechain/sidechain/${slot}`, baseUrl);
  return readJson(res, "sidechain info");
}

// ---------------------------------------------------------------------------
// Row → shared type conversion
// ---------------------------------------------------------------------------

/**
 * An index UTXO row as the shared PointedOutput the transaction builder
 * consumes. The row carries no address — the queried address (also exactly
 * what signing needs) is passed in.
 */
export function esploraUtxoToPointedOutput(
  row: ThunderEsploraUtxo,
  ownerAddress: string,
): ThunderPointedOutput {
  const addressBytes = thunder.thunderAddressBytesFromBase58(ownerAddress);
  const content = esploraContent(row.content_type, row.value, row.content);
  return {
    outPoint: esploraOutPoint(row),
    output: { address: addressBytes, content },
  };
}

function esploraOutPoint(row: ThunderEsploraUtxo): ThunderPointedOutput["outPoint"] {
  switch (row.outpoint_kind) {
    case "regular":
      return { kind: "regular", txid: thunder.fromHex(row.txid), vout: row.vout };
    case "coinbase":
      return { kind: "coinbase", txid: thunder.fromHex(row.txid), vout: row.vout };
    case "deposit":
      // The row's txid is a MAINCHAIN txid in Bitcoin DISPLAY order;
      // borsh wants the raw internal byte order.
      return {
        kind: "deposit",
        txid: thunder.reverseBytes(thunder.fromHex(row.txid)),
        vout: row.vout,
      };
    case "unsuccessful_withdrawal":
      return {
        kind: "unsuccessful-withdrawal",
        m6id: thunder.reverseBytes(thunder.fromHex(row.txid)),
        height: row.status.block_height ?? 0,
        vout: row.vout,
      };
    default:
      // Truthcoin-only kinds (market_funds, payout) and anything unknown:
      // represent as regular so the row still hashes, but callers exclude
      // what they cannot spend.
      return { kind: "regular", txid: thunder.fromHex(row.txid), vout: row.vout };
  }
}

function esploraContent(contentType: string, valueSats: number, raw: unknown): ThunderPointedOutput["output"]["content"] {
  if (contentType === "withdrawal") {
    try {
      return thunder.contentFromJson(raw);
    } catch {
      // A withdrawal row we cannot parse is unspendable anyway; keep the
      // value shape so balance math can exclude it by kind.
      return {
        kind: "withdrawal",
        sats: BigInt(valueSats),
        mainFeeSats: 0n,
        mainScriptPubKey: new Uint8Array(0),
      };
    }
  }
  return { kind: "value", sats: BigInt(valueSats) };
}
