// packages/mobile/src/lib/sentry.ts

/**
 * Sentry wrapper — gracefully no-ops on F-Droid (fdroid flavor)
 * where @sentry/react-native is excluded from the build.
 */

let SentryModule: typeof import('@sentry/react-native') | null = null

try {
    SentryModule = require('@sentry/react-native')
} catch {
    // F-Droid build — Sentry not available, all exports become no-ops
}

export function initSentry(): void {
    SentryModule?.init({
        dsn: 'YOUR_SENTRY_DSN_HERE',
        tracesSampleRate: 1.0,
    })
}

export function captureException(error: Error): void {
    SentryModule?.captureException(error)
}

export function captureMessage(message: string): void {
    SentryModule?.captureMessage(message)
}

export function setUser(user: { id: string; [key: string]: string } | null): void {
    SentryModule?.setUser(user)
}
