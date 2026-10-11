<!-- infra/glitchtip/HANDOFF-sidecoin-api.md -->

# HANDOFF — `sidecoin-api` team: GlitchTip error tracking for the Worker

The API adapter (the Cloudflare Worker serving `/v1`, `/graphql`, `/mcp`) was
extracted from this monorepo into the `sidecoin-api` repo. **The Worker init
cannot be done from this monorepo** — it is a companion PR in your repo. This
document is the contract.

## Goal

Report Worker errors to the self-hosted GlitchTip server
(`https://glitchtip.sidecoin.app`) instead of a third-party SaaS, with the same
privacy scrubbing the apps use. This is a **crypto wallet backend**: payloads
may contain addresses/txids and must be scrubbed before leaving the Worker.

## What this monorepo provides

- The shared, framework-agnostic scrubber at `@sidecoin/observability`
  (`packages/observability`). Pure TS, **no Sentry SDK dependency** — safe to
  import from a Worker (no Node APIs, no DOM).
- Re-exported via `@sidecoin/api-client/observability` if you prefer that path.

If pulling a workspace dep into `sidecoin-api` is awkward, **vendor the
scrubber**: copy `packages/observability/src/index.ts` into your repo verbatim
and keep it in sync. It has zero runtime deps.

## What you need to do

1. **SDK:** use the Workers-compatible SDK — `@sentry/cloudflare` (verified
   current at `11.5.0`). Do NOT use `@sentry/node` (no Node runtime) or
   `@sentry/browser` (no DOM) in the Worker.

2. **DSN via secret, not Vite.** Workers don't build with Vite. Inject the DSN
   as a `wrangler` secret / var:
   ```bash
   wrangler secret put GLITCHTIP_DSN
   ```
   **Empty/unset DSN ⇒ the SDK is a no-op and makes zero network calls.**

3. **Wrap the exported handler** with `@sentry/cloudflare`'s `withSentry`, and
   attach the shared scrubber:
   ```ts
   import * as Sentry from "@sentry/cloudflare";
   import { makeBeforeSend, makeBeforeBreadcrumb } from "@sidecoin/observability";

   export default withSentry(
     (env) => ({
       dsn: env.GLITCHTIP_DSN || "",        // empty => disabled
       sendDefaultPii: false,
       tracesSampleRate: 0.1,               // low for api
       beforeSend: makeBeforeSend(),
       beforeBreadcrumb: makeBeforeBreadcrumb(),
     }),
     handler,
   );
   ```

4. **Hard constraints (same as the apps):**
   - `sendDefaultPii = false`.
   - **Do not attach request bodies** — the scrubber drops `request.data`.
   - The scrubber redacts Authorization headers, cookies, and query-string
     values; extend it if your routes carry secrets elsewhere.

5. **Acceptance:** throw a deliberate test error in a route, hit it, and confirm
   it appears in the `api` project in GlitchTip with no auth headers / query
   values / body present.

## Notes

- The GlitchTip server + tunnel live in `infra/glitchtip/` in this monorepo.
- Licensing: self-hosted GlitchTip is MIT code, but confirm the commercial
  self-hosted tier before production (see `infra/glitchtip/README.md`).
