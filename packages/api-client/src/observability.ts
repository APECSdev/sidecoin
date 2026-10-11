// packages/api-client/src/observability.ts

/**
 * Re-export the shared observability scrubber so the API surface (and any
 * consumer of the typed client) uses the exact same redaction as the apps.
 *
 * The actual Cloudflare Worker init lives in the `sidecoin-api` repo (the
 * adapter was extracted) — see `infra/glitchtip/HANDOFF-sidecoin-api.md`. This
 * package only re-exports the scrubber; it does not init an SDK here.
 */

export {
    REDACTED,
    BROWSER_KEYSTORE_KEY,
    MOBILE_KEYSTORE_SERVICE,
    scrubString,
    scrubValue,
    scrubEvent,
    scrubBreadcrumb,
    makeBeforeSend,
    makeBeforeBreadcrumb,
} from "@sidecoin/observability";
