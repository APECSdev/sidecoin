// packages/explorer/src/explorer/types.ts

export type ExplorerChainKind = "l1" | "sidechain" | "proposed";
export type ExplorerChainStatus = "active" | "coming soon" | "planned";
export type ExplorerTransactionStatus = "confirmed" | "mempool";
export type ExplorerAddressTransactionType = "receive" | "send" | "self";

export interface ExplorerChain {
  id: string;
  displayName: string;
  shortName: string;
  kind: ExplorerChainKind;
  slot: number | null;
  description: string;
  status: ExplorerChainStatus;
}

export interface ExplorerStatus {
  chainId: string;
  network: "ecash-signet" | "mainnet" | "regtest";
  latestHeight: number;
  latestBlockHash: string;
  indexedTransactions: number;
  mempoolTransactions: number;
  updatedAt: string;
}

export interface ExplorerBlockSummary {
  chainId: string;
  height: number;
  hash: string;
  timestamp: string;
  transactionCount: number;
  size: number;
}

export interface ExplorerTransactionSummary {
  chainId: string;
  txid: string;
  timestamp: string;
  amount: string;
  fee: string;
  status: ExplorerTransactionStatus;
}

export interface ExplorerBlockDetail extends ExplorerBlockSummary {
  previousHash: string | null;
  nextHash: string | null;
  confirmations: number;
  merkleRoot: string;
  weight: number;
  nonce: number;
  bits: string;
  difficulty: string;
  transactions: ExplorerTransactionSummary[];
}

export interface ExplorerTransactionInput {
  previousTxid: string;
  vout: number;
  address: string;
  amount: string;
}

export interface ExplorerTransactionOutput {
  index: number;
  address: string;
  amount: string;
  spent: boolean;
}

export interface ExplorerTransactionDetail {
  chainId: string;
  txid: string;
  status: ExplorerTransactionStatus;
  blockHeight: number | null;
  blockHash: string | null;
  confirmations: number;
  timestamp: string | null;
  size: number;
  vsize: number;
  weight: number;
  fee: string;
  feeRate: string;
  version: number;
  locktime: number;
  inputs: ExplorerTransactionInput[];
  outputs: ExplorerTransactionOutput[];
}

export interface ExplorerUtxo {
  txid: string;
  vout: number;
  amount: string;
  confirmations: number;
  status: ExplorerTransactionStatus;
}

export interface ExplorerAddressTransaction {
  txid: string;
  timestamp: string;
  type: ExplorerAddressTransactionType;
  amount: string;
  confirmations: number;
}

export interface ExplorerAddressDetail {
  chainId: string;
  address: string;
  balance: string;
  totalReceived: string;
  totalSent: string;
  transactionCount: number;
  utxoCount: number;
  utxos: ExplorerUtxo[];
  transactions: ExplorerAddressTransaction[];
}

export type ExplorerSearchResult =
  | { type: "block"; chainId: string; id: string }
  | { type: "transaction"; chainId: string; id: string }
  | { type: "address"; chainId: string; id: string }
  | { type: "not_found"; chainId: string; query: string };
