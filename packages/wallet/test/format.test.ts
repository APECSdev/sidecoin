// packages/wallet/test/format.test.ts
import { describe, it, expect } from "vitest";
import { satsToBtc } from "../src/api/index.js";

describe("satsToBtc", () => {
  it("formats 133700000 sats as 1.337 (the test deposit)", () => {
    expect(satsToBtc(133700000n)).toBe("1.337");
  });

  it("formats a whole coin without a fraction", () => {
    expect(satsToBtc(100000000n)).toBe("1");
  });

  it("formats zero", () => {
    expect(satsToBtc(0n)).toBe("0");
  });

  it("keeps full precision down to 1 sat", () => {
    expect(satsToBtc(1n)).toBe("0.00000001");
  });
});
