// packages/explorer/src/__tests__/chains.test.ts

import {
  DEFAULT_CHAIN_ID,
  EXPLORER_CHAINS,
  getChainLabel,
  getExplorerChain,
  isExplorerChainId,
} from "../explorer/chains";

describe("explorer chain registry", () => {
  it("keeps the default explorer chain on L1", () => {
    expect(DEFAULT_CHAIN_ID).toBe("l1");
    expect(getExplorerChain(DEFAULT_CHAIN_ID)?.status).toBe("active");
  });

  it("keeps indexed explorer chains active", () => {
    expect(getExplorerChain("l1")?.status).toBe("active");
    expect(getExplorerChain("bitnames")?.status).toBe("active");
    expect(getExplorerChain("thunder")?.status).toBe("active");
  });

  it("keeps non-indexed explorer chains marked coming soon", () => {
    expect(getExplorerChain("zside")?.status).toBe("coming soon");
    expect(getExplorerChain("bitassets")?.status).toBe("coming soon");
    expect(getExplorerChain("photon")?.status).toBe("coming soon");
    expect(getExplorerChain("truthcoin")?.status).toBe("coming soon");
    expect(getExplorerChain("coinshift")?.status).toBe("coming soon");
    expect(getExplorerChain("riscy")?.status).toBe("coming soon");
  });

  it("keeps the full explorer status policy explicit", () => {
    expect(
      Object.fromEntries(
        EXPLORER_CHAINS.map((chain) => [chain.id, chain.status]),
      ),
    ).toEqual({
      l1: "active",
      bitnames: "active",
      thunder: "active",
      zside: "coming soon",
      bitassets: "coming soon",
      photon: "coming soon",
      truthcoin: "coming soon",
      coinshift: "coming soon",
      riscy: "coming soon",
    });
  });

  it("does not contain duplicate chain ids", () => {
    const ids = EXPLORER_CHAINS.map((chain) => chain.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it("only uses supported explorer chain statuses", () => {
    const supportedStatuses = new Set(["active", "coming soon", "planned"]);

    for (const chain of EXPLORER_CHAINS) {
      expect(supportedStatuses.has(chain.status)).toBe(true);
    }
  });

  it("resolves configured chain ids and labels", () => {
    expect(isExplorerChainId("bitnames")).toBe(true);
    expect(isExplorerChainId("thunder")).toBe(true);
    expect(isExplorerChainId("unknown")).toBe(false);

    expect(getChainLabel("bitnames")).toBe("BitNames");
    expect(getChainLabel("thunder")).toBe("Thunder Network");
    expect(getChainLabel("unknown")).toBe("unknown");
  });
});
