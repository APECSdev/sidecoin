// apps/web/src/lib/observability.ts

/**
 * GlitchTip (Sentry-compatible) init for the web app — LEAST sensitive package,
 * rolled out first.
 *
 * DSN is injected at build time via Astro's PUBLIC_GLITCHTIP_DSN. When unset,
 * the SDK is fully disabled and makes ZERO network calls.
 *
 * Hard constraints: Session Replay OFF, shared scrubber on
 * beforeSend/beforeBreadcrumb, low tracesSampleRate (0.1).
 */

import * as Sentry from "@sentry/browser";
import {
    makeBeforeSend,
    makeBeforeBreadcrumb,
} from "@sidecoin/observability";

const DSN =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.PUBLIC_GLITCHTIP_DSN) || "";

export function initObservability(): void {
    // No DSN => disabled, no network calls.
    if (!DSN) return;

    Sentry.init({
        dsn: DSN,
        // NOTE: `sendDefaultPii` was removed in Sentry SDK v11 — v11 defaults to
        // NOT sending PII. Session Replay is not installed/enabled (no DOM capture).
        // Session Replay is DISABLED everywhere — no DOM capture.
        tracesSampleRate: 0.1,
        beforeSend: makeBeforeSend(),
        beforeBreadcrumb: makeBeforeBreadcrumb(),
    });
}

export function captureException(error: unknown): void {
    if (!DSN) return;
    Sentry.captureException(error);
}
