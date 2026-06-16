// packages/explorer/src/api/index.ts
//
// Explorer API adapter.
// Live chains read from the public Sidecoin API:
//   https://sidecoin.app/v1/chains/:chainId/...
//
// Preview chains continue using the local demo adapter until their indexing
// endpoints are available.

import {
  getDemoAddress,
  getDemoBlock,
  getDemoExplorerStatus,
  getDemoLatestBlocks,
  getDemoLatestTransactions,
  getDemoTransaction,
} from "../data/demoExplorer";
import { searchResultFromClassification } from "../explorer/search";
import type {
  ExplorerAddressDetail,
  ExplorerAddressTransaction,
  ExplorerBlockDetail,
  ExplorerBlockSummary,
  ExplorerSearchResult,
  ExplorerStatus,
  ExplorerTransactionDetail,
  ExplorerTransactionInput,
  ExplorerTransactionOutput,
  ExplorerTransactionSummary,
  ExplorerTransactionStatus,
} from "../explorer/types";

type JsonObject = Record<string, unknown>;

const SIDECOIN_API_BASE =
  import.meta.env.VITE_SIDECOIN_API_BASE ?? "https://sidecoin.app/v1";

const LIVE_CHAIN_IDS = new Set(["l1", "bitnames", "thunder"]);

function isLiveChain(chainId: string): boolean {
  return LIVE_CHAIN_IDS.has(chainId);
}

function apiUrl(path: string): string {
  return `${SIDECOIN_API_BASE.replace(/\/+$/, "")}${path}`;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function decimalString(value: unknown): string | null {
  return typeof value === "string" && /^\d+$/.test(value) ? value : null;
}

function timestampFromUnix(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(numeric * 1000).toISOString();
    }

    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return null;
}

function formatSats(value: unknown): string {
  const satsRaw = decimalString(value);
  if (satsRaw == null) return "—";

  const sats = BigInt(satsRaw);
  const whole = sats / 100_000_000n;
  const fraction = (sats % 100_000_000n).toString().padStart(8, "0");

  return `${whole}.${fraction} BTC`;
}

function formatFee(value: unknown): string {
  const sats = decimalString(value);
  return sats == null ? "—" : `${sats} sats`;
}

function formatFeeRate(value: unknown): string {
  const n = num(value);
  return n == null ? "—" : `${n.toFixed(1)} sats/vB`;
}

function numericDisplay(value: unknown): string {
  const n = num(value);
  if (n != null) return String(n);
  return str(value) ?? "N/A";
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(apiUrl(path), {
    headers: {
      accept: "application/json",
    },
  });

  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const error = asObject(asObject(body).error);
    const message =
      str(error.message) ??
      str(asObject(body).message) ??
      `Explorer API request failed: ${res.status}`;
    throw new Error(message);
  }

  return body;
}

function normalizeBlockSummary(raw: unknown, fallbackChainId: string): ExplorerBlockSummary {
  const block = asObject(raw);
  const height = num(block.height) ?? 0;

  return {
    chainId: str(block.chainId) ?? fallbackChainId,
    height,
    hash: str(block.hash) ?? "",
    timestamp: timestampFromUnix(block.timestamp) ?? new Date(0).toISOString(),
    transactionCount: num(block.transactionCount) ?? 0,
    size: num(block.size) ?? 0,
  };
}

function normalizeTransactionSummary(
  raw: unknown,
  fallbackChainId: string,
): ExplorerTransactionSummary {
  const tx = asObject(raw);

  return {
    chainId: str(tx.chainId) ?? fallbackChainId,
    txid: str(tx.txid) ?? "",
    timestamp: timestampFromUnix(tx.timestamp) ?? "Pending",
    amount: formatSats(tx.totalOutputSats),
    fee: formatFee(tx.feeSats),
    status: normalizeStatus(tx.status),
  };
}

function normalizeStatus(value: unknown): ExplorerTransactionStatus {
  return value === "mempool" ? "mempool" : "confirmed";
}

function normalizeInput(raw: unknown): ExplorerTransactionInput {
  const input = asObject(raw);

  return {
    previousTxid: str(input.previousTxid) ?? "",
    vout: num(input.vout) ?? 0,
    address: str(input.address) ?? "unknown",
    amount: formatSats(input.valueSats),
  };
}

function normalizeOutput(raw: unknown, index: number): ExplorerTransactionOutput {
  const output = asObject(raw);

  return {
    index: num(output.vout) ?? index,
    address: str(output.address) ?? "unknown",
    amount: formatSats(output.valueSats),
    spent: bool(output.spent) ?? false,
  };
}

export async function getExplorerStatus(
  chainId: string,
): Promise<ExplorerStatus> {
  if (!isLiveChain(chainId)) {
    return getDemoExplorerStatus(chainId);
  }

  const blocks = await getLatestBlocks(chainId, 1);
  const latest = blocks[0];

  return {
    chainId,
    network: "ecash-signet",
    latestHeight: latest?.height ?? 0,
    latestBlockHash: latest?.hash ?? "",
    indexedTransactions: latest?.transactionCount ?? 0,
    mempoolTransactions: 0,
    updatedAt: latest?.timestamp ?? new Date().toISOString(),
  };
}

