// packages/api/src/routes/mcp.ts
//
// MCP endpoint (POST /mcp), implemented as plain JSON-RPC 2.0 over HTTP so it
// runs inside a Cloudflare Worker fetch handler (the MCP TS SDK assumes a
// stdio/long-lived transport that doesn't map onto request/response).
//
// Tools expose the SAME operations as /v1 and /graphql, calling the shared
// slot resolver and upstream operations. Domain failures are returned as MCP
// tool results with isError:true carrying the same `code` strings as REST.

import type { Env } from "../lib/shared.js";
import {
  CORS,
  MAX_PAGE,
  json,
  err,
  resolveSlot,
  listSidechains,
  opListDeposits,
  opGetDeposit,
  opDeriveBalance,
} from "../lib/shared.js";
import { UpstreamClient } from "../upstream.js";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "sidecoin-mcp", version: "0.1.0" };

const TOOLS = [
  {
    name: "list_sidechains",
    description: "List active Sidecoin drivechains.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_deposits",
    description: "List deposits for a sidechain slot (keyset paginated).",
    inputSchema: {
      type: "object",
      properties: {
        slot: { type: "integer", minimum: 0 },
        address: { type: "string" },
        status: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
        cursor: { type: "string" },
      },
      required: ["slot"],
      additionalProperties: false,
    },
  },
  {
    name: "get_deposit",
    description: "Get a single deposit by l1Txid and vout.",
    inputSchema: {
      type: "object",
      properties: {
        slot: { type: "integer", minimum: 0 },
        l1Txid: { type: "string" },
        vout: { type: "integer", minimum: 0 },
      },
      required: ["slot", "l1Txid", "vout"],
      additionalProperties: false,
    },
  },
  {
    name: "get_balance",
    description:
      "Derived deposit-inflow balance for an address. NOT spendable balance.",
    inputSchema: {
      type: "object",
      properties: {
        slot: { type: "integer", minimum: 0 },
        address: { type: "string" },
      },
      required: ["slot", "address"],
      additionalProperties: false,
    },
  },
];

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data != null ? { data } : {}) },
  };
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  client: UpstreamClient,
): Promise<ToolResult> {
  const text = (obj: unknown): ToolResult => ({
    content: [{ type: "text", text: JSON.stringify(obj) }],
  });
  const errText = (code: string, message: string): ToolResult => ({
    content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }],
    isError: true,
  });

  switch (name) {
    case "list_sidechains":
      return text({ sidechains: listSidechains() });

    case "list_deposits": {
      const r = resolveSlot(String(args.slot));
      if (!r.ok) return errText(r.code, r.message);

      let limit: number | undefined;
      if (args.limit != null) {
        const n = Number(args.limit);
        if (!Number.isInteger(n) || n < 1) {
          return errText("bad_limit", `invalid limit "${String(args.limit)}"`);
        }
        limit = Math.min(n, MAX_PAGE);
      }

      const out = await opListDeposits(client, r.slot, r.chainId, {
        address: typeof args.address === "string" ? args.address : undefined,
        status: typeof args.status === "string" ? args.status : undefined,
        limit,
        cursor: typeof args.cursor === "string" ? args.cursor : undefined,
      });

      if (out.kind === "not_provisioned") {
        // Chain known but its deposits table isn't live yet — empty page.
        return text({
          slot: r.slot,
          chainId: r.chainId,
          provisioned: false,
          deposits: [],
          nextCursor: null,
        });
      }
      if (out.kind === "unknown_chain") {
        return errText("unknown_chain", `upstream has no chain "${r.chainId}"`);
      }
      if (out.kind === "error") {
        return errText("upstream_error", out.message);
      }

      return text({
        slot: r.slot,
        chainId: r.chainId,
        provisioned: true,
        deposits: out.deposits,
        nextCursor: out.nextCursor,
      });
    }

    case "get_deposit": {
      const r = resolveSlot(String(args.slot));
      if (!r.ok) return errText(r.code, r.message);

      const l1Txid = typeof args.l1Txid === "string" ? args.l1Txid : "";
      if (!/^[0-9a-fA-F]+$/.test(l1Txid)) {
        return errText("bad_txid", `invalid l1Txid "${l1Txid}"`);
      }
      const vout = Number(args.vout);
      if (!Number.isInteger(vout) || vout < 0) {
        return errText("bad_vout", `invalid vout "${String(args.vout)}"`);
      }

      const out = await opGetDeposit(client, r.slot, r.chainId, l1Txid, vout);
      if (out.kind === "ok") return text(out.deposit);
      // not_found AND not_provisioned both mean "no such deposit here".
      if (out.kind === "not_found") {
        return errText(
          "deposit_not_found",
          `no deposit ${l1Txid}:${vout} on ${r.chainId}`,
        );
      }
      return errText("upstream_error", out.message);
    }

    case "get_balance": {
      const r = resolveSlot(String(args.slot));
      if (!r.ok) return errText(r.code, r.message);

      const address = typeof args.address === "string" ? args.address : "";
      if (!address) {
        return errText("missing_address", "address argument required");
      }

      const out = await opDeriveBalance(client, r.chainId, address);
      if (out.kind === "unknown_chain") {
        return errText("unknown_chain", `upstream has no chain "${r.chainId}"`);
      }
      if (out.kind === "error") {
        return errText("upstream_error", out.message);
      }

      return text({
        slot: r.slot,
        chainId: r.chainId,
        address,
        provisioned: out.provisioned,
        totalSats: out.totalSats,
        depositCount: out.depositCount,
        truncated: out.truncated,
        // CAVEAT: derived from deposit inflow, NOT spendable L2 balance.
        note: "derived from deposit inflow; not spendable balance",
      });
    }

    default:
      return errText("unknown_tool", `no tool named "${name}"`);
  }
}

export async function handleMcp(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") {
    return err("method_not_allowed", "POST only", 405);
  }

  let msg: RpcRequest;
  try {
    msg = (await req.json()) as RpcRequest;
  } catch {
    return json(rpcError(null, -32700, "parse error"));
  }

  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return json(rpcError(msg?.id ?? null, -32600, "invalid request"));
  }

  const method = msg.method;
  const id = msg.id ?? null;

  // MCP notifications (e.g. notifications/initialized) carry no response.
  if (method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: CORS });
  }

  switch (method) {
    case "initialize":
      return json(
        rpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        }),
      );

    case "ping":
      return json(rpcResult(id, {}));

    case "tools/list":
      return json(rpcResult(id, { tools: TOOLS }));

    case "tools/call": {
      const params = msg.params ?? {};
      const name = params.name;
      if (typeof name !== "string") {
        return json(rpcError(id, -32602, "invalid params: missing tool name"));
      }
      const rawArgs = params.arguments;
      const args =
        rawArgs && typeof rawArgs === "object"
          ? (rawArgs as Record<string, unknown>)
          : {};

      const client = new UpstreamClient({ baseUrl: env.SUPAQT_BASE_URL });
      try {
        const result = await callTool(name, args, client);
        return json(rpcResult(id, result));
      } catch (e) {
        return json(
          rpcError(id, -32603, e instanceof Error ? e.message : "internal error"),
        );
      }
    }

    default:
      return json(rpcError(id, -32601, `method not found: ${method}`));
  }
}
