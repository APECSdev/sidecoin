// apps/mobile/src/history.ts
//
// Local transaction history for the Sidecoin React Native wallet.
//
// WHY A LOCAL DATABASE:
//   The Sidecoin adapter (sidecoin.app/v1) is offline, so there is no server
//   side index of a wallet's activity. The wallet therefore keeps its own
//   record of the transactions it BROADCASTS (sends) and can reconcile each
//   one against L1 later. This is the React Native port of the Vue wallet's
//   "Receive history" panel, which until now rendered a single hard-coded
//   "Primary receive / Ready" row.
//
// WHY op-sqlite:
//   @op-engineering/op-sqlite compiles the SQLite amalgamation (cpp/sqlite3.c)
//   from source at build time and, with the default configuration, packages NO
//   prebuilt native library (android/build.gradle sets jniLibs.srcDirs = []
//   unless libsql/turso/sqlite-vec are explicitly enabled). That keeps the
//   F-Droid recipe free of any prebuilt-binary `scanignore` entry.
//
// STORAGE LOCATION:
//   The database lives in the app's private data directory, which on Android
//   is the sandboxed /data/data/app.sidecoin/files tree. It is NOT part of the
//   encrypted keystore: it holds no secrets, only public transaction metadata
//   (txid, address, amount). A future revision can move it behind SQLCipher by
//   enabling the package's `sqlcipher` build flag, at the cost of vendoring
//   OpenSSL.

import { open, type DB } from "@op-engineering/op-sqlite";

/** File name of the on-device history database. */
const DB_NAME = "sidecoin-history.sqlite";

/**
 * Direction of a recorded transaction, from the wallet's point of view.
 *
 *   "send"    — the wallet signed and broadcast this transaction.
 *   "receive" — the wallet observed an inbound credit at one of its addresses.
 *   "deposit" — a Drivechain L1 -> sidechain deposit (BIP-300/301).
 *   "withdraw"— a Drivechain sidechain -> L1 withdrawal.
 */
export type HistoryDirection = "send" | "receive" | "deposit" | "withdraw";

/**
 * Confirmation state of a transaction. "pending" means it has been broadcast
 * but not yet observed in a block; the wallet updates it to "confirmed" once
 * the Esplora tip reports a block height.
 */
export type HistoryStatus = "pending" | "confirmed" | "failed";

/**
 * A single history row as stored on device.
 *
 * Amounts are stored as a DECIMAL STRING of satoshis rather than an INTEGER,
 * because L1 amounts are `bigint` in @sidecoin/shared and JavaScript numbers
 * lose precision above 2^53 sats. SQLite's INTEGER is a signed 64-bit value,
 * so it can hold a satoshi amount, but op-sqlite returns INTEGER columns as
 * JS numbers — which would silently corrupt large values. TEXT keeps the
 * round-trip exact.
 */
export interface HistoryEntry {
  /** Transaction id (hex). Primary key — a txid is unique per chain. */
  txid: string;
  /** Network the transaction belongs to ("signet" | "betanet"). */
  network: string;
  /** Which way the value moved. */
  direction: HistoryDirection;
  /** Amount in satoshis, as a decimal string. Always non-negative; the
   *  direction carries the sign. */
  amountSats: string;
  /** The wallet address the transaction is associated with. */
  address: string;
  /** Fee in satoshis as a decimal string; "0" when unknown. */
  feeSats: string;
  /** Confirmation state. */
  status: HistoryStatus;
  /** Block height once confirmed; null while pending. */
  blockHeight: number | null;
  /** Unix epoch seconds when the wallet first recorded the entry. */
  createdAt: number;
}

/**
 * Shape accepted by {@link recordTransaction}. `createdAt` and `status`
 * default to now / "pending"; every other field is required.
 */
export type NewHistoryEntry = Omit<HistoryEntry, "createdAt" | "status"> &
  Partial<Pick<HistoryEntry, "createdAt" | "status">>;

/** Lazily-opened singleton handle. op-sqlite's open() is synchronous. */
let db: DB | null = null;

/**
 * Open (once) and return the history database, creating the schema on first
 * use. Safe to call repeatedly; the handle is memoised.
 */
