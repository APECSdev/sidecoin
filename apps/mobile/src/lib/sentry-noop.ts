// apps/mobile/src/lib/sentry-noop.ts
//
// F-Droid (fdroid flavor) replacement for @sentry/react-native.
//
// @sentry/react-native is an optionalDependency and is deliberately absent
// from F-Droid builds, so Metro rewrites every import of that package to this
// module (see metro.config.js). The exported surface mirrors the four helpers
// src/lib/sentry.ts consumes, so the wrapper compiles and no-ops unchanged.
//
// Losing crash reporting entirely on F-Droid builds is an accepted tradeoff.

export function init(): void {
    // no-op — no crash reporting on F-Droid builds
}

export function captureException(_error: unknown): void {
    // no-op — no crash reporting on F-Droid builds
}

export function captureMessage(_message: string): void {
    // no-op — no crash reporting on F-Droid builds
}

export function setUser(_user: { id: string; [key: string]: string } | null): void {
    // no-op — no crash reporting on F-Droid builds
}
