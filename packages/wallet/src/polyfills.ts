// packages/wallet/src/polyfills.ts
//
// Node-global polyfills required by the hardware wallet SDKs (OneKey, Ledger,
// Trezor), which reference Buffer / process / global as Node globals. Vite's
// browser build does not provide these by default.
//
// This module MUST be imported before any hardware SDK is dynamically imported
// — import it as the very first line of main.ts.

import { Buffer } from "buffer";
import process from "process";

// Expose Buffer as a global for SDK code that uses the bare `Buffer` identifier.
(globalThis as any).Buffer = Buffer;

// Some Node-origin modules reference the bare `global` identifier. Vite's
// `define: { global: 'globalThis' }` (see vite.config.ts) rewrites those at
// build time; we also set it at runtime for the dev server + dynamic imports.
(globalThis as any).global = globalThis;

// `process` is referenced by several SDK internals (process.env, process.nextTick).
(globalThis as any).process = process;
