// apps/mobile/src/__tests__/thunderEsplora.test.ts
//
// drivechain-esplora client: route shapes, plain-text endpoints, the
// deposit-txid display→raw reversal, content mapping, and broadcast
// semantics (JSON body in, plain-text txid out).

import {
  broadcastThunderTransaction,
  esploraUtxoToPointedOutput,
  getThunderAddressInfo,
  getThunderAddressTxs,
  getThunderAddressUtxos,
  getThunderSidechainInfo,
  getThunderTipHeight,
  ThunderEsploraError,
} from "../api/thunderEsplora";
import { thunder } from "@sidecoin/shared";

const BASE = "https://seed.beta.ecash.eu.com/thunder";

/** Stub globalThis.fetch for one call (or a sequence). */
function stubFetch(
  ...responses: Array<{ ok?: boolean; status?: number; body: unknown; contentType?: string }>
) {
  const queue = [...responses];
  const fetchMock = jest.fn(async (_input?: unknown, _init?: unknown) => {
    const r = queue.shift() ?? { status: 500, body: "exhausted", ok: false };
    const status = r.status ?? 200;
    const ok = r.ok ?? (status >= 200 && status < 300);
    const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return {
      ok,
      status,
      text: async () => text,
      json: async () => (typeof r.body === "string" ? JSON.parse(r.body) : r.body),
    } as unknown as Response;
  });
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  return fetchMock as unknown as {
    mock: {
      calls: Array<[string, RequestInit | undefined]>;
    };
  } & jest.Mock;
}

describe("thunder esplora client", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reads the tip height as plain text and rejects non-integers", async () => {
    const fetchMock = stubFetch({ body: "2422\n" });
    await expect(getThunderTipHeight(BASE)).resolves.toBe(2422);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/blocks/tip/height`);

    stubFetch({ status: 404, body: "the index holds no blocks yet", ok: false });
    await expect(getThunderTipHeight(BASE)).rejects.toThrow(ThunderEsploraError);

    stubFetch({ body: "not-a-height" });
    await expect(getThunderTipHeight(BASE)).rejects.toThrow(/not an integer/);
  });

  it("normalizes trailing slashes on the base URL", async () => {
    const fetchMock = stubFetch({ body: { chain_stats: { tx_count: 1 }, mempool_stats: { tx_count: 0 } } });
    await getThunderAddressInfo(`${BASE}/`, "NKqSr4bQejFbKpd5yLQgWEiMJFx");
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/address/NKqSr4bQejFbKpd5yLQgWEiMJFx`);
  });

  it("fetches address utxos and txs on the right routes", async () => {
    const fetchMock = stubFetch(
      { body: [] },
      { body: [] },
    );
    await getThunderAddressUtxos(BASE, "abc");
    await getThunderAddressTxs(BASE, "abc", "lasttx");
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/address/abc/utxo`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/address/abc/txs/chain/lasttx`);
  });

  it("reads the sidechain escrow (CTIP) shape", async () => {
    stubFetch({
      body: {
        slot: 9,
        title: "Thunder",
        description: "",
        vote_count: 1009,
        proposal_height: 967989,
        activation_height: 968998,
        treasury: { txid: "10355f72", vout: 0, value_sats: 101206685589 },
      },
    });
    const info = await getThunderSidechainInfo(BASE);
    expect(info.treasury?.value_sats).toBe(101206685589);
    expect(info.activation_height).toBe(968998);
  });

  it("broadcasts an authorized transaction as JSON and reads the plain-text txid", async () => {
    const fetchMock = stubFetch({ body: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n" });
    const body = { transaction: { inputs: [], proof: { targets: [], hashes: [] }, outputs: [] }, authorizations: [] };
    const txid = await broadcastThunderTransaction(BASE, body);
    expect(txid).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/tx`);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(body);
  });

  it("rejects a broadcast that does not answer with a txid", async () => {
    stubFetch({ body: "OK" });
    await expect(
      broadcastThunderTransaction(BASE, { transaction: {}, authorizations: [] }),
    ).rejects.toThrow(/non-txid/);
  });
});

describe("esplora row → PointedOutput conversion", () => {
  const OWNER = "NKqSr4bQejFbKpd5yLQgWEiMJFx";
  const RAW_TXID = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

  it("regular rows keep the raw sidechain txid byte order", () => {
    const po = esploraUtxoToPointedOutput(
      { txid: RAW_TXID, vout: 3, value: 5000, status: { confirmed: true, block_height: 10, block_hash: null, block_time: null }, outpoint_kind: "regular", content_type: "value" },
      OWNER,
    );
    expect(po.outPoint).toEqual({ kind: "regular", txid: thunder.fromHex(RAW_TXID), vout: 3 });
    expect(po.output.address).toEqual(thunder.thunderAddressBytesFromBase58(OWNER));
    expect(po.output.content).toEqual({ kind: "value", sats: 5000n });
    // The utreexo leaf hash must be computable and stable.
    expect(thunder.pointedOutputHash(po)).toHaveLength(32);
  });

  it("deposit rows reverse the mainchain txid from display to raw order", () => {
    const displayTxid = "20" + RAW_TXID.slice(2); // differs from RAW in first byte
    const po = esploraUtxoToPointedOutput(
      { txid: displayTxid, vout: 0, value: 10000000, status: { confirmed: true, block_height: 970642, block_hash: null, block_time: null }, outpoint_kind: "deposit", content_type: "value" },
      OWNER,
    );
    expect(po.outPoint.kind).toBe("deposit");
    expect(po.outPoint).toEqual({
      kind: "deposit",
      txid: thunder.reverseBytes(thunder.fromHex(displayTxid)),
      vout: 0,
    });
  });

  it("withdrawal-content rows keep their kind so balance/selection exclude them", () => {
    const po = esploraUtxoToPointedOutput(
      {
        txid: RAW_TXID, vout: 0, value: 700, status: { confirmed: true, block_height: 1, block_hash: null, block_time: null },
        outpoint_kind: "regular", content_type: "withdrawal",
        content: { Withdrawal: { value: 700, main_fee: 40, main_address: "bc1qx" } },
      },
      OWNER,
    );
    expect(po.output.content.kind).toBe("withdrawal");
    expect(thunder.contentValueSats(po.output.content)).toBe(740n);
  });

  it("unparseable withdrawal rows degrade to a withdrawal shape (unspendable, still excluded)", () => {
    const po = esploraUtxoToPointedOutput(
      { txid: RAW_TXID, vout: 0, value: 700, status: { confirmed: true, block_height: 1, block_hash: null, block_time: null }, outpoint_kind: "regular", content_type: "withdrawal", content: null },
      OWNER,
    );
    expect(po.output.content.kind).toBe("withdrawal");
  });
});