export function getHistoryDb(): DB {
  if (db) return db;
  db = open({ name: DB_NAME });
  db.executeSync(`
    CREATE TABLE IF NOT EXISTS history (
      txid        TEXT    PRIMARY KEY NOT NULL,
      network     TEXT    NOT NULL,
      direction   TEXT    NOT NULL,
      amount_sats TEXT    NOT NULL,
      address     TEXT    NOT NULL,
      fee_sats    TEXT    NOT NULL DEFAULT '0',
      status      TEXT    NOT NULL DEFAULT 'pending',
      block_height INTEGER,
      created_at  INTEGER NOT NULL
    );
  `);
  // The list view is always "most recent first, filtered by network", so the
  // index matches the query in listHistory() exactly.
  db.executeSync(
    `CREATE INDEX IF NOT EXISTS idx_history_network_created
       ON history (network, created_at DESC);`,
  );
  return db;
}

/**
 * Close the database handle and drop the memoised reference. Exposed for
 * tests and for a future "clear wallet" flow; the app otherwise keeps the
 * handle open for its whole lifetime.
 */
export function closeHistoryDb(): void {
  if (!db) return;
  db.close();
  db = null;
}

/** Map one SQLite row (snake_case) to a {@link HistoryEntry} (camelCase). */
function rowToEntry(row: Record<string, unknown>): HistoryEntry {
  return {
    txid: String(row.txid),
    network: String(row.network),
    direction: row.direction as HistoryDirection,
    amountSats: String(row.amount_sats),
    address: String(row.address),
    feeSats: String(row.fee_sats),
    status: row.status as HistoryStatus,
    blockHeight:
      row.block_height === null || row.block_height === undefined
        ? null
        : Number(row.block_height),
    createdAt: Number(row.created_at),
  };
}

/**
 * Insert or replace a transaction. Uses `INSERT OR REPLACE` so re-recording
 * the same txid (e.g. a re-broadcast, or a status refresh) updates the row
 * rather than failing on the primary key.
 *
 * Returns the stored entry so callers can render it without a re-read.
 */
export function recordTransaction(entry: NewHistoryEntry): HistoryEntry {
  const stored: HistoryEntry = {
    ...entry,
    status: entry.status ?? "pending",
    createdAt: entry.createdAt ?? Math.floor(Date.now() / 1000),
  };
  getHistoryDb().executeSync(
    `INSERT OR REPLACE INTO history
       (txid, network, direction, amount_sats, address, fee_sats, status, block_height, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      stored.txid,
      stored.network,
      stored.direction,
      stored.amountSats,
      stored.address,
      stored.feeSats,
      stored.status,
      stored.blockHeight,
      stored.createdAt,
    ],
  );
  return stored;
}

/**
 * List history for one network, newest first.
 *
 * `limit` defaults to 100 — enough for the Receive-history panel without
 * pulling an unbounded result set into memory.
 */
export function listHistory(network: string, limit = 100): HistoryEntry[] {
  const result = getHistoryDb().executeSync(
    `SELECT txid, network, direction, amount_sats, address, fee_sats, status, block_height, created_at
       FROM history
      WHERE network = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [network, limit],
  );
  return (result.rows ?? []).map(rowToEntry);
}

/**
 * Mark a transaction confirmed at a given block height. No-op if the txid is
 * unknown, so a stale reconciliation pass cannot insert a phantom row.
 */
export function markConfirmed(txid: string, blockHeight: number): void {
  getHistoryDb().executeSync(
    `UPDATE history SET status = 'confirmed', block_height = ? WHERE txid = ?`,
    [blockHeight, txid],
  );
}

/** Mark a transaction failed (e.g. rejected by the node on broadcast). */
export function markFailed(txid: string): void {
  getHistoryDb().executeSync(
    `UPDATE history SET status = 'failed' WHERE txid = ?`,
    [txid],
  );
}

/** Remove every row for one network. Used by a future "clear history" action. */
export function clearHistory(network: string): void {
  getHistoryDb().executeSync(`DELETE FROM history WHERE network = ?`, [network]);
}