export async function getLatestBlocks(
  chainId: string,
  limit = 8,
): Promise<ExplorerBlockSummary[]> {
  if (!isLiveChain(chainId)) {
    return getDemoLatestBlocks(chainId, limit);
  }

  const body = asObject(
    await fetchJson(`/chains/${encodeURIComponent(chainId)}/blocks?limit=${limit}`),
  );

  return asArray(body.blocks).map((block) =>
    normalizeBlockSummary(block, chainId),
  );
}

export async function getLatestTransactions(
  chainId: string,
  limit = 8,
): Promise<ExplorerTransactionSummary[]> {
  if (!isLiveChain(chainId)) {
    return getDemoLatestTransactions(chainId, limit);
  }

  const body = asObject(
    await fetchJson(
      `/chains/${encodeURIComponent(chainId)}/transactions?limit=${limit}`,
    ),
  );

  return asArray(body.transactions).map((tx) =>
    normalizeTransactionSummary(tx, chainId),
  );
}

export async function getBlock(
  chainId: string,
  blockId: string,
): Promise<ExplorerBlockDetail> {
  if (!isLiveChain(chainId)) {
    return getDemoBlock(chainId, blockId);
  }

  const body = asObject(
    await fetchJson(
      `/chains/${encodeURIComponent(chainId)}/blocks/${encodeURIComponent(blockId)}`,
    ),
  );
  const block = asObject(body.block);
  const summary = normalizeBlockSummary(block, chainId);
  const txids = asArray(block.txids)
    .map((txid) => str(txid))
    .filter((txid): txid is string => txid != null);

  return {
    ...summary,
    previousHash: str(block.previousHash),
    nextHash: str(block.nextHash),
    confirmations: num(block.confirmations) ?? 0,
    merkleRoot: str(block.merkleRoot) ?? "N/A",
    weight: num(block.weight) ?? 0,
    nonce: num(block.nonce) ?? 0,
    bits: str(block.bits) ?? "N/A",
    difficulty: numericDisplay(block.difficulty),
    transactions: txids.map((txid) => ({
      chainId,
      txid,
      timestamp: summary.timestamp,
      amount: "—",
      fee: "—",
      status: "confirmed",
    })),
  };
}

export async function getTransaction(
  chainId: string,
  txid: string,
): Promise<ExplorerTransactionDetail> {
  if (!isLiveChain(chainId)) {
    return getDemoTransaction(chainId, txid);
  }

  const body = asObject(
    await fetchJson(
      `/chains/${encodeURIComponent(chainId)}/transactions/${encodeURIComponent(txid)}`,
    ),
  );
  const tx = asObject(body.transaction);

  return {
    chainId: str(tx.chainId) ?? chainId,
    txid: str(tx.txid) ?? txid,
    status: normalizeStatus(tx.status),
    blockHeight: num(tx.blockHeight),
    blockHash: str(tx.blockHash),
    confirmations: num(tx.confirmations) ?? 0,
    timestamp: timestampFromUnix(tx.timestamp),
    size: num(tx.size) ?? 0,
    vsize: num(tx.vsize) ?? 0,
    weight: num(tx.weight) ?? 0,
    fee: formatFee(tx.feeSats),
    feeRate: formatFeeRate(tx.feeRate),
    version: num(tx.version) ?? 0,
    locktime: num(tx.locktime) ?? 0,
    inputs: asArray(tx.inputs).map(normalizeInput),
    outputs: asArray(tx.outputs).map(normalizeOutput),
  };
}

export async function getAddress(
  chainId: string,
  address: string,
): Promise<ExplorerAddressDetail> {
  if (!isLiveChain(chainId)) {
    return getDemoAddress(chainId, address);
  }

  const [overviewBody, historyBody] = await Promise.all([
    fetchJson(
      `/chains/${encodeURIComponent(chainId)}/address/${encodeURIComponent(address)}`,
    ),
    fetchJson(
      `/chains/${encodeURIComponent(chainId)}/address/${encodeURIComponent(address)}/transactions?limit=25`,
    ).catch(() => ({ transactions: [] })),
  ]);

  const overview = asObject(asObject(overviewBody).address);
  const history = asObject(historyBody);

  const transactions: ExplorerAddressTransaction[] = asArray(
    history.transactions,
  ).map((tx) => {
    const normalized = normalizeTransactionSummary(tx, chainId);
    const raw = asObject(tx);

    return {
      txid: normalized.txid,
      timestamp: normalized.timestamp,
      type: "self",
      amount: normalized.amount,
      confirmations: num(raw.confirmations) ?? 0,
    };
  });

  return {
    chainId: str(overview.chainId) ?? chainId,
    address: str(overview.address) ?? address,
    balance: formatSats(overview.balanceSats),
    totalReceived: formatSats(overview.totalReceivedSats),
    totalSent: formatSats(overview.totalSentSats),
    transactionCount: num(overview.transactionCount) ?? transactions.length,
    utxoCount: num(overview.utxoCount) ?? 0,
    utxos: [],
    transactions,
  };
}

export async function searchExplorer(
  chainId: string,
  query: string,
): Promise<ExplorerSearchResult> {
  return searchResultFromClassification(chainId, query);
}
