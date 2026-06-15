// packages/explorer/src/data/demoExplorer.ts

import { EXPLORER_CHAINS, getExplorerChain } from "../explorer/chains";
import type {
  ExplorerAddressDetail,
  ExplorerBlockDetail,
  ExplorerBlockSummary,
  ExplorerStatus,
  ExplorerTransactionDetail,
  ExplorerTransactionSummary,
} from "../explorer/types";

function chainIndex(chainId: string): number {
  const index = EXPLORER_CHAINS.findIndex((chain) => chain.id === chainId);
  return index === -1 ? 0 : index;
}

function assertChain(chainId: string): void {
  if (getExplorerChain(chainId) == null) {
    throw new Error(`unknown explorer chain: ${chainId}`);
  }
}

function hex64(seed: number): string {
  const normalized = Math.abs(seed).toString(16);
  return normalized.padStart(64, "0").slice(-64);
}

function timestampMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function demoBaseHeight(chainId: string): number {
  if (chainId === "l1") return 964_000;
  return 1_337 + chainIndex(chainId) * 1_000;
}

function demoAddress(chainId: string, index: number): string {
  if (chainId === "l1") return `tb1qsidecoin${String(index).padStart(2, "0")}demoaddress000000000000`;
  return `${chainId}1qsidecoin${String(index).padStart(2, "0")}demoaddress`;
}

export function getDemoExplorerStatus(chainId: string): ExplorerStatus {
  assertChain(chainId);

  const latestHeight = demoBaseHeight(chainId);

  return {
    chainId,
    network: "ecash-signet",
    latestHeight,
    latestBlockHash: hex64(latestHeight + chainIndex(chainId) * 10_000),
    indexedTransactions: 42_000 + chainIndex(chainId) * 1_337,
    mempoolTransactions: chainIndex(chainId) + 3,
    updatedAt: timestampMinutesAgo(1),
  };
}

export function getDemoLatestBlocks(
  chainId: string,
  limit = 8,
): ExplorerBlockSummary[] {
  assertChain(chainId);

  const latestHeight = demoBaseHeight(chainId);
  const offset = chainIndex(chainId) * 10_000;

  return Array.from({ length: limit }, (_, index) => {
    const height = latestHeight - index;
    return {
      chainId,
      height,
      hash: hex64(height + offset),
      timestamp: timestampMinutesAgo(index * 10 + 2),
      transactionCount: 4 + ((height + index) % 9),
      size: 900_000 + index * 12_345,
    };
  });
}

export function getDemoLatestTransactions(
  chainId: string,
  limit = 8,
): ExplorerTransactionSummary[] {
  assertChain(chainId);

  const offset = chainIndex(chainId) * 100_000;

  return Array.from({ length: limit }, (_, index) => ({
    chainId,
    txid: hex64(offset + index + 1),
    timestamp: timestampMinutesAgo(index * 7 + 1),
    amount: `${(index + 1) * 0.125} BTC`,
    fee: `${420 + index * 17} sats`,
    status: index === 0 ? "mempool" : "confirmed",
  }));
}

export function getDemoBlock(
  chainId: string,
  blockId: string,
): ExplorerBlockDetail {
  assertChain(chainId);

  const parsedHeight = Number.parseInt(blockId, 10);
  const height = Number.isFinite(parsedHeight)
    ? parsedHeight
    : demoBaseHeight(chainId);
  const offset = chainIndex(chainId) * 10_000;
  const summary: ExplorerBlockSummary = {
    chainId,
    height,
    hash: blockId.length === 64 ? blockId : hex64(height + offset),
    timestamp: timestampMinutesAgo(5),
    transactionCount: 6,
    size: 1_124_000,
  };

  return {
    ...summary,
    previousHash: hex64(height + offset - 1),
    nextHash: height < demoBaseHeight(chainId) ? hex64(height + offset + 1) : null,
    confirmations: Math.max(1, demoBaseHeight(chainId) - height + 1),
    merkleRoot: hex64(height + offset + 50_000),
    weight: 3_894_000,
    nonce: 2_083_236_891,
    bits: "1e0377ae",
    difficulty: "1.00000000",
    transactions: getDemoLatestTransactions(chainId, 6),
  };
}

export function getDemoTransaction(
  chainId: string,
  txid: string,
): ExplorerTransactionDetail {
  assertChain(chainId);

  const status = txid.endsWith("1") ? "mempool" : "confirmed";
  const blockHeight = status === "confirmed" ? demoBaseHeight(chainId) - 2 : null;
  const blockHash =
    blockHeight == null ? null : hex64(blockHeight + chainIndex(chainId) * 10_000);

  return {
    chainId,
    txid,
    status,
    blockHeight,
    blockHash,
    confirmations: status === "confirmed" ? 3 : 0,
    timestamp: status === "confirmed" ? timestampMinutesAgo(18) : null,
    size: 226,
    vsize: 141,
    weight: 564,
    fee: "522 sats",
    feeRate: "3.7 sats/vB",
    version: 2,
    locktime: 0,
    inputs: [
      {
        previousTxid: hex64(chainIndex(chainId) * 100_000 + 90),
        vout: 0,
        address: demoAddress(chainId, 1),
        amount: "0.50000000 BTC",
      },
    ],
    outputs: [
      {
        index: 0,
        address: demoAddress(chainId, 2),
        amount: "0.37499478 BTC",
        spent: false,
      },
      {
        index: 1,
        address: demoAddress(chainId, 3),
        amount: "0.12500000 BTC",
        spent: true,
      },
    ],
  };
}

export function getDemoAddress(
  chainId: string,
  address: string,
): ExplorerAddressDetail {
  assertChain(chainId);

  const transactions = getDemoLatestTransactions(chainId, 5);

  return {
    chainId,
    address,
    balance: "1.33700000 BTC",
    totalReceived: "4.20000000 BTC",
    totalSent: "2.86300000 BTC",
    transactionCount: 12,
    utxoCount: 3,
    utxos: [
      {
        txid: transactions[1].txid,
        vout: 0,
        amount: "0.50000000 BTC",
        confirmations: 12,
        status: "confirmed",
      },
      {
        txid: transactions[2].txid,
        vout: 1,
        amount: "0.71200000 BTC",
        confirmations: 8,
        status: "confirmed",
      },
      {
        txid: transactions[0].txid,
        vout: 0,
        amount: "0.12500000 BTC",
        confirmations: 0,
        status: "mempool",
      },
    ],
    transactions: transactions.map((tx, index) => ({
      txid: tx.txid,
      timestamp: tx.timestamp,
      type: index % 3 === 0 ? "receive" : index % 3 === 1 ? "send" : "self",
      amount: tx.amount,
      confirmations: tx.status === "confirmed" ? 6 + index : 0,
    })),
  };
}
