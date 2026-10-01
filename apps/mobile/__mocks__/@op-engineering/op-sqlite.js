// apps/mobile/__mocks__/@op-engineering/op-sqlite.js
//
// Manual Jest mock for @op-engineering/op-sqlite.
//
// WHY THIS EXISTS:
//   op-sqlite is a native module. Its real entry point (lib/module/index.js)
//   calls NativeModules.OPSQLite.install() at import time and throws
//   "Base module not found" under Jest, where no native binary is present.
//   Every screen that renders Receive history (and the Send screen, which
//   records a broadcast) imports the history store, which imports op-sqlite.
//
// WHAT IT SIMULATES:
//   An in-memory SQLite engine sufficient for the history store's SQL:
//   CREATE TABLE/INDEX (no-op), INSERT OR REPLACE, SELECT with a WHERE /
//   ORDER BY / LIMIT, UPDATE, and DELETE. It is NOT a general SQL engine —
//   it understands only the statements history.ts issues, which keeps the
//   mock small and the tests honest about what production runs.
//
// PLACEMENT:
//   Jest picks this up automatically for `jest.mock("@op-engineering/op-sqlite")`
//   because it lives in __mocks__ adjacent to the app root, and the package is
//   in node_modules. Suites must still call jest.mock() explicitly (this file
//   is not auto-applied for node_modules packages).

const tables = new Map();

function tableFor(name) {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name);
}

function executeSync(query, params = []) {
  const sql = String(query).trim();
  const upper = sql.toUpperCase();

  if (upper.startsWith("CREATE TABLE") || upper.startsWith("CREATE INDEX")) {
    return { rowsAffected: 0, rows: [] };
  }

  if (upper.startsWith("INSERT OR REPLACE INTO HISTORY")) {
    const [
      txid,
      network,
      direction,
      amountSats,
      address,
      feeSats,
      status,
      blockHeight,
      createdAt,
    ] = params;
    tableFor("history").set(txid, {
      txid,
      network,
      direction,
      amount_sats: amountSats,
      address,
      fee_sats: feeSats,
      status,
      block_height: blockHeight,
      created_at: createdAt,
    });
    return { rowsAffected: 1, rows: [] };
  }

  if (upper.startsWith("SELECT") && upper.includes("FROM HISTORY")) {
    const [network, limit] = params;
    const rows = [...tableFor("history").values()]
      .filter((row) => row.network === network)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, typeof limit === "number" ? limit : undefined);
    return { rowsAffected: 0, rows };
  }

  if (upper.startsWith("UPDATE HISTORY SET STATUS = 'CONFIRMED'")) {
    const [blockHeight, txid] = params;
    const row = tableFor("history").get(txid);
    if (row) {
      row.status = "confirmed";
      row.block_height = blockHeight;
    }
    return { rowsAffected: row ? 1 : 0, rows: [] };
  }

  if (upper.startsWith("UPDATE HISTORY SET STATUS = 'FAILED'")) {
    const [txid] = params;
    const row = tableFor("history").get(txid);
    if (row) row.status = "failed";
    return { rowsAffected: row ? 1 : 0, rows: [] };
  }

  if (upper.startsWith("DELETE FROM HISTORY")) {
    const [network] = params;
    let removed = 0;
    for (const [txid, row] of tableFor("history")) {
      if (row.network === network) {
        tableFor("history").delete(txid);
        removed += 1;
      }
    }
    return { rowsAffected: removed, rows: [] };
  }

  throw new Error(`[op-sqlite mock] Unsupported SQL: ${sql}`);
}

function makeDb() {
  return {
    executeSync,
    execute: async (query, params) => executeSync(query, params),
    close: () => undefined,
    closeAsync: async () => undefined,
    delete: () => undefined,
    transaction: async (fn) => fn({ execute: async (q, p) => executeSync(q, p) }),
  };
}

module.exports = {
  __esModule: true,
  open: () => makeDb(),
  openAsync: async () => makeDb(),
  openSync: () => makeDb(),
  // Reset hook for tests that need a clean database between cases.
  __resetTables: () => tables.clear(),
};
