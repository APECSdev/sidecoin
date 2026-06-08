// packages/api/src/routes/v1.ts
//
// Sidecoin REST adapter (the original /v1 surface). Exposes a STABLE,
// slot-addressed, camelCase surface to the wallet client and translates to
// SupaQt's chainId-addressed, snake_case, bare-string-error read API.
//
// Public routes (all GET; /v1 prefix optional):
//   /v1                                 (Swagger UI)
//   /v1/openapi.json                    (OpenAPI 3.1 document)
//   /v1/health
//   /v1/sidechains
//   /v1/wallet/:slot/deposits           ?address &status &limit &cursor
//   /v1/wallet/:slot/deposits/:l1Txid/:vout
//   /v1/wallet/:slot/balance            ?address   (DERIVED — see note)
//
// Error envelope (normalized): { error: { code, message, details? } }

import type { Env } from "../lib/shared.js";
import {
  CORS,
  MAX_PAGE,
  json,
  err,
  resolveSlot,
  listSidechains,
  healthInfo,
  opListDeposits,
  opGetDeposit,
  opDeriveBalance,
} from "../lib/shared.js";
import { UpstreamClient } from "../upstream.js";

// Pinned swagger-ui-dist bundle served from jsDelivr; keeps the Worker
// dependency-free while still serving the canonical (default) Swagger UI.
const SWAGGER_UI_VERSION = "5.17.14";

// OpenAPI 3.1 document describing this adapter's stable surface. Served at
// /v1/openapi.json and consumed by the Swagger UI page below.
const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Sidecoin API",
    version: "0.1.0",
    description:
      "Stable, slot-addressed read API for the Sidecoin wallet. Adapts " +
      "SupaQt's chainId-addressed upstream read API into a camelCase, " +
      "normalized-error surface.",
  },
  servers: [{ url: "https://sidecoin.app", description: "Production" }],
  paths: {
    "/v1/health": {
      get: {
        summary: "Health check",
        responses: {
          "200": {
            description: "Service is healthy.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Health" },
              },
            },
          },
        },
      },
    },
    "/v1/sidechains": {
      get: {
        summary: "List active sidechains",
        description: "Active drivechains from the Sidecoin registry.",
        responses: {
          "200": {
            description: "The active sidechain descriptors.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sidechains: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Sidechain" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/wallet/{slot}/deposits": {
      get: {
        summary: "List deposits for a slot",
        parameters: [
          { $ref: "#/components/parameters/Slot" },
          {
            name: "address",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 200 },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "A page of deposits.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    slot: { type: "integer" },
                    chainId: { type: "string" },
                    provisioned: { type: "boolean" },
                    deposits: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Deposit" },
                    },
                    nextCursor: { type: ["string", "null"] },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "502": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/v1/wallet/{slot}/deposits/{l1Txid}/{vout}": {
      get: {
        summary: "Get a single deposit",
        parameters: [
          { $ref: "#/components/parameters/Slot" },
          {
            name: "l1Txid",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^[0-9a-fA-F]+$" },
          },
          {
            name: "vout",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 0 },
          },
        ],
        responses: {
          "200": {
            description: "The deposit.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Deposit" },
              },
            },
          },
          "400": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "502": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/v1/wallet/{slot}/balance": {
      get: {
        summary: "Derived balance for an address",
        description:
          "Sum of credited deposit inflow for an address. NOT spendable L2 " +
          "balance — SupaQt exposes no balance route today.",
        parameters: [
          { $ref: "#/components/parameters/Slot" },
          {
            name: "address",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "The derived balance.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Balance" },
              },
            },
          },
          "400": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "502": { $ref: "#/components/responses/Error" },
        },
      },
    },
  },
  components: {
    parameters: {
      Slot: {
        name: "slot",
        in: "path",
        required: true,
        description: "Active sidechain slot number.",
        schema: { type: "integer", minimum: 0 },
      },
    },
    responses: {
      Error: {
        description: "Normalized error envelope.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
    schemas: {
      Health: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          service: { type: "string", example: "sidecoin-api" },
          time: { type: "string", format: "date-time" },
        },
        required: ["status", "service"],
      },
      Sidechain: {
        type: "object",
        properties: {
          slot: { type: "integer" },
          id: { type: "string" },
          displayName: { type: "string" },
          description: { type: "string" },
          status: { type: "string" },
        },
      },
      Deposit: {
        type: "object",
        properties: {
          slot: { type: "integer" },
          chainId: { type: "string" },
          l1Txid: { type: "string" },
          vout: { type: "integer" },
          ctipSeq: { type: "integer" },
          address: { type: "string" },
          valueSats: {
            type: "string",
            description: "bigint value in sats, as a decimal string.",
          },
          status: { type: "string" },
          confirmations: {
            type: ["integer", "null"],
            description: "null when upstream confirmations are unknown.",
          },
          firstSeenTs: { type: ["integer", "null"] },
          l1ConfirmedTs: { type: ["integer", "null"] },
          l2CreditedTs: { type: ["integer", "null"] },
        },
      },
      Balance: {
        type: "object",
        properties: {
          slot: { type: "integer" },
          chainId: { type: "string" },
          address: { type: "string" },
          provisioned: { type: "boolean" },
          totalSats: { type: "string" },
          depositCount: { type: "integer" },
          truncated: { type: "boolean" },
          note: { type: "string" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {},
            },
            required: ["code", "message"],
          },
        },
      },
    },
  },
};

