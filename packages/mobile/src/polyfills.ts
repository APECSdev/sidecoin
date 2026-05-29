// packages/mobile/src/polyfills.ts
//
// Global polyfills that MUST be loaded before any other application code.
//
// These bridge the gap between Node.js APIs that crypto/networking
// libraries expect and the React Native JavaScriptCore/Hermes runtime
// which does not provide them natively.
//
// This file is imported as the very first thing in index.js.
// It is also referenced in jest.config.ts setupFiles so tests
// have the same global environment.
//
// ORDER MATTERS — do not rearrange these imports.

// ──────────────────────────────────────────────────────
// 1. crypto.getRandomValues
//
//    MUST be loaded before anything that touches
//    crypto (bip39, uuid, quick-crypto, etc.).
//    This polyfill patches the global `crypto` object
//    with a native CSPRNG implementation.
// ──────────────────────────────────────────────────────
import "react-native-get-random-values";

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
//    Hermes (RN 0.81's default JS engine) provides
//    TextEncoder/TextDecoder natively. No polyfill
//    is needed. This comment is kept for documentation
//    purposes — if targeting an older engine without
//    native support, install "fast-text-encoding" and
//    import it here unconditionally.
// ──────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────
// 5. URL
//
//    Hermes provides a partial URL implementation.
//    If it's missing or broken (very old Hermes builds),
//    fall back to the `url` polyfill package.
// ──────────────────────────────────────────────────────
if (typeof globalThis.URL === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { URL, URLSearchParams } = require("url");
  globalThis.URL = URL;
  globalThis.URLSearchParams = URLSearchParams;
}

// ──────────────────────────────────────────────────────
// Debug: log polyfill status in development builds.
// This helps diagnose "X is not defined" crashes early.
// ──────────────────────────────────────────────────────
if (__DEV__) {
  console.log("[polyfills] crypto.getRandomValues:", typeof globalThis.crypto?.getRandomValues);
  console.log("[polyfills] Buffer:", typeof globalThis.Buffer);
  console.log("[polyfills] process:", typeof globalThis.process);
  console.log("[polyfills] TextEncoder:", typeof globalThis.TextEncoder);
  console.log("[polyfills] URL:", typeof globalThis.URL);
}
