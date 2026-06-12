// packages/wallet/src/__tests__/paymenturi.test.ts
//
// Tests for the pure BIP-21 / bare-address payment parser used by the Send
// page's QR scanner.

import { describe, it, expect } from "vitest";
import { parsePaymentUri } from "../components/paymenturi";

describe("parsePaymentUri", () => {
  it("passes a bare bech32 signet address through unchanged", () => {
    const r = parsePaymentUri("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx");
    expect(r.address).toBe("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx");
    expect(r.amount).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    const r = parsePaymentUri("  tb1qexample  ");
    expect(r.address).toBe("tb1qexample");
  });

  it("strips the bitcoin: scheme from a BIP-21 URI", () => {
    const r = parsePaymentUri("bitcoin:tb1qexample");
    expect(r.address).toBe("tb1qexample");
    expect(r.amount).toBeUndefined();
  });

  it("treats the bitcoin: scheme case-insensitively", () => {
    const r = parsePaymentUri("BITCOIN:tb1qexample");
    expect(r.address).toBe("tb1qexample");
  });

  it("reads a valid amount from a BIP-21 URI", () => {
    const r = parsePaymentUri("bitcoin:tb1qexample?amount=0.001");
    expect(r.address).toBe("tb1qexample");
    expect(r.amount).toBe("0.001");
  });

  it("reads the amount alongside other params (label, message)", () => {
    const r = parsePaymentUri(
      "bitcoin:tb1qexample?label=Coffee&amount=1.5&message=hi",
    );
    expect(r.address).toBe("tb1qexample");
    expect(r.amount).toBe("1.5");
  });

  it("ignores a non-numeric amount rather than fabricating one", () => {
    const r = parsePaymentUri("bitcoin:tb1qexample?amount=abc");
    expect(r.address).toBe("tb1qexample");
    expect(r.amount).toBeUndefined();
  });

  it("keeps a cashaddr ecash: prefix verbatim (not a bitcoin: scheme)", () => {
    const r = parsePaymentUri("ecash:qqfh2x9p0lq8s2example");
    expect(r.address).toBe("ecash:qqfh2x9p0lq8s2example");
  });

  it("parses an amount on an ecash: URI while keeping the prefix", () => {
    const r = parsePaymentUri("ecash:qqexample?amount=2");
    expect(r.address).toBe("ecash:qqexample");
    expect(r.amount).toBe("2");
  });

  it("returns an empty address for empty input", () => {
    expect(parsePaymentUri("")).toEqual({ address: "" });
    expect(parsePaymentUri("   ")).toEqual({ address: "" });
  });
});
