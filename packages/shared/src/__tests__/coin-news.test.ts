// packages/shared/src/__tests__/coin-news.test.ts
//
// Tests for the Coin News v2 OP_RETURN encoder. These are pure byte-level
// tests: no network, no wallet key material, no signing, no broadcast.

import { describe, expect, it } from "vitest";
import { bytesToHex } from "@noble/hashes/utils";
import {
  buildOpReturnScript,
  COIN_NEWS_FEED_BYTES,
  COIN_NEWS_TLV_BODY,
  COIN_NEWS_TLV_FLAG,
  COIN_NEWS_TLV_LINK,
  COIN_NEWS_V2_VERSION,
  encodeCoinNewsV2,
  OP_PUSHDATA1,
  OP_PUSHDATA2,
  OP_PUSHDATA4,
  OP_RETURN,
} from "../tx/coin-news";

function hex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

function findTlv(payload: Uint8Array, tag: number): number {
  let offset = 8 + payload[7];

  while (offset < payload.length) {
    const foundTag = payload[offset];
    const length = payload[offset + 1];

    if (foundTag === tag) {
      return offset;
    }

    if (length === undefined) {
      return -1;
    }

    offset += 2 + length;
  }

  return -1;
}

describe("encodeCoinNewsV2", () => {
  it("encodes a minimal us-weekly v2 post exactly", () => {
    const payload = encodeCoinNewsV2({
      feed: "us-weekly",
      title: "Hello",
    });

    expect(hex(payload)).toBe("434e02a1a1a1a10548656c6c6f");
  });

  it("encodes the Greek Xi title using UTF-8 byte length", () => {
    const payload = encodeCoinNewsV2({
      feed: "us-weekly",
      title: "Introducing SidΞcoin",
    });

    // Header is 7 bytes. Byte 7 is the one-byte title length.
    // "Introducing SidΞcoin" is 21 UTF-8 bytes because Ξ is two bytes.
    expect(payload[7]).toBe(21);
    expect(payload.length).toBe(29);
  });

  it("encodes link, body, and flag TLVs in tag/len/value format", () => {
    const payload = encodeCoinNewsV2({
      feed: "us-weekly",
      title: "Hello",
      link: "https://sidecoin.app",
      body: "Body",
      flag: 1,
    });

    expect(hex(payload)).toBe(
      "434e02a1a1a1a10548656c6c6f" +
      "011468747470733a2f2f73696465636f696e2e617070" +
      "0204426f6479" +
      "050101",
    );
  });

  it("omits the flag TLV by default", () => {
    const payload = encodeCoinNewsV2({
      feed: "us-weekly",
      title: "Hello",
      body: "Body",
    });

    expect(findTlv(payload, COIN_NEWS_TLV_BODY)).toBeGreaterThan(0);
    expect(findTlv(payload, COIN_NEWS_TLV_FLAG)).toBe(-1);
  });

  it("supports explicit raw flag byte 0", () => {
    const payload = encodeCoinNewsV2({
      feed: "us-weekly",
      title: "Hello",
      flag: 0,
    });

    expect(hex(payload).endsWith("050100")).toBe(true);
  });

  it("uses the configured feed bytes for every known feed", () => {
    for (const [feed, bytes] of Object.entries(COIN_NEWS_FEED_BYTES)) {
      const payload = encodeCoinNewsV2({
        feed: feed as keyof typeof COIN_NEWS_FEED_BYTES,
        title: "Hello",
      });

      expect(Array.from(payload.slice(3, 7))).toEqual(bytes);
    }
  });

  it("emits v2 only", () => {
    const payload = encodeCoinNewsV2({
      feed: "nostr",
      title: "Hello",
    });

    expect(payload[2]).toBe(COIN_NEWS_V2_VERSION);
  });

  it("preserves multi-line body text as UTF-8 bytes", () => {
    const payload = encodeCoinNewsV2({
      feed: "japan-weekly",
      title: "Weekly",
      body: "Line 1\nLine 2",
    });

    const bodyIndex = findTlv(payload, COIN_NEWS_TLV_BODY);
    expect(bodyIndex).toBeGreaterThan(0);
    expect(payload[bodyIndex + 1]).toBe(13);
  });

  it("rejects an empty title", () => {
    expect(() =>
      encodeCoinNewsV2({
        feed: "us-weekly",
        title: "",
      }),
    ).toThrow(/title must not be empty/i);
  });

  it("accepts a 255-byte title", () => {
    const payload = encodeCoinNewsV2({
      feed: "us-weekly",
      title: "a".repeat(255),
    });

    expect(payload[7]).toBe(255);
  });

  it("rejects a title longer than 255 UTF-8 bytes", () => {
    expect(() =>
      encodeCoinNewsV2({
        feed: "us-weekly",
        title: "a".repeat(256),
      }),
    ).toThrow(/title.*255 UTF-8 bytes/i);
  });

  it("rejects a link longer than 255 UTF-8 bytes", () => {
    expect(() =>
      encodeCoinNewsV2({
        feed: "us-weekly",
        title: "Hello",
        link: "a".repeat(256),
      }),
    ).toThrow(/link.*255 UTF-8 bytes/i);
  });

  it("rejects a body longer than 255 UTF-8 bytes", () => {
    expect(() =>
      encodeCoinNewsV2({
        feed: "us-weekly",
        title: "Hello",
        body: "a".repeat(256),
      }),
    ).toThrow(/body.*255 UTF-8 bytes/i);
  });

  it("rejects a non-byte flag", () => {
    expect(() =>
      encodeCoinNewsV2({
        feed: "us-weekly",
        title: "Hello",
        flag: 256,
      }),
    ).toThrow(/flag.*0 to 255/i);
  });

  it("omits empty optional string TLVs", () => {
    const payload = encodeCoinNewsV2({
      feed: "us-weekly",
      title: "Hello",
      link: "",
      body: "",
    });

    expect(findTlv(payload, COIN_NEWS_TLV_LINK)).toBe(-1);
    expect(findTlv(payload, COIN_NEWS_TLV_BODY)).toBe(-1);
  });
});

