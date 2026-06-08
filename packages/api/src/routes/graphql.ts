// packages/api/src/routes/graphql.ts
//
// GraphQL endpoint (POST /graphql). Serves the SAME data as /v1 and /mcp by
// calling the shared slot resolver and upstream operations. Bigints (sats)
// are String. Domain failures surface as GraphQL errors carrying the same
// `code` the REST surface uses, via error `extensions`.

import { buildSchema, graphql } from "graphql";

import type { Env } from "../lib/shared.js";
import {
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

const schema = buildSchema(/* GraphQL */ `
  type Health {
    status: String!
    service: String!
    time: String!
  }

  type Sidechain {
    slot: Int!
    id: String!
    displayName: String
    description: String
    status: String!
  }

  type Deposit {
    slot: Int!
    chainId: String!
    l1Txid: String!
    vout: Int!
    ctipSeq: Int
    address: String!
    valueSats: String!
    status: String!
    confirmations: Int
    firstSeenTs: Float
    l1ConfirmedTs: Float
    l2CreditedTs: Float
  }

  type DepositsPage {
    slot: Int!
    chainId: String!
    provisioned: Boolean!
    deposits: [Deposit!]!
    nextCursor: String
  }

  type Balance {
    slot: Int!
    chainId: String!
    address: String!
    provisioned: Boolean!
    totalSats: String!
    depositCount: Int!
    truncated: Boolean!
    note: String!
  }

  type Query {
    health: Health!
    sidechains: [Sidechain!]!
    deposit(slot: Int!, l1Txid: String!, vout: Int!): Deposit
    deposits(
      slot: Int!
      address: String
      status: String
      limit: Int
      cursor: String
    ): DepositsPage!
    balance(slot: Int!, address: String!): Balance!
  }
`);

interface Ctx {
  client: UpstreamClient;
}

/** Throw a GraphQL-visible error carrying the same `code` as the REST API. */
function gqlError(code: string, message: string): never {
  const e = new Error(message) as Error & { extensions?: Record<string, unknown> };
  e.extensions = { code };
  throw e;
}

const root = {
  health: () => healthInfo(),

  sidechains: () => listSidechains(),

  deposit: async (
    args: { slot: number; l1Txid: string; vout: number },
    ctx: Ctx,
  ) => {
    const r = resolveSlot(String(args.slot));
    if (!r.ok) gqlError(r.code, r.message);
    if (!/^[0-9a-fA-F]+$/.test(args.l1Txid)) {
      gqlError("bad_txid", `invalid l1Txid "${args.l1Txid}"`);
    }
    if (!Number.isInteger(args.vout) || args.vout < 0) {
      gqlError("bad_vout", `invalid vout "${args.vout}"`);
    }

    const out = await opGetDeposit(ctx.client, r.slot, r.chainId, args.l1Txid, args.vout);
    if (out.kind === "ok") return out.deposit;
    // not_found AND not_provisioned collapse to null for a single lookup.
    if (out.kind === "not_found") return null;
    gqlError("upstream_error", out.message);
  },

  deposits: async (
    args: {
      slot: number;
      address?: string;
      status?: string;
      limit?: number;
      cursor?: string;
    },
    ctx: Ctx,
  ) => {
    const r = resolveSlot(String(args.slot));
    if (!r.ok) gqlError(r.code, r.message);

    let limit: number | undefined;
    if (args.limit != null) {
      if (!Number.isInteger(args.limit) || args.limit < 1) {
        gqlError("bad_limit", `invalid limit "${args.limit}"`);
      }
      limit = Math.min(args.limit, MAX_PAGE);
    }

    const out = await opListDeposits(ctx.client, r.slot, r.chainId, {
      address: args.address ?? undefined,
      status: args.status ?? undefined,
      limit,
      cursor: args.cursor ?? undefined,
    });

    if (out.kind === "not_provisioned") {
      // Chain known but its deposits table isn't live yet — empty page.
      return {
        slot: r.slot,
        chainId: r.chainId,
        provisioned: false,
        deposits: [],
        nextCursor: null,
      };
    }
    if (out.kind === "unknown_chain") {
      gqlError("unknown_chain", `upstream has no chain "${r.chainId}"`);
    }
    if (out.kind === "error") gqlError("upstream_error", out.message);

    return {
      slot: r.slot,
      chainId: r.chainId,
      provisioned: true,
      deposits: out.deposits,
      nextCursor: out.nextCursor,
    };
  },

  balance: async (args: { slot: number; address: string }, ctx: Ctx) => {
    const r = resolveSlot(String(args.slot));
    if (!r.ok) gqlError(r.code, r.message);
    if (!args.address) gqlError("missing_address", "address argument required");

    const out = await opDeriveBalance(ctx.client, r.chainId, args.address);
    if (out.kind === "unknown_chain") {
      gqlError("unknown_chain", `upstream has no chain "${r.chainId}"`);
    }
    if (out.kind === "error") gqlError("upstream_error", out.message);

    return {
      slot: r.slot,
      chainId: r.chainId,
      address: args.address,
      provisioned: out.provisioned,
      totalSats: out.totalSats,
      depositCount: out.depositCount,
      truncated: out.truncated,
      // CAVEAT: derived from deposit inflow, NOT spendable L2 balance.
      note: "derived from deposit inflow; not spendable balance",
    };
  },
};

export async function handleGraphql(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") {
    return err("method_not_allowed", "POST only", 405);
  }

  let body: {
    query?: string;
    variables?: Record<string, unknown>;
    operationName?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err("bad_request", "invalid JSON body", 400);
  }
  if (!body || typeof body.query !== "string") {
    return err("bad_request", "missing GraphQL query", 400);
  }

  const client = new UpstreamClient({ baseUrl: env.SUPAQT_BASE_URL });

  const result = await graphql({
    schema,
    source: body.query,
    rootValue: root,
    contextValue: { client } satisfies Ctx,
    variableValues: body.variables,
    operationName: body.operationName,
  });

  // GraphQL convention: 200 even when `errors` is populated.
  return json(result);
}
