// packages/explorer/src/__tests__/api.test.ts

import {
  getAddress,
  getBlock,
  getExplorerStatus,
  getLatestBlocks,
  getLatestTransactions,
  getTransaction,
  searchExplorer,
} from "../api";

describe("explorer demo API", () => {
  it("returns chain status", async () => {
    const status = await getExplorerStatus("thunder");
    expect(status.chainId).toBe("thunder");
    expect(status.latestHeight).toBeGreaterThan(0);
  });

  it("returns latest blocks", async () => {
    const blocks = await getLatestBlocks("bitnames", 3);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].chainId).toBe("bitnames");
  });

  it("returns latest transactions", async () => {
    const transactions = await getLatestTransactions("l1", 2);
    expect(transactions).toHaveLength(2);
    expect(transactions[0].txid).toHaveLength(64);
  });

  it("returns block details", async () => {
    const block = await getBlock("thunder", "1337");
    expect(block.chainId).toBe("thunder");
    expect(block.height).toBe(1337);
    expect(block.transactions.length).toBeGreaterThan(0);
  });

  it("returns transaction details", async () => {
    const txid = "b".repeat(64);
    const transaction = await getTransaction("l1", txid);
    expect(transaction.txid).toBe(txid);
    expect(transaction.inputs).toHaveLength(1);
    expect(transaction.outputs).toHaveLength(2);
  });

  it("returns address details", async () => {
    const address = await getAddress("bitnames", "bitnames1qdemoaddress");
    expect(address.chainId).toBe("bitnames");
    expect(address.address).toBe("bitnames1qdemoaddress");
    expect(address.utxos.length).toBeGreaterThan(0);
  });

  it("returns search results", async () => {
    const result = await searchExplorer("thunder", "1337");
    expect(result).toEqual({
      type: "block",
      chainId: "thunder",
      id: "1337",
    });
  });
});
