// packages/mobile/src/test-setup.ts
//
// Test-specific setup file that mirrors polyfills.ts but is safe
// for the Jest/jsdom environment.
//
// Why not just use polyfills.ts directly?
//   - react-native-get-random-values declares `let module` internally,
//     which collides with Jest's CommonJS `module` global.
//   - Jest's jsdom environment already provides crypto.getRandomValues,
//     so the polyfill is unnecessary in tests.
//   - __DEV__ is not defined by Jest (React Native's bundler sets it).
//
// This file replicates the remaining polyfills so tests run in the
// same global environment as the app (Buffer, process, URL).

// ──────────────────────────────────────────────────────
// 1. crypto.getRandomValues
//
//    Already available in Jest's jsdom environment.
//    No import needed — skipping react-native-get-random-values.
// ──────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────
// 2. Buffer
//
//    Many crypto libraries (bip39, bitcoin-related libs)
//    use Node's Buffer. React Native doesn't provide it.
//    We attach it globally so `Buffer.from(...)` works
//    everywhere without explicit imports.
// ──────────────────────────────────────────────────────
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

// ──────────────────────────────────────────────────────
// 3. process
//
//    Some libraries check `process.env.NODE_ENV` or
//    `process.version`. The `process` npm package
//    provides a minimal shim for this.
// ──────────────────────────────────────────────────────
import process from "process";

if (typeof globalThis.process === "undefined") {
  globalThis.process = process;
}

// ──────────────────────────────────────────────────────
// 4. TextEncoder / TextDecoder
//
//    Already available in Jest's jsdom environment.
//    No polyfill needed.
// ──────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────
// 5. URL
//
//    Already available in Jest's jsdom environment.
//    Fall back to the `url` polyfill package if missing.
// ──────────────────────────────────────────────────────
if (typeof globalThis.URL === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { URL, URLSearchParams } = require("url");
  globalThis.URL = URL;
  globalThis.URLSearchParams = URLSearchParams;
}

// ──────────────────────────────────────────────────────
// Debug: log polyfill status in test environment.
// ──────────────────────────────────────────────────────
console.log("[test-setup] crypto.getRandomValues:", typeof globalThis.crypto?.getRandomValues);
console.log("[test-setup] Buffer:", typeof globalThis.Buffer);
console.log("[test-setup] process:", typeof globalThis.process);
console.log("[test-setup] TextEncoder:", typeof globalThis.TextEncoder);
console.log("[test-setup] URL:", typeof globalThis.URL);
