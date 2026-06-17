// packages/shared/src/tx/coin-news.ts
//
// Coin News OP_RETURN payload encoder.
//
// This implements the v2 wire format decoded by SupaQt:
//
//   magic      2 bytes  "CN" / 0x43 0x4e
//   version    1 byte   0x02
//   feed       4 bytes  opaque feed id, wire order
//   title_len  1 byte   UTF-8 byte length
//   title      N bytes  UTF-8 title bytes
//   TLVs       var      tag(1) len(1) value(len)
//
// Supported TLVs:
//   0x01 link
//   0x02 body
//   0x05 flag — encoded as 0x05 0x01 0xVV when present
//
// Phase 1 notes:
//   - emit v2 only
//   - omit flag by default
//   - do not encode author
//   - do not encode fee
//   - emit exactly one OP_RETURN output per posting transaction

import { utf8ToBytes } from "@noble/hashes/utils";

export const COIN_NEWS_MAGIC = new Uint8Array([0x43, 0x4e]);
export const COIN_NEWS_V2_VERSION = 0x02;

export const COIN_NEWS_TLV_LINK = 0x01;
export const COIN_NEWS_TLV_BODY = 0x02;
export const COIN_NEWS_TLV_FLAG = 0x05;

export const OP_RETURN = 0x6a;
export const OP_PUSHDATA1 = 0x4c;
export const OP_PUSHDATA2 = 0x4d;
export const OP_PUSHDATA4 = 0x4e;

export const COIN_NEWS_FEED_BYTES = {
  "us-weekly": [0xa1, 0xa1, 0xa1, 0xa1],
  "japan-weekly": [0xa2, 0xa2, 0xa2, 0xa2],
  nascar: [0xb1, 0x2d, 0x2e, 0xce],
  nostr: [0xa5, 0xa9, 0x41, 0x2e],
} as const;

export type CoinNewsFeedSlug = keyof typeof COIN_NEWS_FEED_BYTES;

export interface CoinNewsDraft {
  readonly feed: CoinNewsFeedSlug;
  readonly title: string;
  readonly link?: string | null;
  readonly body?: string | null;
  readonly flag?: number | null;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

function encodeUtf8Field(label: string, value: string): Uint8Array {
  const bytes = utf8ToBytes(value);

  if (bytes.length > 255) {
    throw new Error(`${label} must be 255 UTF-8 bytes or fewer.`);
  }

  return bytes;
}

function encodeOptionalUtf8Tlv(
  tag: number,
  label: string,
  value: string | null | undefined,
): Uint8Array | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const bytes = encodeUtf8Field(label, value);
  return concatBytes([new Uint8Array([tag, bytes.length]), bytes]);
}

function encodeFlagTlv(flag: number | null | undefined): Uint8Array | null {
  if (flag === null || flag === undefined) {
    return null;
  }

  if (!Number.isInteger(flag) || flag < 0 || flag > 255) {
    throw new Error(`flag must be an integer byte from 0 to 255, got ${flag}.`);
  }

  return new Uint8Array([COIN_NEWS_TLV_FLAG, 0x01, flag]);
}

/**
 * Encode a Coin News draft as a v2 SupaQt-compatible payload.
 *
 * The returned bytes are the data payload that belongs inside a single
 * OP_RETURN data push. Use buildOpReturnScript(payload) to wrap it as script.
 */
export function encodeCoinNewsV2(draft: CoinNewsDraft): Uint8Array {
  const titleBytes = encodeUtf8Field("title", draft.title);

  if (titleBytes.length === 0) {
    throw new Error("title must not be empty.");
  }

  const feedBytes = Uint8Array.from(COIN_NEWS_FEED_BYTES[draft.feed]);

  const chunks: Uint8Array[] = [
    COIN_NEWS_MAGIC,
    new Uint8Array([COIN_NEWS_V2_VERSION]),
    feedBytes,
    new Uint8Array([titleBytes.length]),
    titleBytes,
  ];

  const link = encodeOptionalUtf8Tlv(
    COIN_NEWS_TLV_LINK,
    "link",
    draft.link,
  );
  if (link) chunks.push(link);

  const body = encodeOptionalUtf8Tlv(
    COIN_NEWS_TLV_BODY,
    "body",
    draft.body,
  );
  if (body) chunks.push(body);

  const flag = encodeFlagTlv(draft.flag);
  if (flag) chunks.push(flag);

  return concatBytes(chunks);
}

/**
 * Build an OP_RETURN script containing exactly one data push.
 *
 * SupaQt reads only the first data push within the OP_RETURN output, so callers
 * must put the entire Coin News payload in this single push.
 */
export function buildOpReturnScript(payload: Uint8Array): Uint8Array {
  if (payload.length === 0) {
    throw new Error("OP_RETURN payload must not be empty.");
  }

  if (payload.length <= 75) {
    return concatBytes([
      new Uint8Array([OP_RETURN, payload.length]),
      payload,
    ]);
  }

  if (payload.length <= 0xff) {
    return concatBytes([
      new Uint8Array([OP_RETURN, OP_PUSHDATA1, payload.length]),
      payload,
    ]);
  }

  if (payload.length <= 0xffff) {
    return concatBytes([
      new Uint8Array([
        OP_RETURN,
        OP_PUSHDATA2,
        payload.length & 0xff,
        (payload.length >> 8) & 0xff,
      ]),
      payload,
    ]);
  }

  if (payload.length <= 0xffffffff) {
    return concatBytes([
      new Uint8Array([
        OP_RETURN,
        OP_PUSHDATA4,
        payload.length & 0xff,
        (payload.length >> 8) & 0xff,
        (payload.length >> 16) & 0xff,
        (payload.length >> 24) & 0xff,
      ]),
      payload,
    ]);
  }

  throw new Error("OP_RETURN payload is too large.");
}
