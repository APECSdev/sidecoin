// packages/api/src/routes/v1.ts
//
// Sidecoin REST adapter (the original /v1 surface). Exposes a STABLE,
// slot-addressed, camelCase surface to the wallet client and translates to
// SupaQt's chainId-addressed, snake_case, bare-string-error API.
//
// Public routes (GET unless noted; /v1 prefix optional):
//   /v1                                       (Swagger UI)
//   /v1/openapi.json                          (OpenAPI 3.1 document)
//   /v1/health
//   /v1/sidechains
//   /v1/wallet/:slot/deposits                 ?address &status &limit &cursor
//   /v1/wallet/:slot/deposits/:l1Txid/:vout
//   /v1/wallet/:slot/balance                  ?address  (indexed; derived fallback)
//   /v1/chains/:chainId/address/:address/balance        (indexed; ANY chain incl. L1)
//   /v1/chains/:chainId/address/:address/utxos          (spendable set; ANY chain incl. L1)
//   /v1/chains/:chainId/broadcast             (POST — relay a signed tx)
//
// NOTE: both broadcast AND the chainId balance route are chainId-addressed
// (NOT slot-addressed) because L1/signet has no sidechain slot. The
// slot-addressed /wallet/:slot/balance route remains for sidechains; the
// chainId route is the only way to read an L1/signet balance.
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
  makeUpstream,
  opListDeposits,
  opGetDeposit,
  opGetBalance,
  opDeriveBalance,
  opListUtxos,
  opBroadcast,
} from "../lib/shared.js";

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
        summary: "Balance for an address (slot-addressed; sidechains)",
        description:
          "Authoritative indexed balance from upstream when available " +
          "(source=indexed). Falls back to a sum of credited deposit inflow " +
          "(source=derived) only when the chain's balance index is not " +
          "provisioned; the derived value is NOT a spendable balance. For " +
          "L1/signet (no slot), use the chainId-addressed balance route.",
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
            description: "The balance.",
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
    "/v1/chains/{chainId}/address/{address}/balance": {
      get: {
        summary: "Indexed balance for an address (chainId-addressed; any chain)",
        description:
          "Authoritative indexed balance for ANY chain, including L1/signet " +
          "(which has no sidechain slot). An unknown address is not an error " +
          "— it returns totalSats \"0\" with seen=false.",
        parameters: [
          { $ref: "#/components/parameters/ChainId" },
          { $ref: "#/components/parameters/Address" },
        ],
        responses: {
          "200": {
            description: "The indexed balance.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChainBalance" },
              },
            },
          },
          "400": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "502": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/v1/chains/{chainId}/address/{address}/utxos": {
      get: {
        summary:
          "Spendable UTXO set for an address (chainId-addressed; any chain)",
        description:
          "The spendable UTXO set for an address on ANY chain, including " +
          "L1/signet (which has no sidechain slot). Fully paginated upstream " +
          "so the wallet receives the COMPLETE set for coin selection. Each " +
          "UTXO reports the coinbase flag, confirmations, and blockHeight; " +
          "coinbase maturity is NOT pre-filtered — the per-UTXO isCoinbase " +
          "flag is the surgical guard the wallet applies in coin selection. " +
          "Outputs with an indescribable script are omitted upstream, so " +
          "every scriptPubKey is present. An unknown address is not an error " +
          "— it returns an empty utxos array.",
        parameters: [
          { $ref: "#/components/parameters/ChainId" },
          { $ref: "#/components/parameters/Address" },
          {
            name: "min_confirmations",
            in: "query",
            required: false,
            description:
              "Global confirmations floor applied to ALL outputs (upstream " +
              "default 1). NOT a coinbase-maturity filter.",
            schema: { type: "integer", minimum: 0 },
          },
        ],
        responses: {
          "200": {
            description: "The spendable UTXO set.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    chainId: { type: "string" },
                    address: { type: "string" },
                    utxos: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Utxo" },
                    },
                    truncated: {
                      type: "boolean",
                      description:
                        "true if the upstream page cap was hit before the " +
                        "full set was retrieved.",
                    },
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
    "/v1/chains/{chainId}/broadcast": {
      post: {
        summary: "Broadcast a signed transaction",
        description:
          "Relay a fully-signed raw transaction to a chain's node. The " +
          "adapter forwards the tx and returns the resulting txid; it never " +
          "signs. Broadcast is signet/L1 ONLY today — L2 chainIds return 501 " +
          "for now (dedicated sidechain endpoints are planned). " +
          "Re-broadcasting an already-known tx is idempotent (200, " +
          "accepted:true, same txid). On 422 do NOT retry the same bytes; " +
          "on 429 honor Retry-After; on 502/503 retry with backoff.",
        parameters: [{ $ref: "#/components/parameters/ChainId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  txHex: {
                    type: "string",
                    description: "Fully-signed raw transaction, hex-encoded.",
                  },
                },
                required: ["txHex"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The broadcast receipt.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BroadcastReceipt" },
              },
            },
          },
          "400": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "422": { $ref: "#/components/responses/Error" },
          "429": { $ref: "#/components/responses/Error" },
          "501": { $ref: "#/components/responses/Error" },
          "502": { $ref: "#/components/responses/Error" },
          "503": { $ref: "#/components/responses/Error" },
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
      ChainId: {
        name: "chainId",
        in: "path",
        required: true,
        description:
          "Upstream chain id (e.g. signet). Broadcast is signet/L1 only today.",
        schema: { type: "string", pattern: "^[a-z0-9_-]+$" },
      },
      Address: {
        name: "address",
        in: "path",
        required: true,
        description: "On-chain address (bech32 / base58).",
        schema: { type: "string", pattern: "^[a-zA-Z0-9]+$" },
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
          source: {
            type: "string",
            enum: ["indexed", "derived"],
            description: "indexed = authoritative upstream; derived = fallback.",
          },
          provisioned: { type: "boolean" },
          totalSats: { type: "string" },
          depositCount: { type: "integer" },
          truncated: { type: "boolean" },
          seen: {
            type: "boolean",
            description: "false when the address was never observed upstream.",
          },
          updatedAtHeight: {
            type: ["integer", "null"],
            description: "indexed height; null when derived or never seen.",
          },
          note: { type: "string" },
        },
      },
      ChainBalance: {
        type: "object",
        properties: {
          chainId: { type: "string" },
          address: { type: "string" },
          source: { type: "string", enum: ["indexed"] },
          totalSats: {
            type: "string",
            description: "bigint balance in sats, as a decimal string.",
          },
          seen: {
            type: "boolean",
            description: "false when the address was never observed upstream.",
          },
          updatedAtHeight: {
            type: ["integer", "null"],
            description: "indexed height; null when never seen.",
          },
          note: { type: "string" },
        },
      },
      Utxo: {
        type: "object",
        properties: {
          chainId: { type: "string" },
          address: { type: "string" },
          txid: { type: "string" },
          vout: { type: "integer" },
          valueSats: {
            type: "string",
            description: "bigint value in sats, as a decimal string.",
          },
          scriptPubKey: {
            type: "string",
            description:
              "Locking script (scriptPubKey) as hex. Always present " +
              "(unsignable outputs are omitted upstream).",
          },
          confirmations: {
            type: "integer",
            description:
              "Computed upstream as tip_height - blockHeight + 1; 0 for a " +
              "mempool output.",
          },
          blockHeight: {
            type: "integer",
            description:
              "Confirming block height; -1 for an unconfirmed (mempool) " +
              "output.",
          },
          isCoinbase: {
            type: "boolean",
            description:
              "true when the funding tx is the block's coinbase. Maturity " +
              "is NOT pre-filtered; the wallet applies the per-UTXO guard.",
          },
        },
      },
      BroadcastReceipt: {
        type: "object",
        properties: {
          chainId: { type: "string" },
          txid: { type: "string" },
          accepted: { type: "boolean" },
          broadcastAt: {
            type: "integer",
            description: "Unix seconds the relay accepted the tx.",
          },
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
  const url = new URL(req.url);

  // Broadcast is the adapter's only POST route; everything else is GET.
  if (req.method === "POST") {
    return handleBroadcast(req, env, url);
  }

  if (req.method !== "GET") {
    return err("method_not_allowed", "GET only", 405);
  }

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
  const client = makeUpstream(env);

  // GET /health
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "health")) {
    return json(healthInfo());
  }

  // GET /sidechains — from OUR registry (active drivechains only).
  if (parts.length === 1 && parts[0] === "sidechains") {
    return json({ sidechains: listSidechains() });
  }

  // GET /chains/:chainId/address/:address/balance
  // Authoritative indexed balance for ANY chain, including L1/signet (which
  // has no sidechain slot and therefore no /wallet/:slot route). This is the
  // ONLY way to read an L1/signet balance. chainId-addressed, mirroring the
  // broadcast route's addressing decision.
  if (
    parts[0] === "chains" &&
    parts.length === 5 &&
    parts[2] === "address" &&
    parts[4] === "balance"
  ) {
    const chainId = parts[1];
    const address = parts[3];
    if (!/^[a-z0-9_-]+$/i.test(chainId)) {
      return err("unknown_chain", `invalid chainId "${chainId}"`, 404);
    }
    if (!/^[a-z0-9]+$/i.test(address)) {
      return err("bad_address", `invalid address "${address}"`, 400);
    }

    const out = await opGetBalance(client, chainId, address);
    if (out.kind === "ok") {
      return json({
        chainId,
        address,
        source: "indexed",
        totalSats: out.balanceSats,
        seen: out.seen,
        // -1 sentinel ("never seen") is normalized to null here.
        updatedAtHeight: out.seen ? out.updatedAtHeight : null,
        note: "indexed balance from upstream (sats)",
      });
    }
    if (out.kind === "unknown_chain") {
      return err("unknown_chain", `upstream has no chain "${chainId}"`, 404);
    }
    if (out.kind === "not_provisioned") {
      // The balance index works on any chain incl. signet; absence here is a
      // real upstream problem, not a "normal" empty state.
      return err(
        "balance_unavailable",
        `balance index not provisioned for "${chainId}"`,
        502,
      );
    }
    return err("upstream_error", out.message, 502);
  }

  // GET /chains/:chainId/address/:address/utxos
  // The spendable UTXO set for an address (chainId-addressed; any chain incl.
  // L1/signet, which has no sidechain slot). Fully paginated upstream so the
  // wallet receives the COMPLETE set for coin selection. Mirrors the chainId
  // balance route's addressing AND its not_provisioned-as-502 treatment: an
  // absent UTXO index is a real upstream problem for a spendable-set query,
  // not a "normal" empty state.
  if (
    parts[0] === "chains" &&
    parts.length === 5 &&
    parts[2] === "address" &&
    parts[4] === "utxos"
  ) {
    const chainId = parts[1];
    const address = parts[3];
    if (!/^[a-z0-9_-]+$/i.test(chainId)) {
      return err("unknown_chain", `invalid chainId "${chainId}"`, 404);
    }
    if (!/^[a-z0-9]+$/i.test(address)) {
      return err("bad_address", `invalid address "${address}"`, 400);
    }

    // Optional global confirmations floor. NOTE: this applies to ALL outputs,
    // not just coinbase — it is NOT a coinbase-maturity filter (the maturity
    // guard is the wallet's surgical per-UTXO check). Upstream defaults to 1
    // when omitted.
    const mcRaw = url.searchParams.get("min_confirmations");
    let minConfirmations: number | undefined;
    if (mcRaw != null) {
      const n = Number(mcRaw);
      if (!Number.isInteger(n) || n < 0) {
        return err(
          "bad_min_confirmations",
          `invalid min_confirmations "${mcRaw}"`,
          400,
        );
      }
      minConfirmations = n;
    }

    const out = await opListUtxos(client, chainId, address, {
      minConfirmations,
    });
    if (out.kind === "ok") {
      return json({
        chainId,
        address,
        utxos: out.utxos,
        truncated: out.truncated,
      });
    }
    if (out.kind === "unknown_chain") {
      return err("unknown_chain", `upstream has no chain "${chainId}"`, 404);
    }
    if (out.kind === "not_provisioned") {
      // The UTXO index is needed to spend; absence here is a real upstream
      // problem, not a "normal" empty state (an unknown address returns an
      // empty set with kind "ok", not not_provisioned).
      return err(
        "utxos_unavailable",
        `utxo index not provisioned for "${chainId}"`,
        502,
      );
    }
    return err("upstream_error", out.message, 502);
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

    // GET /wallet/:slot/balance
    // Prefer the authoritative indexed balance; fall back to deriving from
    // deposit inflow ONLY when the chain's balance index isn't provisioned.
    if (parts.length === 3 && parts[2] === "balance") {
      const address = url.searchParams.get("address");
      if (!address) {
        return err("missing_address", "address query param required", 400);
      }

      const indexed = await opGetBalance(client, chainId, address);
      if (indexed.kind === "ok") {
        return json({
          slot,
          chainId,
          address,
          source: "indexed",
          provisioned: true,
          totalSats: indexed.balanceSats,
          depositCount: 0,
          truncated: false,
          seen: indexed.seen,
          // -1 sentinel ("never seen") is normalized to null here.
          updatedAtHeight: indexed.seen ? indexed.updatedAtHeight : null,
          note: "indexed balance from upstream (sats)",
        });
      }
      if (indexed.kind === "unknown_chain") {
        return err(
          "unknown_chain",
          `upstream has no chain "${chainId}"`,
          404,
        );
      }
      if (indexed.kind === "error") {
        return err("upstream_error", indexed.message, 502);
      }

      // indexed.kind === "not_provisioned" -> derived fallback.
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
        source: "derived",
        provisioned: out.provisioned,
        totalSats: out.totalSats,
        depositCount: out.depositCount,
        truncated: out.truncated,
        seen: out.depositCount > 0,
        updatedAtHeight: null,
        // CAVEAT: derived from deposit inflow (sum of credited peg-ins),
        // NOT spendable balance.
        note: "derived from deposit inflow; not spendable balance",
      });
    }
  }

  return err("not_found", `no route for ${url.pathname}`, 404);
}

