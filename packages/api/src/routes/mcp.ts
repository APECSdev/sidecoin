// packages/api/src/routes/mcp.ts
//
// MCP endpoint (POST /mcp), implemented as plain JSON-RPC 2.0 over HTTP so it
// runs inside a Cloudflare Worker fetch handler (the MCP TS SDK assumes a
// stdio/long-lived transport that doesn't map onto request/response).
//
// Tools expose the SAME operations as /v1 and /graphql, calling the shared
// slot resolver and upstream operations. Domain failures are returned as MCP
// tool results with isError:true carrying the same `code` strings as REST.
//
// A GET to /mcp returns a human-readable landing page (a "SKILL.md for
// humans") explaining what the service does and how to wire it into an
// AI agent. The tool table is generated from the TOOLS array below so the
// docs can never drift from the actual exposed tools.

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

/**
 * Human-readable landing page for /mcp. Explains the service to operators
 * and shows how to integrate it into an AI agent. The tool list is rendered
 * from TOOLS so it always matches what tools/list returns.
 */
function mcpLandingPage(): string {
  const toolRows = TOOLS.map(
    (t) =>
      `          <tr><td><code>${t.name}</code></td><td>${t.description}</td></tr>`,
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sidecoin MCP Server</title>
    <style>
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        line-height: 1.55;
        max-width: 820px;
        margin: 0 auto;
        padding: 2rem 1.25rem 4rem;
        color: #1a1a1a;
      }
      h1 { margin-bottom: 0.25rem; }
      .sub { color: #666; margin-top: 0; }
      code {
        background: #f4f4f5;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
        font-size: 0.9em;
      }
      pre {
        background: #1e1e1e;
        color: #f8f8f2;
        padding: 1rem;
        border-radius: 8px;
        overflow-x: auto;
      }
      pre code { background: none; color: inherit; padding: 0; }
      table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
      th, td {
        text-align: left;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid #e4e4e7;
        vertical-align: top;
      }
      th { background: #fafafa; }
      .note {
        background: #fff7ed;
        border-left: 4px solid #fb923c;
        padding: 0.75rem 1rem;
        border-radius: 4px;
      }
    </style>
  </head>
  <body>
    <h1>Sidecoin MCP Server</h1>
    <p class="sub">
      Model Context Protocol server (<code>${SERVER_INFO.name}</code> v${SERVER_INFO.version}) —
      read-only access to Sidecoin drivechain deposit data for AI agents.
    </p>

    <h2>What it does</h2>
    <p>
      This endpoint exposes Sidecoin's slot-addressed deposit data as MCP
      tools so an AI agent can look up sidechains, list and fetch L1→L2
      deposits, and compute a derived deposit-inflow balance for an address.
      It is the same data served by the REST (<code>/v1</code>) and GraphQL
      (<code>/graphql</code>) endpoints, exposed through MCP tools.
    </p>

    <h2>Transport</h2>
    <p>
      JSON-RPC 2.0 over HTTP. Send <code>POST</code> requests to this URL
      (<code>https://sidecoin.app/mcp</code>). Protocol version
      <code>${PROTOCOL_VERSION}</code>. Supported methods:
      <code>initialize</code>, <code>ping</code>, <code>tools/list</code>,
      <code>tools/call</code>.
    </p>

    <h2>Integrating with an AI agent</h2>
    <p>
      Point any MCP client that supports a streamable-HTTP / remote server at
      this URL. For clients configured via JSON, that looks like:
    </p>
    <pre><code>{
  "mcpServers": {
    "sidecoin": {
      "url": "https://sidecoin.app/mcp"
    }
  }
}</code></pre>
    <p>
      No authentication is required — the underlying data source is public
      and read-only.
    </p>

    <h2>Available tools</h2>
    <table>
      <thead>
        <tr><th>Tool</th><th>Description</th></tr>
      </thead>
      <tbody>
${toolRows}
      </tbody>
    </table>

    <h2>Example: list the tools directly</h2>
    <pre><code>curl -s https://sidecoin.app/mcp \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'</code></pre>

    <h2>Example: call a tool</h2>
    <pre><code>curl -s https://sidecoin.app/mcp \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"list_sidechains","arguments":{}}}'</code></pre>

    <div class="note">
      <strong>Note on balance:</strong> <code>get_balance</code> returns a
      value derived from the sum of credited deposit inflow for an address.
      It is <em>not</em> a spendable L2 balance — the upstream source exposes
      no balance route today.
    </div>
  </body>
</html>`;
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
  // GET /mcp -> human-readable landing page (docs for operators / agents).
  if (req.method === "GET") {
    return new Response(mcpLandingPage(), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", ...CORS },
    });
  }
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
