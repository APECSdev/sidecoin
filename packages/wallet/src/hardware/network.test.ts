import { describe, it, expect } from "vitest";
import {
  coinTypeFor,
  defaultDerivationPath,
  coinIdFor,
  parsePath,
} from "./network";
import type { NetworkId } from "@sidecoin/shared";

describe("coinTypeFor", () => {
  it("returns 0 for mainnet", () => {
    expect(coinTypeFor("mainnet" as NetworkId)).toBe(0);
  });
  it("returns 1 for signet, testnet, regtest, l2l-signet", () => {
    expect(coinTypeFor("signet" as NetworkId)).toBe(1);
    expect(coinTypeFor("testnet" as NetworkId)).toBe(1);
    expect(coinTypeFor("regtest" as NetworkId)).toBe(1);
    expect(coinTypeFor("l2l-signet" as NetworkId)).toBe(1);
  });
});

describe("defaultDerivationPath", () => {
  it("returns m/84'/0'/0'/0/0 for mainnet", () => {
    expect(defaultDerivationPath("mainnet" as NetworkId)).toBe("m/84'/0'/0'/0/0");
  });
  it("returns m/84'/1'/0'/0/0 for signet", () => {
    expect(defaultDerivationPath("signet" as NetworkId)).toBe("m/84'/1'/0'/0/0");
  });
  it("accepts a custom index", () => {
    expect(defaultDerivationPath("mainnet" as NetworkId, 5)).toBe("m/84'/0'/0'/0/5");
  });
});

describe("coinIdFor", () => {
  it("returns 'btc' for mainnet", () => {
    expect(coinIdFor("mainnet" as NetworkId)).toBe("btc");
  });
  it("returns 'test' for signet, testnet, l2l-signet", () => {
    expect(coinIdFor("signet" as NetworkId)).toBe("test");
    expect(coinIdFor("testnet" as NetworkId)).toBe("test");
    expect(coinIdFor("l2l-signet" as NetworkId)).toBe("test");
  });
  it("returns 'regtest' for regtest", () => {
    expect(coinIdFor("regtest" as NetworkId)).toBe("regtest");
  });
});

describe("parsePath", () => {
  const H = 0x80000000;

  it("parses a standard BIP-84 signet path", () => {
    expect(parsePath("m/84'/1'/0'/0/0")).toEqual([
      (84 | H) >>> 0,
      (1 | H) >>> 0,
      (0 | H) >>> 0,
      0,
      0,
    ]);
  });

  it("parses a mainnet path with a non-zero index", () => {
    expect(parsePath("m/84'/0'/0'/0/3")).toEqual([
      (84 | H) >>> 0,
      (0 | H) >>> 0,
      (0 | H) >>> 0,
      0,
      3,
    ]);
  });

  it("parses without the m/ prefix", () => {
    expect(parsePath("84'/1'/0'/0/0")).toEqual([
      (84 | H) >>> 0,
      (1 | H) >>> 0,
      (0 | H) >>> 0,
      0,
      0,
    ]);
  });

  it("handles all-hardened segments", () => {
    expect(parsePath("m/0'/1'/2'")).toEqual([
      (0 | H) >>> 0,
      (1 | H) >>> 0,
      (2 | H) >>> 0,
    ]);
  });

  it("throws on non-numeric segment", () => {
    expect(() => parsePath("m/84'/abc'/0'/0/0")).toThrow();
  });

  it("throws on negative index", () => {
    expect(() => parsePath("m/84'/-1'/0'/0/0")).toThrow();
  });

  it("handles large indices without overflow", () => {
    const result = parsePath("m/2147483647/0");
    expect(result).toEqual([2147483647, 0]);
  });
});