describe("buildOpReturnScript", () => {
  it("wraps a small payload in OP_RETURN with a direct data push", () => {
    const script = buildOpReturnScript(new Uint8Array([0x61, 0x62, 0x63]));

    expect(hex(script)).toBe("6a03616263");
  });

  it("uses PUSHDATA1 for a 76-byte payload", () => {
    const payload = new Uint8Array(76);
    const script = buildOpReturnScript(payload);

    expect(script[0]).toBe(OP_RETURN);
    expect(script[1]).toBe(OP_PUSHDATA1);
    expect(script[2]).toBe(76);
    expect(script.length).toBe(79);
  });

  it("uses PUSHDATA2 for a 256-byte payload", () => {
    const payload = new Uint8Array(256);
    const script = buildOpReturnScript(payload);

    expect(script[0]).toBe(OP_RETURN);
    expect(script[1]).toBe(OP_PUSHDATA2);
    expect(script[2]).toBe(0x00);
    expect(script[3]).toBe(0x01);
    expect(script.length).toBe(260);
  });

  it("uses PUSHDATA4 for a payload over 65535 bytes", () => {
    const payload = new Uint8Array(65536);
    const script = buildOpReturnScript(payload);

    expect(script[0]).toBe(OP_RETURN);
    expect(script[1]).toBe(OP_PUSHDATA4);
    expect(script[2]).toBe(0x00);
    expect(script[3]).toBe(0x00);
    expect(script[4]).toBe(0x01);
    expect(script[5]).toBe(0x00);
    expect(script.length).toBe(65542);
  });

  it("rejects an empty OP_RETURN payload", () => {
    expect(() => buildOpReturnScript(new Uint8Array())).toThrow(/empty/i);
  });
});
