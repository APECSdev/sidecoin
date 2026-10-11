/**
 * @sidecoin/observability
 *
 * Shared, framework-agnostic error-tracking scrubber for the Sidecoin monorepo.
 *
 * Exports pure, dependency-free redaction helpers used to build a Sentry-
 * compatible `beforeSend` / `beforeBreadcrumb` hook for GlitchTip (self-hosted).
 * This module imports NO Sentry SDK — it only shapes plain event objects, so it
 * can be consumed by the browser wallet, the Astro web app, the Cloudflare
 * Worker, and React Native alike. Each app wires the hook into its own SDK.
 *
 * SECURITY (crypto wallet — hard constraints):
 *   - Redacts BIP-39-style mnemonics, xpub/xprv, WIF keys, and hex/bech32
 *     addresses anywhere they appear in an event (message, exception values,
 *     extra, contexts, request data, breadcrumbs).
 *   - Redacts the browser keystore key "sidecoin.wallet.v1" and the mobile
 *     keystore service "app.sidecoin.wallet".
 *   - Strips Authorization headers, cookies, and query-string values.
 *   - Never captures clipboard contents.
 *
 * This is the LAST line of defense before an event leaves the device. It must
 * be conservative: when in doubt, redact.
 */

export const REDACTED = "[REDACTED]";

/** localStorage key holding the browser wallet's PLAINTEXT mnemonic. */
export const BROWSER_KEYSTORE_KEY = "sidecoin.wallet.v1";
/** react-native-keychain service holding the mobile wallet's encrypted key. */
export const MOBILE_KEYSTORE_SERVICE = "app.sidecoin.wallet";

const SENSITIVE_KEY_NAMES = new Set([
    BROWSER_KEYSTORE_KEY,
    MOBILE_KEYSTORE_SERVICE,
    "mnemonic",
    "seed",
    "seedphrase",
    "seed_phrase",
    "recoveryphrase",
    "privatekey",
    "private_key",
    "privkey",
    "xprv",
    "xpub",
    "wif",
    "secret",
    "clipboard",
]);

/**
 * 12+ consecutive lowercase alpha words — a BIP-39-style mnemonic.
 * Matches 12, 15, 18, 21, or 24 words. Intentionally broad: false positives
 * (redacting prose) are acceptable; false negatives (leaking a seed) are not.
 */
const MNEMONIC_RE = /\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/g;

/** Extended public/private keys: xpub/xprv/ypub/yprv/zpub/zprv/tpub/tprv (+111 base58 chars). */
const XPUB_RE = /\b(?:x|y|z|t)(?:pub|prv)[1-9A-HJ-NP-Za-km-z]{100,112}\b/g;

/** WIF private keys: mainnet 5/K/L, testnet c — 51-52 base58 chars. */
const WIF_RE = /\b[5KLc][1-9A-HJ-NP-Za-km-z]{50,51}\b/g;

/** bech32 / bech32m addresses: bc1…, tb1…, ltc1…, etc. (20+ chars of the bech32 charset). */
const BECH32_RE = /\b(?:bc|tb|bcrt|ltc|tltc)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{20,90}\b/gi;

/** Legacy/base58 addresses: 1…, 3… (Bitcoin-style), 26-35 base58 chars. */
const BASE58_ADDR_RE = /\b[13][1-9A-HJ-NP-Za-km-z]{25,34}\b/g;

/** Long raw hex (32+ bytes) — private keys, hashes, txids, chain codes. */
const HEX_RE = /\b[0-9a-fA-F]{64,}\b/g;

const PATTERNS: RegExp[] = [
    MNEMONIC_RE,
    XPUB_RE,
    WIF_RE,
    BECH32_RE,
    BASE58_ADDR_RE,
    HEX_RE,
];

/**
 * Redact sensitive substrings from a single string. Keystore key names are
 * replaced wherever they appear; key/address material is pattern-matched.
 */
export function scrubString(input: string): string {
    let out = input;
    if (out.includes(BROWSER_KEYSTORE_KEY)) out = out.split(BROWSER_KEYSTORE_KEY).join(REDACTED);
    if (out.includes(MOBILE_KEYSTORE_SERVICE)) out = out.split(MOBILE_KEYSTORE_SERVICE).join(REDACTED);
    for (const re of PATTERNS) {
        re.lastIndex = 0;
        out = out.replace(re, REDACTED);
    }
    return out;
}

/** True when a record key name denotes a sensitive field (case-insensitive). */
function isSensitiveKey(key: string): boolean {
    const k = key.toLowerCase().replace(/[\s-]/g, "");
    return SENSITIVE_KEY_NAMES.has(k) || k.includes("mnemonic") || k.includes("seed") || k.includes("privkey") || k.includes("secret");
}

