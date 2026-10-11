// apps/mobile/src/lib/sentry.ts

/**
 * GlitchTip (Sentry-compatible) error tracking — playstore flavor only.
 *
 * Metro rewrites `@sentry/react-native` to `./sentry-noop` for the fdroid
 * flavor (see metro.config.js), so F-Droid builds have NO crash reporting by
 * policy. The try/require below is the belt-and-braces no-op for the same case.
 *
 * DSN: GLITCHTIP_DSN is baked in at build time and is EMPTY by default — no DSN
 * => the SDK is disabled and makes ZERO network calls. Mobile is the MOST
 * sensitive surface (encrypted keystore + device), so it rolls out LAST, behind
 * the shared scrubber (@sidecoin/observability).
 *
 * Hard constraints: Session Replay OFF, sendDefaultPii=false, errors-only
 * (tracesSampleRate 0), shared scrubber on beforeSend/beforeBreadcrumb.
 */

import { makeBeforeSend, makeBeforeBreadcrumb } from "@sidecoin/observability";

let SentryModule: typeof import('@sentry/react-native') | null = null

try {
    SentryModule = require('@sentry/react-native')
} catch {
    // F-Droid build — Sentry not available, all exports become no-ops
}

// Build-time DSN. Overridden at bundle time for the playstore flavor; empty
// otherwise. RN has no import.meta.env; use a placeholder replaced by the
// build, or read a global injected via the app config. Empty => disabled.
const DSN: string = (globalThis as any).__GLITCHTIP_DSN__ ?? '';

export function initSentry(): void {
    // No DSN => disabled, no network calls. Also no-ops on F-Droid (no module).
    if (!DSN || !SentryModule) return;

    SentryModule.init({
        dsn: DSN,
        sendDefaultPii: false,
        // Session Replay DISABLED — no screen/DOM capture.
        // Errors only for mobile: no tracing unless explicitly enabled.
        tracesSampleRate: 0,
        enableAutoSessionTracking: false,
        beforeSend: makeBeforeSend() as never,
        beforeBreadcrumb: makeBeforeBreadcrumb() as never,
    })
}

export function captureException(error: Error): void {
    if (!DSN || !SentryModule) return
    SentryModule.captureException(error)
}

export function captureMessage(message: string): void {
    if (!DSN || !SentryModule) return
    SentryModule.captureMessage(message)
}

export function setUser(user: { id: string; [key: string]: string } | null): void {
    if (!DSN || !SentryModule) return
    SentryModule.setUser(user)
}
