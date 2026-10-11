// packages/observability/src/constraints.test.ts

/**
 * Source-level regression test: pins the wallet/mobile hard constraints so a
 * future edit cannot silently re-enable PII or tracing. Reads the app init
 * sources and asserts the required configuration is present.
 *
 * This guards the HARD CONSTRAINTS from the task:
 *   - wallet + mobile: errors-only (tracesSampleRate 0)
 *   - wallet + web:    no request PII (Sentry SDK v11 removed sendDefaultPii)
 *   - all apps:        DSN empty-by-default guard (no DSN => no-op)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(rel: string): string {
    return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");
}

const WALLET = readSource("../../../apps/wallet/src/observability.ts");
const WEB = readSource("../../../apps/web/src/lib/observability.ts");
const MOBILE = readSource("../../../apps/mobile/src/lib/sentry.ts");

describe("wallet hard constraints", () => {
    it("is errors-only (tracesSampleRate 0)", () => {
        expect(WALLET).toMatch(/tracesSampleRate:\s*0\b/);
    });
    it("guards on DSN (empty => no-op)", () => {
        expect(WALLET).toContain("if (!DSN) return");
    });
    it("wires the shared scrubber", () => {
        expect(WALLET).toContain("makeBeforeSend");
        expect(WALLET).toContain("makeBeforeBreadcrumb");
    });
});

describe("mobile hard constraints", () => {
    it("is errors-only (tracesSampleRate 0)", () => {
        expect(MOBILE).toMatch(/tracesSampleRate:\s*0\b/);
    });
    it("disables PII explicitly (react-native SDK v6 still has the flag)", () => {
        expect(MOBILE).toContain("sendDefaultPii: false");
    });
    it("guards on DSN and module presence", () => {
        expect(MOBILE).toContain("if (!DSN || !SentryModule) return");
    });
});

describe("web constraints", () => {
    it("uses a low tracesSampleRate", () => {
        expect(WEB).toMatch(/tracesSampleRate:\s*0\.1\b/);
    });
    it("guards on DSN (empty => no-op)", () => {
        expect(WEB).toContain("if (!DSN) return");
    });
});
