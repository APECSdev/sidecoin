// apps/mobile/src/__tests__/history.test.ts
//
// Tests for the local transaction history store. Exercises the real SQL
// strings in history.ts against the in-memory op-sqlite mock
// (__mocks__/@op-engineering/op-sqlite.js), so a broken statement or a wrong
// column mapping fails here rather than on device.

jest.mock("@op-engineering/op-sqlite");

import {
  recordTransaction,
  listHistory,
  markConfirmed,
  markFailed,
  clearHistory,
  closeHistoryDb,
  refreshHistoryStatuses,
  type HistoryEntry,
} from "../history";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mock = require("@op-engineering/op-sqlite");

const base = {
  txid: "aa11bb22cc33dd44",
  network: "betanet",
  direction: "send" as const,
  amountSats: "150000",
  address: "tb1qexample",
  feeSats: "420",
  blockHeight: null,
};

describe("history store", () => {
  beforeEach(() => {
    mock.__resetTables();
    closeHistoryDb();
  });

  it("records a transaction and reads it back", () => {
    const stored = recordTransaction(base);
    expect(stored.txid).toBe(base.txid);
    expect(stored.status).toBe("pending");
    expect(typeof stored.createdAt).toBe("number");

    const rows = listHistory("betanet");
    expect(rows).toHaveLength(1);
    expect(rows[0].amountSats).toBe("150000");
    expect(rows[0].feeSats).toBe("420");
    expect(rows[0].blockHeight).toBeNull();
    expect(rows[0].direction).toBe("send");
  });

  it("keeps satoshi amounts exact as decimal strings", () => {
    // 2^53 + 1 sats would lose precision as a JS number; the TEXT column
    // round-trips it exactly.
    const big = "9007199254740993";
    recordTransaction({ ...base, amountSats: big });
    expect(listHistory("betanet")[0].amountSats).toBe(big);
  });

  it("filters by network", () => {
    recordTransaction({ ...base, network: "betanet" });
    recordTransaction({ ...base, txid: "ff", network: "signet" });
    expect(listHistory("betanet")).toHaveLength(1);
    expect(listHistory("signet")).toHaveLength(1);
    expect(listHistory("signet")[0].txid).toBe("ff");
  });

  it("orders newest first", () => {
    recordTransaction({ ...base, txid: "old", createdAt: 100 });
    recordTransaction({ ...base, txid: "new", createdAt: 200 });
    expect(listHistory("betanet").map((r: HistoryEntry) => r.txid)).toEqual([
      "new",
      "old",
    ]);
  });

  it("re-recording the same txid replaces rather than duplicates", () => {
    recordTransaction(base);
    recordTransaction({ ...base, amountSats: "999" });
    const rows = listHistory("betanet");
    expect(rows).toHaveLength(1);
    expect(rows[0].amountSats).toBe("999");
  });

  it("marks a transaction confirmed with a block height", () => {
    recordTransaction(base);
    markConfirmed(base.txid, 123456);
    const row = listHistory("betanet")[0];
    expect(row.status).toBe("confirmed");
    expect(row.blockHeight).toBe(123456);
  });

  it("marks a transaction failed", () => {
    recordTransaction(base);
    markFailed(base.txid);
    expect(listHistory("betanet")[0].status).toBe("failed");
  });

  it("clearHistory removes only the named network", () => {
    recordTransaction({ ...base, network: "betanet" });
    recordTransaction({ ...base, txid: "ff", network: "signet" });
    clearHistory("betanet");
    expect(listHistory("betanet")).toHaveLength(0);
    expect(listHistory("signet")).toHaveLength(1);
  });

  describe("refreshHistoryStatuses", () => {
    const fetchOk = async () => ({ confirmed: true, blockHeight: 777 });

    it("flips pending rows to confirmed with the block height", async () => {
      recordTransaction(base);
      await refreshHistoryStatuses("betanet", fetchOk);
      const row = listHistory("betanet")[0];
      expect(row.status).toBe("confirmed");
      expect(row.blockHeight).toBe(777);
    });

    it("marks never-accepted txids as failed on a 404", async () => {
      recordTransaction(base);
      await refreshHistoryStatuses("betanet", async () => {
        throw new Error("Failed to fetch tx status: HTTP 404 Not Found");
      });
      expect(listHistory("betanet")[0].status).toBe("failed");
    });

    it("leaves rows pending on non-404 errors", async () => {
      recordTransaction(base);
      await refreshHistoryStatuses("betanet", async () => {
        throw new Error("Failed to fetch tx status: HTTP 502 Bad Gateway");
      });
      expect(listHistory("betanet")[0].status).toBe("pending");
    });

    it("skips rows that are already confirmed", async () => {
      recordTransaction({ ...base, status: "confirmed", blockHeight: 1 });
      const fetcher = jest.fn();
      await refreshHistoryStatuses("betanet", fetcher);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("passes the row's own network to the fetcher", async () => {
      recordTransaction({ ...base, network: "signet", txid: "cc" });
      const seen: string[] = [];
      await refreshHistoryStatuses("signet", async (txid, network) => {
        seen.push(`${network}:${txid}`);
        return { confirmed: false };
      });
      expect(seen).toEqual(["signet:cc"]);
    });
  });
});
