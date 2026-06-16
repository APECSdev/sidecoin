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

type MockRoutes = Record<string, unknown>;

function mockApi(routes: MockRoutes) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const key = `${url.pathname}${url.search}`;
    const body = routes[key];

    if (body == null) {
      return new Response(
        JSON.stringify({
          error: {
            code: "not_found",
            message: `No mock for ${key}`,
          },
        }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("explorer API", () => {
  it("returns live chain status from latest blocks", async () => {
    mockApi({
      "/v1/chains/l1/blocks?limit=1": {
        chainId: "l1",
        upstreamChainId: "signet",
        tipHeight: 1070,
        blocks: [
          {
            chainId: "l1",
            upstreamChainId: "signet",
            height: 1070,
            hash: "a".repeat(64),
            timestamp: 1781628001,
            transactionCount: 1,
            size: 675,
            weight: 2592,
          },
        ],
        nextCursor: null,
      },
    });

    const status = await getExplorerStatus("l1");
    expect(status.chainId).toBe("l1");
    expect(status.latestHeight).toBe(1070);
    expect(status.latestBlockHash).toBe("a".repeat(64));
    expect(status.mempoolTransactions).toBe(0);
  });

  it("returns live latest blocks", async () => {
    mockApi({
      "/v1/chains/bitnames/blocks?limit=2": {
        chainId: "bitnames",
        upstreamChainId: "bitnames",
        tipHeight: 284,
        blocks: [
          {
            chainId: "bitnames",
            upstreamChainId: "bitnames",
            height: 284,
            hash: "b".repeat(64),
            timestamp: 1781373601,
            transactionCount: 1,
            size: null,
            weight: null,
          },
        ],
        nextCursor: null,
      },
    });

    const blocks = await getLatestBlocks("bitnames", 2);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      chainId: "bitnames",
      height: 284,
      hash: "b".repeat(64),
      transactionCount: 1,
      size: 0,
    });
  });

  it("returns live latest transactions", async () => {
    const txid = "c".repeat(64);
    mockApi({
      "/v1/chains/l1/transactions?limit=2": {
        chainId: "l1",
        upstreamChainId: "signet",
        transactions: [
          {
            chainId: "l1",
            upstreamChainId: "signet",
            txid,
            status: "confirmed",
            blockHeight: 1061,
            blockHash: "d".repeat(64),
            confirmations: 10,
            timestamp: 1781622601,
            totalOutputSats: "710659222",
            feeSats: "3018",
            feeRate: 21.4,
            size: 222,
            vsize: 141,
            weight: 561,
          },
        ],
        nextCursor: null,
      },
    });

    const transactions = await getLatestTransactions("l1", 2);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      chainId: "l1",
      txid,
      amount: "7.10659222 BTC",
      fee: "3018 sats",
      status: "confirmed",
    });
  });

  it("returns live block details", async () => {
    mockApi({
      "/v1/chains/l1/blocks/1061": {
        chainId: "l1",
        upstreamChainId: "signet",
        block: {
          chainId: "l1",
          upstreamChainId: "signet",
          height: 1061,
          hash: "e".repeat(64),
          previousHash: "f".repeat(64),
          nextHash: "a".repeat(64),
          timestamp: 1781622601,
          confirmations: 10,
          transactionCount: 2,
          size: 12737,
          weight: 31940,
          merkleRoot: "b".repeat(64),
          nonce: 2796412,
          bits: "1e0377ae",
          difficulty: 0.001126515290698186,
          txids: ["1".repeat(64), "2".repeat(64)],
        },
      },
    });

    const block = await getBlock("l1", "1061");
    expect(block.chainId).toBe("l1");
    expect(block.height).toBe(1061);
    expect(block.difficulty).toBe("0.001126515290698186");
    expect(block.transactions).toHaveLength(2);
    expect(block.transactions[0].txid).toBe("1".repeat(64));
  });

  it("returns live transaction details", async () => {
    const txid = "f5f1c645c942909161604d3046ffb39a88e1dd740c884161b87b28f23ef7c82a";

    mockApi({
      [`/v1/chains/l1/transactions/${txid}`]: {
        chainId: "l1",
        upstreamChainId: "signet",
        transaction: {
          chainId: "l1",
          upstreamChainId: "signet",
          txid,
          status: "confirmed",
          blockHeight: 1061,
          blockHash: "0".repeat(64),
          confirmations: 10,
          timestamp: 1781622601,
          size: 222,
          vsize: 141,
          weight: 561,
          version: 2,
          locktime: 1060,
          totalOutputSats: "710659222",
          feeSats: "3018",
          feeRate: 21.4,
          inputs: [
            {
              previousTxid: "c067fe5991152fb7a48fa5f2dd50591c43d32062859ae5dea5e75d9a621b612d",
              vout: 1,
              address: "tb1q60s3s2j4u682cn8amyrxtsjvg5m76c60rmu7pe",
              valueSats: "710662240",
            },
          ],
          outputs: [
            {
              vout: 0,
              address: "tb1q0lzj7hsmkmjqy4cjwnf9g3cnzc5xql2cfkvzaq",
              valueSats: "210659222",
              scriptPubKey: "00147fc52f5e1bb6e402571274d25447131628607d58",
              spent: true,
            },
          ],
        },
      },
    });

    const transaction = await getTransaction("l1", txid);
    expect(transaction.txid).toBe(txid);
    expect(transaction.fee).toBe("3018 sats");
    expect(transaction.feeRate).toBe("21.4 sats/vB");
    expect(transaction.inputs[0].amount).toBe("7.10662240 BTC");
    expect(transaction.outputs[0]).toMatchObject({
      index: 0,
      amount: "2.10659222 BTC",
      spent: true,
    });
  });

  it("returns live address details with history", async () => {
    const address = "tb1q0lzj7hsmkmjqy4cjwnf9g3cnzc5xql2cfkvzaq";
    const txid = "f".repeat(64);

    mockApi({
      [`/v1/chains/l1/address/${address}`]: {
        chainId: "l1",
        upstreamChainId: "signet",
        address: {
          chainId: "l1",
          upstreamChainId: "signet",
          address,
          balanceSats: "210659222",
          totalReceivedSats: "210659222",
          totalSentSats: "0",
          transactionCount: 1,
          utxoCount: 1,
        },
      },
      [`/v1/chains/l1/address/${address}/transactions?limit=25`]: {
        chainId: "l1",
        upstreamChainId: "signet",
        address,
        transactions: [
          {
            chainId: "l1",
            txid,
            status: "confirmed",
            timestamp: 1781622601,
            totalOutputSats: "210659222",
            feeSats: "3018",
            confirmations: 10,
          },
        ],
        nextCursor: null,
      },
    });

    const detail = await getAddress("l1", address);
    expect(detail.address).toBe(address);
    expect(detail.balance).toBe("2.10659222 BTC");
    expect(detail.transactionCount).toBe(1);
    expect(detail.transactions[0]).toMatchObject({
      txid,
      amount: "2.10659222 BTC",
      confirmations: 10,
    });
  });

  it("keeps preview chains demo-backed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const blocks = await getLatestBlocks("zside", 2);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].chainId).toBe("zside");
    expect(fetchMock).not.toHaveBeenCalled();
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
