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
 *
 * Every event is tagged with `release` (package version) and `dist` (the CI
 * build commit via PUBLIC_GLITCHTIP_DIST, "dev" locally) so GlitchTip can
 * attribute errors to a specific deploy.
 */

import * as Sentry from "@sentry/browser";
import {
    makeBeforeSend,
    makeBeforeBreadcrumb,
} from "@sidecoin/observability";
import pkg from "../../package.json";

/**
 * Read a PUBLIC_* env var. Build-time/test (Node): process.env. Browser
 * bundle: import.meta.env — Vite bakes the PUBLIC_* vars into that object at
 * build time (dynamic-key access still resolves against the baked object).
 */
function readEnv(name: string): string {
    if (typeof process !== "undefined" && process.env?.[name]) {
        return process.env[name] as string;
    }
    return (
        (typeof import.meta !== "undefined" &&
            ((import.meta as any).env?.[name] as string | undefined)) ||
        ""
    );
}

const DSN = readEnv("PUBLIC_GLITCHTIP_DSN");

const DIST = readEnv("PUBLIC_GLITCHTIP_DIST") || "dev";

export function initObservability(): void {
    // No DSN => disabled, no network calls.
    if (!DSN) return;

    Sentry.init({
        dsn: DSN,
        // NOTE: `sendDefaultPii` was removed in Sentry SDK v11 — v11 defaults to
        // NOT sending PII. Session Replay is not installed/enabled (no DOM capture).
        // Session Replay is DISABLED everywhere — no DOM capture.
        tracesSampleRate: 0.1,
        release: `sidecoin-web@${pkg.version}`,
        dist: DIST,
        beforeSend: makeBeforeSend(),
        beforeBreadcrumb: makeBeforeBreadcrumb(),
    });
}

export function captureException(error: unknown): void {
    if (!DSN) return;
    Sentry.captureException(error);
}
