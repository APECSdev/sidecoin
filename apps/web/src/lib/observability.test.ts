// apps/web/src/lib/observability.test.ts

/**
 * Pins the GlitchTip init contract for the web app:
 *   - empty PUBLIC_GLITCHTIP_DSN => fully disabled, Sentry.init never called
 *   - set DSN => init with the shared scrubber on both hooks, tracing at 0.1,
 *     and release (package version) + dist (build id) tagging
 *   - captureException is a no-op when disabled
 *
 * NOTE: the module reads PUBLIC_* vars via process.env first (see the
 * readEnv seam in observability.ts) because `vi.stubEnv` does NOT propagate
 * to `import.meta.env` in this Vitest + happy-dom setup (verified).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initSpy = vi.fn();
const captureSpy = vi.fn();

vi.mock("@sentry/browser", () => ({
    init: (...args: unknown[]) => initSpy(...args),
    captureException: (...args: unknown[]) => captureSpy(...args),
}));

const REAL_DSN =
    "https://d82d1c9b-05ec-49a1-b8e5-341416cdce24@glitchtip.apecs.dev/1";

async function loadModule() {
    return await import("./observability");
}

describe("web observability init", () => {
    beforeEach(() => {
        vi.resetModules();
        initSpy.mockClear();
        captureSpy.mockClear();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("is fully disabled when PUBLIC_GLITCHTIP_DSN is unset", async () => {
        vi.stubEnv("PUBLIC_GLITCHTIP_DSN", "");
        const { initObservability, captureException } = await loadModule();

        initObservability();
        captureException(new Error("must not be sent"));

        expect(initSpy).not.toHaveBeenCalled();
        expect(captureSpy).not.toHaveBeenCalled();
    });

    it("initialises with scrubber, tracing 0.1, and release/dist tags when the DSN is set", async () => {
        vi.stubEnv("PUBLIC_GLITCHTIP_DSN", REAL_DSN);
        vi.stubEnv("PUBLIC_GLITCHTIP_DIST", "testdist123");
        const { initObservability, captureException } = await loadModule();

        initObservability();

        expect(initSpy).toHaveBeenCalledTimes(1);
        const opts = initSpy.mock.calls[0][0];
        expect(opts.dsn).toBe(REAL_DSN);
        expect(opts.tracesSampleRate).toBe(0.1);
        expect(opts.dist).toBe("testdist123");
        expect(opts.release).toMatch(/^sidecoin-web@\d+\.\d+\.\d+$/);
        expect(typeof opts.beforeSend).toBe("function");
        expect(typeof opts.beforeBreadcrumb).toBe("function");
        // Session Replay must not be configured (no DOM capture).
        expect(opts.replaysSessionSampleRate).toBeUndefined();
        expect(opts.replaysOnErrorSampleRate).toBeUndefined();

        const err = new Error("web smoke");
        captureException(err);
        expect(captureSpy).toHaveBeenCalledWith(err);
    });

    it("defaults dist to \"dev\" outside CI", async () => {
        vi.stubEnv("PUBLIC_GLITCHTIP_DSN", REAL_DSN);
        const { initObservability } = await loadModule();

        initObservability();

        expect(initSpy.mock.calls[0][0].dist).toBe("dev");
    });
});
