// packages/shared/src/__tests__/mnemonic.test.ts

import { describe, it, expect } from "vitest";
import {
  generateMnemonic,
  validateMnemonic,
  normalizeMnemonic,
} from "../wallet/mnemonic";

// Canonical BIP-39 test vector — valid checksum.
const VALID_12 =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
// All-"abandon" x12 is a *wrong* checksum — must be rejected.
const BAD_CHECKSUM_12 = Array(12).fill("abandon").join(" ");

describe("mnemonic", () => {
  describe("validateMnemonic", () => {
    it("accepts a valid 12-word mnemonic", () => {
      expect(validateMnemonic(VALID_12)).toBe(true);
    });

    it("rejects a mnemonic with a bad checksum", () => {
      expect(validateMnemonic(BAD_CHECKSUM_12)).toBe(false);
    });

    it("rejects a too-short phrase", () => {
      expect(validateMnemonic("abandon abandon")).toBe(false);
    });

    it("rejects a non-wordlist word", () => {
      expect(validateMnemonic(VALID_12.replace("about", "zzzzz"))).toBe(false);
    });

    it("is tolerant of extra whitespace and case", () => {
      expect(validateMnemonic(`  ABANDON   ${VALID_12.slice(8)}  `)).toBe(true);
    });
  });

  describe("generateMnemonic", () => {
    it("produces a valid 12-word mnemonic by default", () => {
      const m = generateMnemonic();
      expect(m.split(" ")).toHaveLength(12);
      expect(validateMnemonic(m)).toBe(true);
    });

    it("produces a valid 24-word mnemonic at 256-bit strength", () => {
      const m = generateMnemonic(256);
      expect(m.split(" ")).toHaveLength(24);
      expect(validateMnemonic(m)).toBe(true);
    });

    it("produces a different mnemonic each call", () => {
      expect(generateMnemonic()).not.toBe(generateMnemonic());
    });
  });

  describe("normalizeMnemonic", () => {
    it("collapses whitespace, trims, and lowercases", () => {
      expect(normalizeMnemonic("  Foo   BAR\tbaz \n")).toBe("foo bar baz");
    });
  });
});
