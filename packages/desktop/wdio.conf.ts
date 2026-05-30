// packages/desktop/wdio.conf.ts
//
// WebdriverIO E2E configuration for Sidecoin Desktop (Tauri).
//
// Uses `tauri-driver` as the WebDriver server, which provides
// a W3C WebDriver interface to the native WebKitGTK (Linux),
// WebView2 (Windows), or WKWebView (macOS) webview.
//
// Prerequisites:
//   1. tauri-driver installed: cargo install tauri-driver
//   2. webkit2gtk-driver installed (Linux): apt install webkit2gtk-driver
//   3. Frontend built:  pnpm --filter @sidecoin/desktop exec vite build
//   4. Tauri compiled:  cd src-tauri && cargo build
//   5. Binary exists:   src-tauri/target/debug/sidecoin[.exe]
//
// On Linux CI, tests must run under a virtual display:
//   xvfb-run --auto-servernum pnpm --filter @sidecoin/desktop test:e2e
//
// Usage:
//   pnpm --filter @sidecoin/desktop test:e2e
//   — or —
//   wdio run wdio.conf.ts

import path from "path";
import { fileURLToPath } from "url";
import type { ChildProcess } from "child_process";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ────────────────────────────────────────────────────────────
// Resolve the Tauri binary path per platform
// ────────────────────────────────────────────────────────────

const ext = process.platform === "win32" ? ".exe" : "";
const tauriBinary = path.resolve(
  __dirname,
  "src-tauri",
  "target",
  "debug",
  `sidecoin${ext}`,
);

// ────────────────────────────────────────────────────────────
// tauri-driver process handle — started in onPrepare,
// killed in onComplete
// ────────────────────────────────────────────────────────────

let tauriDriverProcess: ChildProcess | null = null;

export const config: WebdriverIO.Config = {
  // ──────────────────────────────────────────────────────────
  // Runner / framework
  // ──────────────────────────────────────────────────────────

  runner: "local",
  framework: "mocha",
  reporters: ["spec"],

  // ──────────────────────────────────────────────────────────
  // Test files
  // ──────────────────────────────────────────────────────────

  specs: ["./e2e/**/*.e2e.ts"],

  // ──────────────────────────────────────────────────────────
  // WebDriver connection
  //
  // tauri-driver listens on port 4444 by default and speaks
  // the W3C WebDriver protocol. We connect WDIO directly
  // to it — no Chromedriver or Selenium needed.
  // ──────────────────────────────────────────────────────────

  hostname: "localhost",
  port: 4444,

  // ──────────────────────────────────────────────────────────
  // Capabilities — Tauri native webview
  //
  // tauri-driver expects capabilities with browserName "wry"
  // and the application binary in "tauri:options".
  // ──────────────────────────────────────────────────────────

  capabilities: [
    {
      "browserName": "wry",
      "tauri:options": {
        application: tauriBinary,
      },
    },
  ],

  // ──────────────────────────────────────────────────────────
  // Request transform
  //
  // WDIO 9.x unconditionally injects "webSocketUrl" and
  // "unhandledPromptBehavior" into alwaysMatch capabilities.
  // tauri-driver (via WebKitWebDriver) does not recognise
  // these fields and responds with "Failed to match
  // capabilities". We strip them from the /session POST
  // before they reach tauri-driver, and update the
  // Content-Length header to match the new body size
  // (undici rejects with UND_ERR_REQ_CONTENT_LENGTH_MISMATCH
  // if the header doesn't match the actual body).
  // ──────────────────────────────────────────────────────────

  transformRequest: (requestOptions: RequestInit) => {
    if (requestOptions.body) {
      try {
        const bodyStr =
          typeof requestOptions.body === "string"
            ? requestOptions.body
            : new TextDecoder().decode(
                requestOptions.body as BufferSource,
              );

        const body = JSON.parse(bodyStr);

        if (body?.capabilities?.alwaysMatch) {
          delete body.capabilities.alwaysMatch.webSocketUrl;
          delete body.capabilities.alwaysMatch.unhandledPromptBehavior;
          console.log(
            "[wdio:transform] Stripped webSocketUrl and " +
              "unhandledPromptBehavior from session request",
          );
          const newBody = JSON.stringify(body);
          requestOptions.body = newBody;

          // Update Content-Length to match the new body size,
          // otherwise undici rejects with
          // UND_ERR_REQ_CONTENT_LENGTH_MISMATCH
          const headers = requestOptions.headers;
          if (headers instanceof Headers) {
            headers.set(
              "Content-Length",
              Buffer.byteLength(newBody).toString(),
            );
          } else if (Array.isArray(headers)) {
            const idx = headers.findIndex(
              ([k]) => k.toLowerCase() === "content-length",
            );
            if (idx >= 0) {
              headers[idx] = [
                "Content-Length",
                Buffer.byteLength(newBody).toString(),
              ];
            }
          } else if (headers && typeof headers === "object") {
            (headers as Record<string, string>)["Content-Length"] =
              Buffer.byteLength(newBody).toString();
          }
        }
      } catch {
        // If parsing fails, let the original request through
      }
    }
    return requestOptions;
  },

  // ──────────────────────────────────────────────────────────
  // Timeouts
  // ──────────────────────────────────────────────────────────

  waitforTimeout: 10_000,
  connectionRetryTimeout: 30_000,
  connectionRetryCount: 3,

  // ──────────────────────────────────────────────────────────
  // Mocha options
  // ──────────────────────────────────────────────────────────

  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
  },

  // ──────────────────────────────────────────────────────────
  // Hooks
  // ──────────────────────────────────────────────────────────

  // Start tauri-driver before all tests.
  // It must be running before WDIO tries to create a session.
  onPrepare: function () {
    console.log(`[wdio] Tauri binary: ${tauriBinary}`);
    console.log("[wdio] Starting tauri-driver on port 4444...");

    // Force X11 backend — WebKitWebDriver does not work
    // reliably under Wayland and crashes the webview.
    const env = {
      ...process.env,
      GDK_BACKEND: "x11",
      WEBKIT_DISABLE_COMPOSITING_MODE: "1",
    };

    tauriDriverProcess = spawn("tauri-driver", [], {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    tauriDriverProcess.stdout?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.log(`[tauri-driver] ${line}`);
    });

    tauriDriverProcess.stderr?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.error(`[tauri-driver:err] ${line}`);
    });

    // Give tauri-driver time to bind to port 4444
    return new Promise<void>((resolve) => {
      setTimeout(resolve, 2_000);
    });
  },

  // Kill tauri-driver after all tests complete.
  onComplete: function () {
    if (tauriDriverProcess) {
      console.log("[wdio] Stopping tauri-driver...");
      tauriDriverProcess.kill("SIGTERM");
      tauriDriverProcess = null;
    }
  },
};
