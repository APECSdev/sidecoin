// packages/shared/src/sidechains/thunder/address.ts
//
// Thunder addresses and deposit strings.
//
// Address (thunder-rust types/authorization.rs::get_address, unchanged since
// before 0.18):
//     BLAKE3 (unkeyed, XOF) over the 32-byte compressed ristretto255 public
//     key, first 20 bytes, encoded as PLAIN base58 — no checksum, no version
//     byte. 20 bytes → 27-28 base58 characters.
//
// Deposit string (UI-only encoding; the M5's OP_RETURN carries the BARE
// address bytes, never this wrapped form — the sidechain cannot parse the
// wrapper and would credit an unspendable address):
//     s<slot>_<address>_<checksum>
//     checksum = hex(sha256("s<slot>_<address>_")[0..3])
// Verified against a real betanet deposit (f83c5c7a…88c5, block 970,642)
// and BitWindow's DecodeDepositAddress.

import { base58 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha256";
import { blake3 } from "@noble/hashes/blake3";

import { THUNDER_SLOT } from "./keys";
import type { PointBytes } from "./crypto";

/** The 20-byte Thunder address hash of a compressed ristretto public key. */
export function thunderAddressBytes(publicKey: PointBytes): Uint8Array {
  if (publicKey.length !== 32) {
    throw new Error(`thunderAddressBytes: expected 32-byte public key, got ${publicKey.length}`);
  }
  return blake3(publicKey, { dkLen: 20 });
}

/** The base58 display form of a Thunder public key. */
export function thunderAddress(publicKey: PointBytes): string {
  return base58.encode(thunderAddressBytes(publicKey));
}

/** The 20-byte address parsed back from its base58 form. */
export function thunderAddressBytesFromBase58(address: string): Uint8Array {
  const bytes = base58.decode(address);
  if (bytes.length !== 20) {
    throw new Error(`thunderAddressBytesFromBase58: expected 20 bytes, got ${bytes.length}`);
  }
  return bytes;
}

/** Encode an UTF-8 string as lowercase hex. */
function hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * The user-facing deposit wrapper: `s<slot>_<address>_<checksum>` with
 * checksum = hex(sha256("s<slot>_<address>_")[0..3]).
 */
export function thunderDepositString(address: string, slot: number = THUNDER_SLOT): string {
  return `s${slot}_${address}_${hex(sha256(new TextEncoder().encode(`s${slot}_${address}_`)).slice(0, 3))}`;
}

/** Parsed deposit string. */
export interface ParsedDepositString {
  slot: number;
  /** Bare base58 Thunder address (20 bytes encoded). */
  address: string;
}

/**
 * Decode a deposit string. Accepts the bare address (slot from context),
 * `s<slot>_<addr>` and the full `s<slot>_<addr>_<checksum>` form. The slot
 * must equal `expectedSlot` when given — an address pasted into another
 * sidechain's deposit must be rejected, not silently redirected.
 */
export function parseThunderDepositString(input: string, expectedSlot: number = THUNDER_SLOT): ParsedDepositString {
  const parts = input.trim().split("_");
  if (parts.length === 1) {
    return { slot: expectedSlot, address: parts[0] };
  }
  if (parts.length < 2 || parts.length > 3) {
    throw new Error("Malformed deposit string");
  }
  if (!parts[0].startsWith("s")) {
    throw new Error("Malformed deposit string: expected s<slot>_ prefix");
  }
  const slot = Number(parts[0].slice(1));
  if (!Number.isInteger(slot) || slot < 0 || slot > 255) {
    throw new Error("Malformed deposit string: slot must be 0-255");
  }
  if (slot !== expectedSlot) {
    throw new Error(`Deposit string is for slot ${slot}, expected ${expectedSlot}`);
  }
  const address = parts[1];
  if (parts.length === 3) {
    const expected = hex(sha256(new TextEncoder().encode(`s${slot}_${address}_`)).slice(0, 3));
    if (parts[2].toLowerCase() !== expected) {
      throw new Error("Deposit string checksum mismatch");
    }
  }
  // Validate the inner address decodes to 20 bytes.
  thunderAddressBytesFromBase58(address);
  return { slot, address };
}
