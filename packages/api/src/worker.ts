// packages/api/src/worker.ts
//
// Sidecoin adapter Worker entrypoint. A single Worker (sidecoin-api) serves
// all three routes from wrangler.toml — /v1*, /graphql, /mcp — so this file
// is now just a path dispatcher. Every endpoint resolves to the SAME shared
// core (slot resolver, normalizer, upstream operations) in src/lib/shared.ts,
// guaranteeing identical data from the same SupaQt source of truth.
//
//   /graphql  -> POST GraphQL          (src/routes/graphql.ts)
//   /mcp      -> POST JSON-RPC / MCP    (src/routes/mcp.ts)
//   /v1* etc  -> GET REST + Swagger     (src/routes/v1.ts)

import { CORS, type Env } from "./lib/shared.js";
import { handleV1 } from "./routes/v1.js";
import { handleGraphql } from "./routes/graphql.js";
import { handleMcp } from "./routes/mcp.js";

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

    // Everything else is the original REST surface (/v1 prefix optional).
    return handleV1(req, env);
  },
};