// Self-contained default Swagger UI page; loads the spec from
// /v1/openapi.json so the document and the UI stay in sync.
const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sidecoin API — Swagger UI</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css"
    />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script
      src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"
      crossorigin
    ></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: "/v1/openapi.json",
          dom_id: "#swagger-ui",
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis],
        });
      };
    </script>
  </body>
</html>`;

export async function handleV1(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET") {
    return err("method_not_allowed", "GET only", 405);
  }

  const url = new URL(req.url);

  // GET /v1 (bare) -> default Swagger UI page.
  if (url.pathname === "/v1" || url.pathname === "/v1/") {
    return new Response(SWAGGER_UI_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", ...CORS },
    });
  }

  // GET /v1/openapi.json -> the OpenAPI document consumed by Swagger UI.
  if (url.pathname === "/v1/openapi.json") {
    return json(OPENAPI_SPEC);
  }

  const path = url.pathname.replace(/^\/v1(?=\/|$)/, "");
  const parts = path.split("/").filter(Boolean);
  const client = new UpstreamClient({ baseUrl: env.SUPAQT_BASE_URL });

  // GET /health
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "health")) {
    return json(healthInfo());
  }

  // GET /sidechains — from OUR registry (active drivechains only).
  if (parts.length === 1 && parts[0] === "sidechains") {
    return json({ sidechains: listSidechains() });
  }

  // /wallet/:slot/...
  if (parts[0] === "wallet" && parts.length >= 3) {
    const resolved = resolveSlot(parts[1]);
    if (!resolved.ok) {
      return err(resolved.code, resolved.message, resolved.status);
    }
    const { slot, chainId } = resolved;

    // GET /wallet/:slot/deposits
    if (parts.length === 3 && parts[2] === "deposits") {
      const q = url.searchParams;
      const limitRaw = q.get("limit");
      let limit: number | undefined;
      if (limitRaw != null) {
        const n = Number(limitRaw);
        if (!Number.isInteger(n) || n < 1) {
          return err("bad_limit", `invalid limit "${limitRaw}"`, 400);
        }
        limit = Math.min(n, MAX_PAGE);
      }

      const out = await opListDeposits(client, slot, chainId, {
        address: q.get("address") ?? undefined,
        status: q.get("status") ?? undefined,
        limit,
        cursor: q.get("cursor") ?? undefined,
      });

      if (out.kind === "not_provisioned") {
        // Chain known but its deposits table isn't live yet (the 6
        // unproven DBs). Surface as an empty, well-formed page.
        return json({
          slot,
          chainId,
          provisioned: false,
          deposits: [],
          nextCursor: null,
        });
      }
      if (out.kind === "unknown_chain") {
        return err(
          "unknown_chain",
          `upstream has no chain "${chainId}"`,
          404,
        );
      }
      if (out.kind === "error") {
        return err("upstream_error", out.message, 502);
      }

      return json({
        slot,
        chainId,
        provisioned: true,
        deposits: out.deposits,
        nextCursor: out.nextCursor,
      });
    }

    // GET /wallet/:slot/deposits/:l1Txid/:vout
    if (
      parts.length === 5 &&
      parts[2] === "deposits"
    ) {
      const l1Txid = parts[3];
      const voutRaw = parts[4];
      if (!/^[0-9a-fA-F]+$/.test(l1Txid)) {
        return err("bad_txid", `invalid l1Txid "${l1Txid}"`, 400);
      }
      if (!/^\d+$/.test(voutRaw)) {
        return err("bad_vout", `invalid vout "${voutRaw}"`, 400);
      }
      const vout = Number(voutRaw);

      const out = await opGetDeposit(client, slot, chainId, l1Txid, vout);
      if (out.kind === "ok") {
        return json(out.deposit);
      }
      // not_found AND not_provisioned both mean "no such deposit here".
      if (out.kind === "not_found") {
        return err(
          "deposit_not_found",
          `no deposit ${l1Txid}:${vout} on ${chainId}`,
          404,
        );
      }
      return err("upstream_error", out.message, 502);
    }

    // GET /wallet/:slot/balance  (DERIVED: sum of credited deposit inflow)
    if (parts.length === 3 && parts[2] === "balance") {
      const address = url.searchParams.get("address");
      if (!address) {
        return err("missing_address", "address query param required", 400);
      }

      const out = await opDeriveBalance(client, chainId, address);
      if (out.kind === "unknown_chain") {
        return err(
          "unknown_chain",
          `upstream has no chain "${chainId}"`,
          404,
        );
      }
      if (out.kind === "error") {
        return err("upstream_error", out.message, 502);
      }

      return json({
        slot,
        chainId,
        address,
        provisioned: out.provisioned,
        totalSats: out.totalSats,
        depositCount: out.depositCount,
        truncated: out.truncated,
        // CAVEAT: derived from deposit inflow (sum of credited peg-ins),
        // NOT spendable L2 balance. SupaQt exposes no balance route today.
        note: "derived from deposit inflow; not spendable balance",
      });
    }
  }

  return err("not_found", `no route for ${url.pathname}`, 404);
}
