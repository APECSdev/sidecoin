// packages/explorer/src/__tests__/router.test.ts

import router, { routes } from "../router";

describe("explorer router", () => {
  it("defines chain-aware explorer routes", () => {
    expect(routes.map((route) => route.name)).toEqual([
      "home",
      "chain",
      "block",
      "transaction",
      "address",
      "not-found",
    ]);
  });

  it("resolves chain dashboard routes", () => {
    const resolved = router.resolve("/thunder");
    expect(resolved.name).toBe("chain");
    expect(resolved.params.chain).toBe("thunder");
  });

  it("resolves chain-scoped block routes", () => {
    const resolved = router.resolve("/thunder/block/1337");
    expect(resolved.name).toBe("block");
    expect(resolved.params.chain).toBe("thunder");
    expect(resolved.params.id).toBe("1337");
  });

  it("resolves chain-scoped transaction routes", () => {
    const txid = "a".repeat(64);
    const resolved = router.resolve(`/bitnames/tx/${txid}`);
    expect(resolved.name).toBe("transaction");
    expect(resolved.params.chain).toBe("bitnames");
    expect(resolved.params.txid).toBe(txid);
  });

  it("resolves chain-scoped address routes", () => {
    const resolved = router.resolve("/l1/address/tb1qsidecoinaddress0000");
    expect(resolved.name).toBe("address");
    expect(resolved.params.chain).toBe("l1");
    expect(resolved.params.address).toBe("tb1qsidecoinaddress0000");
  });
});
