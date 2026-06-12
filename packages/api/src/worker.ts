// packages/api/src/worker.ts
//
// Sidecoin adapter Worker entrypoint. A single Worker (sidecoin-api) serves
// all routes from wrangler.toml — /v1*, /graphql, /mcp — so this file is just
// a path dispatcher. The upstream read endpoints resolve to the SAME shared
// core (slot resolver, normalizer, upstream operations) in src/lib/shared.ts,
// guaranteeing identical data from the same SupaQt source of truth. The
// monetization surface (payments + founders) is D1-backed and dispatched here
// BEFORE handleV1 so those paths never fall through to the upstream adapter.
//
//   /graphql               -> POST GraphQL          (src/routes/graphql.ts)
//   /mcp                   -> POST JSON-RPC / MCP    (src/routes/mcp.ts)
//   /v1/pay/*              -> POST/GET payments      (src/routes/payments.ts)
//   /v1/webhook/nowpayments-> POST NOWPayments IPN   (src/routes/payments.ts)
//   /v1/founders*          -> GET founders/leaderbd  (src/routes/founders.ts)
//   /v1* etc               -> GET REST + Swagger     (src/routes/v1.ts)

import { CORS } from "./lib/shared.js";
import type { Env } from "./lib/env.js";
import { handleV1 } from "./routes/v1.js";
import { handleGraphql } from "./routes/graphql.js";
import { handleMcp } from "./routes/mcp.js";
import { handlePayments } from "./routes/payments.js";
import { handleFounders } from "./routes/founders.js";

export type { Env };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // CORS preflight is handled uniformly for every route.
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(req.url);

    if (url.pathname === "/graphql") {
      return handleGraphql(req, env);
    }
    if (url.pathname === "/mcp") {
      return handleMcp(req, env);
    }

    // Monetization (D1-backed). Dispatched BEFORE the upstream REST adapter so
    // these paths never fall through to handleV1.
    if (
      url.pathname === "/v1/pay/create" ||
      url.pathname === "/v1/pay/status" ||
      url.pathname === "/v1/pay/currencies" ||
      url.pathname === "/v1/webhook/nowpayments"
    ) {
      return handlePayments(req, env, url);
    }
    if (
      url.pathname === "/v1/founders" ||
      url.pathname.startsWith("/v1/founders/")
    ) {
      return handleFounders(req, env, url);
    }

    // Everything else is the original REST surface (/v1 prefix optional).
    return handleV1(req, env);
  },
};