/**
 * Recursively redact a value in place-safe fashion (returns a new structure).
 * Handles strings, arrays, and plain objects. Sensitive key NAMES cause their
 * entire value to be redacted; all string values are pattern-scrubbed.
 */
export function scrubValue(value: unknown): unknown {
    if (typeof value === "string") return scrubString(value);
    if (Array.isArray(value)) return value.map(scrubValue);
    if (value !== null && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = isSensitiveKey(k) ? REDACTED : scrubValue(v);
        }
        return out;
    }
    return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentry event-shaped helpers (plain objects — no SDK import)
// ─────────────────────────────────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"]);

/** Strip credentials from request headers (returns a new headers object). */
function scrubHeaders(headers: unknown): unknown {
    if (headers === null || typeof headers !== "object") return headers;
    if (Array.isArray(headers)) {
        // Sentry may represent headers as [name, value] tuples.
        return (headers as unknown[]).map((entry) =>
            Array.isArray(entry) && entry.length === 2 && SENSITIVE_HEADERS.has(String(entry[0]).toLowerCase())
                ? [entry[0], REDACTED]
                : scrubValue(entry),
        );
    }
    const out: AnyRecord = {};
    for (const [k, v] of Object.entries(headers as AnyRecord)) {
        out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? REDACTED : scrubValue(v);
    }
    return out;
}

/** Remove the query string entirely — query values may carry addresses/keys. */
function scrubUrl(url: unknown): unknown {
    if (typeof url !== "string") return url;
    const q = url.indexOf("?");
    const base = q === -1 ? url : url.slice(0, q);
    return q === -1 ? scrubString(base) : `${scrubString(base)}?${REDACTED}`;
}

/** Deep-redact a Sentry breadcrumb (message, data, category). */
export function scrubBreadcrumb<T extends object>(breadcrumb: T): T {
    const out = scrubValue(breadcrumb) as T;
    if (typeof (out as AnyRecord).message === "string") {
        (out as AnyRecord).message = scrubString((out as AnyRecord).message as string);
    }
    return out;
}

/**
 * Deep-redact a full Sentry event before it is sent. Covers message,
 * exception values, extra, contexts, request (url/headers/cookies/data/query),
 * and breadcrumbs. Returns a NEW event object; the input is not mutated.
 */
export function scrubEvent<T extends object>(event: T): T {
    const out: AnyRecord = { ...(event as AnyRecord) };

    if (typeof out.message === "string") out.message = scrubString(out.message);

    // exception.values[].value / .type
    const exc = out.exception as AnyRecord | undefined;
    if (exc && Array.isArray(exc.values)) {
        out.exception = {
            ...exc,
            values: (exc.values as AnyRecord[]).map((v) => ({
                ...v,
                value: typeof v.value === "string" ? scrubString(v.value) : scrubValue(v.value),
                type: typeof v.type === "string" ? scrubString(v.type) : v.type,
            })),
        };
    }

    if (out.extra) out.extra = scrubValue(out.extra);
    if (out.contexts) out.contexts = scrubValue(out.contexts);
    if (out.tags) out.tags = scrubValue(out.tags);

    // request: strip query, cookies, auth headers, and any captured body.
    const req = out.request as AnyRecord | undefined;
    if (req) {
        const r: AnyRecord = { ...req };
        if (r.url) r.url = scrubUrl(r.url);
        if (r.query_string) r.query_string = REDACTED;
        if (r.cookies) r.cookies = REDACTED;
        if (r.headers) r.headers = scrubHeaders(r.headers);
        // Do not attach request bodies for wallet/api — drop entirely.
        if (r.data) r.data = REDACTED;
        out.request = r;
    }

    // breadcrumbs
    const bc = out.breadcrumbs as AnyRecord | undefined;
    const list = Array.isArray(bc) ? bc : Array.isArray(bc?.values) ? (bc.values as AnyRecord[]) : null;
    if (list) {
        const scrubbed = list.map((b) => scrubBreadcrumb(b));
        out.breadcrumbs = Array.isArray(bc) ? scrubbed : { ...bc, values: scrubbed };
    }

    return out as T;
}

/**
 * Build a Sentry-compatible `beforeSend` hook. `sendDefaultPii` must be false
 * and Session Replay disabled at the SDK level; this hook is the payload
 * redaction layer. Returns the scrubbed event (never null — we drop nothing
 * here, we only redact).
 */
export function makeBeforeSend() {
    return <T extends object>(event: T): T => scrubEvent(event);
}

/** Build a Sentry-compatible `beforeBreadcrumb` hook. */
export function makeBeforeBreadcrumb() {
    return <T extends object>(breadcrumb: T): T => scrubBreadcrumb(breadcrumb);
}
