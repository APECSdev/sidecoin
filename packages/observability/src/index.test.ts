// packages/observability/src/index.test.ts

/**
 * Hard-constraint security test for the scrubber.
 *
 * Proves that a synthetic Sentry event containing a fake mnemonic, an xprv,
 * a WIF key, a bech32 + base58 address, sensitive headers, a query string,
 * the browser keystore key, and the mobile keystore service is FULLY redacted
 * before it is allowed to leave the device.
 *
 * The fixture values below are synthetic and must never be real secrets.
 */

import { describe, it, expect } from "vitest";
import {
    scrubEvent,
    scrubString,
    scrubBreadcrumb,
    makeBeforeSend,
    REDACTED,
} from "./index";

const FAKE_MNEMONIC =
    "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title";
const FAKE_XPRV =
    "xprv9s21ZrQH143K3GJpoapnV8SFfukcVBSfeCficPSGfubmSFDxo1kuHnLisriDvSnRRuL2Qrg5ggqHKNVpxR86QEC8w35uxmGoggxtQTPvfUu";
const FAKE_WIF = "L5oLkpVrhAQXJCKGtUUJbGHsVN4zsr4qB2ddmFVfGj3yz2mEqUvY";
const FAKE_BECH32 = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const FAKE_BASE58 = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";
const FAKE_HEX = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** Recursively collect every string in a structure, for leak assertions. */
function allStrings(v: unknown, acc: string[] = []): string[] {
    if (typeof v === "string") acc.push(v);
    else if (Array.isArray(v)) v.forEach((x) => allStrings(x, acc));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, acc));
    return acc;
}

describe("scrubString", () => {
    it("redacts a 24-word mnemonic", () => {
        expect(scrubString(`seed is ${FAKE_MNEMONIC} ok`)).not.toContain("legal winner");
    });
    it("redacts xprv, WIF, bech32, base58, and hex", () => {
        for (const leak of [FAKE_XPRV, FAKE_WIF, FAKE_BECH32, FAKE_BASE58, FAKE_HEX]) {
            expect(scrubString(`value=${leak}`)).not.toContain(leak);
        }
    });
    it("redacts the browser keystore key name", () => {
        expect(scrubString("read sidecoin.wallet.v1 from localStorage")).not.toContain("sidecoin.wallet.v1");
    });
    it("redacts the mobile keystore service name", () => {
        expect(scrubString("read app.sidecoin.wallet from keychain")).not.toContain("app.sidecoin.wallet");
    });
    it("leaves benign prose intact", () => {
        expect(scrubString("balance updated")).toBe("balance updated");
    });
});

describe("scrubEvent", () => {
    it("fully redacts a synthetic event carrying key material", () => {
        const event = {
            message: `send failed for ${FAKE_BECH32}`,
            exception: {
                values: [
                    { type: "Error", value: `mnemonic ${FAKE_MNEMONIC}` },
                    { type: "KeyError", value: `xprv ${FAKE_XPRV}` },
                ],
            },
            extra: {
                address: FAKE_BASE58,
                wif: FAKE_WIF,
                note: `hex ${FAKE_HEX}`,
            },
            contexts: {
                wallet: { seed: FAKE_MNEMONIC, network: "betanet" },
            },
            request: {
                url: `https://sidecoin.app/v1/send?to=${FAKE_BECH32}&amount=100`,
                query_string: `to=${FAKE_BECH32}`,
                cookies: "session=abc; token=secret",
                headers: {
                    authorization: "Bearer secret-token",
                    cookie: "session=abc",
                    "content-type": "application/json",
                },
                data: { mnemonic: FAKE_MNEMONIC },
            },
            breadcrumbs: [
                { category: "ui", message: `copy ${FAKE_BECH32} to clipboard` },
                { category: "xhr", data: { to: FAKE_BASE58 } },
            ],
        };

        const out = scrubEvent(event);
        const leaked = allStrings(out).join("\n");

        for (const secret of [FAKE_MNEMONIC, FAKE_XPRV, FAKE_WIF, FAKE_BECH32, FAKE_BASE58, FAKE_HEX, "secret-token", "session=abc"]) {
            expect(leaked).not.toContain(secret);
        }

        // Query string fully stripped.
        expect((out.request as Record<string, unknown>).url).toBe(`https://sidecoin.app/v1/send?${REDACTED}`);
        expect((out.request as Record<string, unknown>).query_string).toBe(REDACTED);
        // Auth headers redacted; content-type preserved.
        const headers = (out.request as Record<string, unknown>).headers as Record<string, unknown>;
        expect(headers.authorization).toBe(REDACTED);
        expect(headers.cookie).toBe(REDACTED);
        expect(headers["content-type"]).toBe("application/json");
        // Request body dropped.
        expect((out.request as Record<string, unknown>).data).toBe(REDACTED);
        // Non-sensitive context preserved.
        expect((out.contexts as Record<string, Record<string, unknown>>).wallet.network).toBe("betanet");
        // Sensitive key NAMES redact their whole value.
        expect((out.contexts as Record<string, Record<string, unknown>>).wallet.seed).toBe(REDACTED);
    });

    it("does not mutate the input event", () => {
        const event = { extra: { address: FAKE_BASE58 } };
        scrubEvent(event);
        expect(event.extra.address).toBe(FAKE_BASE58);
    });
});

describe("scrubBreadcrumb", () => {
    it("redacts address material from a breadcrumb message and data", () => {
        const bc = scrubBreadcrumb({ message: `send to ${FAKE_BECH32}`, data: { addr: FAKE_BASE58, label: "ok" } });
        expect(JSON.stringify(bc)).not.toContain(FAKE_BECH32);
        expect(JSON.stringify(bc)).not.toContain(FAKE_BASE58);
        expect((bc.data as Record<string, unknown>).label).toBe("ok");
    });
});

describe("makeBeforeSend", () => {
    it("returns a hook that redacts and never drops the event", () => {
        const beforeSend = makeBeforeSend();
        const out = beforeSend({ message: `to ${FAKE_BECH32}` });
        expect(out).not.toBeNull();
        expect(JSON.stringify(out)).not.toContain(FAKE_BECH32);
    });
});
