<!-- infra/glitchtip/HANDOFF-sidecoin-api.md -->

# HANDOFF — `sidecoin-api` team: GlitchTip error tracking for the Worker

The API adapter (the Cloudflare Worker serving `/v1`, `/graphql`, `/mcp`) was
extracted from this monorepo into the `sidecoin-api` repo. **The Worker init
cannot be done from this monorepo** — it is a companion PR in your repo. This
document is the contract.

## Goal

Report Worker errors to the self-hosted GlitchTip server
(`https://glitchtip.apecs.dev`) instead of a third-party SaaS, with the same
privacy scrubbing the apps use. This is a **crypto wallet backend**: payloads
may contain addresses/txids and must be scrubbed before leaving the Worker.

## What this monorepo provides

- The shared, framework-agnostic scrubber at `@sidecoin/observability`
  (`packages/observability`). Pure TS, **no Sentry SDK dependency** — safe to
  import from a Worker (no Node APIs, no DOM).
- Re-exported via `@sidecoin/api-client/observability` if you prefer that path.

If pulling a workspace dep into `sidecoin-api` is awkward, **vendor the
scrubber**: copy `packages/observability/src/index.ts` into your repo verbatim
and keep it in sync. It has zero runtime deps. Copy `src/index.test.ts` with
it (your vitest include `src/**/*.test.ts` picks it up for free); leave
`src/constraints.test.ts` behind — it reads the apps' sources and only runs
in this monorepo.

## What you need to do

1. **SDK:** use the Workers-compatible SDK — `@sentry/cloudflare`, pinned at
   `11.5.0` to match the apps' SDK train (`@sentry/browser` / `@sentry/vue`
   are also `11.5.0`; the registry latest is newer — pin, don't float). Do
   NOT use `@sentry/node` (no Node runtime) or `@sentry/browser` (no DOM) in
   the Worker. The SDK imports `node:async_hooks` (AsyncLocalStorage scope
   isolation), so `wrangler.toml` MUST set
   `compatibility_flags = ["nodejs_compat"]` — without it the Worker fails to
   boot: `No such module "node:async_hooks"` (verified against wrangler/miniflare).

2. **DSN via secret, not Vite.** Workers don't build with Vite. Inject the DSN
   as a `wrangler` secret / var:
   ```bash
   wrangler secret put GLITCHTIP_DSN
   # value (issued 2026-10-23, `api` project in org `sidecoin`):
   # https://f2ee588c-43c3-4b76-a44e-053ad1e3cb57@glitchtip.apecs.dev/2
   ```
   **Empty/unset DSN ⇒ the SDK is a no-op and makes zero network calls**
   (verified: `@sentry/core` only constructs its transport inside
   `if (this._dsn)`; with no transport nothing can be sent).

   Then widen the Worker's `Env` type so `env.GLITCHTIP_DSN` typechecks —
   `pnpm typecheck` is a commit gate in your repo and `src/lib/env.ts` does
   not declare it yet:
   ```ts
   // src/lib/env.ts
   /** GlitchTip DSN for @sentry/cloudflare (empty/unset => SDK no-op). */
   GLITCHTIP_DSN?: string;
   ```

3. **Wrap the exported handler** with `@sentry/cloudflare`'s `withSentry`, and
   attach the shared scrubber:
   ```ts
   import * as Sentry from "@sentry/cloudflare";
   import { makeBeforeSend, makeBeforeBreadcrumb } from "@sidecoin/observability";

   export default withSentry(
     (env) => ({
       dsn: env.GLITCHTIP_DSN || "",        // empty => disabled
       // `sendDefaultPii` was REMOVED in Sentry SDK v11 (the apps' inits
       // already document this) — do not set it; it is a typecheck error
       // under withSentry's StrictCloudflareOptions. The v11 replacement is
       // `dataCollection`, and its shipped defaults collect EVERYTHING
       // (userInfo, cookies, HTTP bodies, query params), so this deny-list
       // is required, not optional:
       dataCollection: {
         userInfo: false,
         cookies: false,
         httpHeaders: false,
         httpBodies: [],                   // empty array disables body capture
         urlQueryParams: false,
       },
       tracesSampleRate: 0.1,               // low for api
       beforeSend,                          // shared scrubber + local header ext (step 4)
       beforeBreadcrumb: makeBeforeBreadcrumb(),
     }),
     handler,
   );
   ```

4. **Hard constraints (same as the apps):**
   - No default PII — the `dataCollection` deny-list above (v11 has no
     `sendDefaultPii`).
   - **Do not attach request bodies** — `httpBodies: []` stops SDK capture and
     the scrubber drops `request.data` as the second line of defense.
   - The scrubber redacts Authorization headers, cookies, and query-string
     values. One Worker route carries a credential-adjacent header the shared
     scrubber does NOT cover: the inbound NOWPayments IPN signature header
     `x-nowpayments-sig` on `/v1/webhook/nowpayments` (src/routes/payments.ts).
     Do NOT fork the vendored scrubber — wrap it locally in `worker.ts`:
     ```ts
     const sharedBeforeSend = makeBeforeSend();

     function beforeSend(event) {
       const out = sharedBeforeSend(event);
       const headers = out?.request?.headers;
       if (Array.isArray(headers)) {
         // [name, value] tuple form
         out.request.headers = headers.map((e) =>
           Array.isArray(e) && String(e[0]).toLowerCase() === "x-nowpayments-sig"
             ? [e[0], "[REDACTED]"] : e);
       } else if (headers && typeof headers === "object") {
         for (const k of Object.keys(headers)) {
           if (k.toLowerCase() === "x-nowpayments-sig") headers[k] = "[REDACTED]";
         }
       }
       return out;
     }
     ```

5. **Acceptance:** throw a deliberate test error in a route, hit it, and confirm
   it appears in the `api` project in GlitchTip with no auth headers / query
   values / body present. Also fire a request at `/v1/webhook/nowpayments`
   and assert `x-nowpayments-sig` arrives as `[REDACTED]`, and assert any
   query string shows `[REDACTED]` (address-bearing routes are the highest-
   risk leak vector).

## Notes

- The apps' v11 inits (`apps/web`, `apps/wallet`) omit `dataCollection` on a
  code-comment assumption that "v11 defaults to NOT sending PII". The shipped
  v11 defaults are all-true (`@sentry/core`
  `utils/data-collection/resolveDataCollectionOptions.js`); the apps likely
  never trip those collection paths (no HTTP-server integration in-wallet),
  but the Worker serves raw HTTP, so the deny-list in step 3 is mandatory
  here.
- The GlitchTip server + tunnel live in `infra/glitchtip/` in this monorepo.
- Licensing: self-hosted GlitchTip is MIT code, but confirm the commercial
  self-hosted tier before production (see `infra/glitchtip/README.md`).