/**
 * POST handler. The adapter's only write path: relay a fully-signed raw tx
 * to a chain's node via SupaQt's broadcast route. CHAINID-ADDRESSED (not
 * slot) because broadcast is signet/L1-only today and signet has no
 * sidechain slot. The chainId is passed straight through; L2 chainIds
 * surface upstream's 501 (broadcast_unsupported) for now, and future
 * sidechain broadcast endpoints will work here unchanged.
 */
async function handleBroadcast(
  req: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const path = url.pathname.replace(/^\/v1(?=\/|$)/, "");
  const parts = path.split("/").filter(Boolean);

  // POST /chains/:chainId/broadcast
  if (
    parts[0] === "chains" &&
    parts.length === 3 &&
    parts[2] === "broadcast"
  ) {
    const chainId = parts[1];
    if (!/^[a-z0-9_-]+$/i.test(chainId)) {
      return err("unknown_chain", `invalid chainId "${chainId}"`, 404);
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return err("malformed_tx", "request body must be JSON", 400);
    }

    const txHex =
      payload && typeof payload === "object" && "txHex" in payload
        ? (payload as { txHex?: unknown }).txHex
        : undefined;
    if (
      typeof txHex !== "string" ||
      txHex.length === 0 ||
      txHex.length % 2 !== 0 ||
      !/^[0-9a-fA-F]+$/.test(txHex)
    ) {
      return err(
        "malformed_tx",
        "txHex must be a non-empty even-length hex string",
        400,
      );
    }

    const client = makeUpstream(env);
    const out = await opBroadcast(client, chainId, txHex);

    if (out.kind === "malformed") {
      return err("malformed_tx", out.message, 400);
    }
    if (out.kind === "rejected") {
      // Node refused on the merits; carry the node's reason verbatim. The
      // client must NOT retry the same bytes.
      return err("rejected", out.message, 422);
    }
    if (out.kind === "unknown_chain") {
      return err("unknown_chain", `upstream has no chain "${chainId}"`, 404);
    }
    if (out.kind === "unsupported") {
      // No raw-tx submission for this chain yet (today: all L2 sidechains).
      // Do not retry; use the sidechain's wallet verbs until an endpoint ships.
      return err("broadcast_unsupported", out.message, 501);
    }
    if (out.kind === "rate_limited") {
      // Per-identity broadcast budget exceeded upstream. Propagate Retry-After
      // so the client can back off. NOTE (ops): until the authorized-provider
      // API key is issued, our Worker egresses from shared Cloudflare IPs and
      // this bucket is shared across ALL our users.
      return json(
        {
          error: {
            code: "rate_limited",
            message: `broadcast rate limit exceeded; retry after ${out.retryAfter}s`,
            details: { scope: "broadcast", retryAfter: out.retryAfter },
          },
        },
        429,
        { "retry-after": String(out.retryAfter) },
      );
    }
    if (out.kind === "relay_error") {
      // Relay/node transport problem; safe to retry with backoff.
      return err("relay_error", out.message, 502);
    }
    if (out.kind === "unavailable") {
      // Relay not configured; retry later with backoff.
      return err("broadcast_unavailable", out.message, 503);
    }
    if (out.kind === "error") {
      return err("upstream_error", out.message, 502);
    }

    return json({
      chainId: out.chainId,
      txid: out.txid,
      accepted: out.accepted,
      broadcastAt: out.broadcastAt,
    });
  }

  return err("not_found", `no route for ${url.pathname}`, 404);
}
