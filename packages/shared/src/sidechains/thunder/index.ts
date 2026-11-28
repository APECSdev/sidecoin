// packages/shared/src/sidechains/thunder/index.ts
//
// Thunder (BIP-300/301 slot 9) thin-client stack: versioned key
// derivation, FROST-ristretto255 signing, addresses + deposit strings,
// canonical Borsh codec, JSON wire shapes, coin selection, and per-network
// deployment facts. Pure TypeScript over @noble/curves + @noble/hashes +
// @scure/base — no native modules, no FFI, usable in every workspace app.
//
// Implemented from the MIT-licensed thunder-rust sources (v0.19.3) and the
// frost-core revision thunder-rust pins; see each file's header for the
// exact source of every byte-level rule.

export * from "./crypto";
export * from "./keys";
export * from "./address";
export * from "./frost";
export * from "./borsh";
export * from "./transaction";
export * from "./wire";
export * from "./wallet";
export * from "./selection";
export * from "./maturity";
export * from "./networks";
