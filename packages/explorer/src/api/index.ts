// packages/explorer/src/api/index.ts
//
// Commit 1 uses a local demo-backed adapter with the same async shape the
// live explorer API will use later. This keeps the chain-aware UI, routes, and
// tests independent from backend indexing while preserving an easy migration
// path to /v1/chains/:chainId/... endpoints.

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
  ExplorerBlockDetail,
  ExplorerBlockSummary,
  ExplorerSearchResult,
  ExplorerStatus,
  ExplorerTransactionDetail,
  ExplorerTransactionSummary,
} from "../explorer/types";

export async function getExplorerStatus(
  chainId: string,
): Promise<ExplorerStatus> {
  return getDemoExplorerStatus(chainId);
}

export async function getLatestBlocks(
  chainId: string,
  limit = 8,
): Promise<ExplorerBlockSummary[]> {
  return getDemoLatestBlocks(chainId, limit);
}

export async function getLatestTransactions(
  chainId: string,
  limit = 8,
): Promise<ExplorerTransactionSummary[]> {
  return getDemoLatestTransactions(chainId, limit);
}

export async function getBlock(
  chainId: string,
  blockId: string,
): Promise<ExplorerBlockDetail> {
  return getDemoBlock(chainId, blockId);
}

export async function getTransaction(
  chainId: string,
  txid: string,
): Promise<ExplorerTransactionDetail> {
  return getDemoTransaction(chainId, txid);
}

export async function getAddress(
  chainId: string,
  address: string,
): Promise<ExplorerAddressDetail> {
  return getDemoAddress(chainId, address);
}

export async function searchExplorer(
  chainId: string,
  query: string,
): Promise<ExplorerSearchResult> {
  return searchResultFromClassification(chainId, query);
}
