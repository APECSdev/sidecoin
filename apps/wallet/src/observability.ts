// apps/wallet/src/observability.ts

/**
 * GlitchTip (Sentry-compatible) init for the WALLET — the MOST sensitive
 * package, rolled out LAST, behind a hard scrubbing gate.
 *
 * The DSN is injected at build time via Vite's VITE_GLITCHTIP_DSN and is
 * INTENTIONALLY LEFT EMPTY until the shared scrubber
 * (@sidecoin/observability) has been reviewed and signed off. When unset, the
 * SDK is fully disabled and makes ZERO network calls.
 *
 * Hard constraints (non-negotiable):
 *   - Session Replay DISABLED (no DOM capture).
 *   - Errors only: tracesSampleRate 0 (no performance tracing).
 *   - Shared scrubber on beforeSend/beforeBreadcrumb redacts mnemonics, xprv,
 *     WIF, addresses, the sidecoin.wallet.v1 keystore, auth headers, cookies,
 *     and query strings. No request bodies are attached.
 */

import * as Sentry from "@sentry/vue";
import {
    makeBeforeSend,
    makeBeforeBreadcrumb,
} from "@sidecoin/observability";

const DSN =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GLITCHTIP_DSN) || "";

export function initObservability(app?: import("vue").App): void {
    // No DSN => disabled, no network calls. The wallet DSN stays unset until
    // the scrubber is reviewed.
    if (!DSN) return;

    Sentry.init({
        app: app as never,
        dsn: DSN,
        // NOTE: `sendDefaultPii` was removed in Sentry SDK v11 — v11 defaults to
        // NOT sending PII, so there is nothing to disable. Session Replay is not
        // installed/enabled (no DOM capture).
        // Session Replay DISABLED everywhere — no DOM capture.
        // Errors only for the wallet: no tracing unless explicitly enabled.
        tracesSampleRate: 0,
        beforeSend: makeBeforeSend(),
        beforeBreadcrumb: makeBeforeBreadcrumb(),
    });
}

export function captureException(error: unknown): void {
    if (!DSN) return;
    Sentry.captureException(error);
}
