// packages/explorer/src/__tests__/search.test.ts

import {
  classifyExplorerSearch,
  routeForExplorerSearch,
  searchResultFromClassification,
} from "../explorer/search";

describe("explorer search", () => {
  it("classifies block heights", () => {
    expect(classifyExplorerSearch("1337")).toEqual({
      kind: "block",
      query: "1337",
      id: "1337",
    });
  });

  it("classifies 64-character hex strings as transactions", () => {
    const txid = "A".repeat(64);
    expect(classifyExplorerSearch(txid)).toEqual({
      kind: "transaction",
      query: txid,
      id: "a".repeat(64),
    });
  });

  it("classifies address-like strings", () => {
    expect(classifyExplorerSearch("tb1qsidecoinaddress0000")).toEqual({
      kind: "address",
      query: "tb1qsidecoinaddress0000",
      id: "tb1qsidecoinaddress0000",
    });
  });

  it("rejects empty searches", () => {
    expect(classifyExplorerSearch("   ")).toEqual({
      kind: "empty",
      query: "",
    });
  });

  it("builds a chain-scoped block route", () => {
    expect(routeForExplorerSearch("thunder", "1337")).toEqual({
      name: "block",
      params: { chain: "thunder", id: "1337" },
    });
  });

  it("builds a chain-scoped search result", () => {
    expect(searchResultFromClassification("bitnames", "1337")).toEqual({
      type: "block",
      chainId: "bitnames",
      id: "1337",
    });
  });
});
