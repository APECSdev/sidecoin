// packages/api/src/routes/founders.ts
//
// Public Founders read surface (D1-backed, no auth). The public key is the
// sole identity; it is NEVER exposed publicly — only the derived avatar_seed
// (sha256(pubkey)) leaves the worker.
//
//   GET /v1/founders                 -> paginated leaderboard + live cut line
//   GET /v1/founders/:number         -> single public profile
//   GET /v1/founders/by-key/:pubkey  -> "find my position" (post-checkout poll)
//
// Profile gating: full profile (bio/links) is unlocked above the cut line
// (pre-fork) or once is_alpha is locked (post-fork). Below the line only the
// minimal, identity-safe fields are returned.

import type { Env } from "../lib/env.js";
import { json, err } from "../lib/shared.js";

// THE single source of truth for the Founders cut line. Consumed by the
// leaderboard, single-profile, and by-key routes (and, at the fork, by the
// is_alpha lock job). Change it here and everywhere agrees.
export const CUT_LINE_PCT = 0.2;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function cutLine(total: number): number {
  if (total <= 0) return 0;
  return Math.max(1, Math.ceil(total * CUT_LINE_PCT));
}

interface FounderRow {
  founder_number: number;
  identity: string;
  username: string | null;
  display_name: string | null;
  avatar_seed: string;
  bio: string | null;
  links_json: string | null;
  paid_through: number;
  is_alpha: number;
  created_at: number;
}

const FOUNDER_COLUMNS =
  `founder_number, identity, username, display_name, avatar_seed,
   bio, links_json, paid_through, is_alpha, created_at`;

/**
 * Shape a row for public output. NEVER includes identity (the raw pubkey).
 * Gates bio/links behind the cut line (or a locked is_alpha).
 */
function shapeFounder(row: FounderRow, total: number, now: number) {
  const line = cutLine(total);
  const aboveCutLine = row.is_alpha === 1 || row.founder_number <= line;
  const proActive = row.paid_through > now;

  const base = {
    founderNumber: row.founder_number,
    username: row.username,
    displayName: row.display_name,
    avatarSeed: row.avatar_seed,
    isAlpha: row.is_alpha === 1,
    proActive,
    aboveCutLine,
  };

  if (!aboveCutLine) {
    return { ...base, bio: null as string | null, links: [] as string[] };
  }

  let links: string[] = [];
  if (row.links_json) {
    try {
      const parsed = JSON.parse(row.links_json);
      if (Array.isArray(parsed)) {
        links = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      links = [];
    }
  }
  return { ...base, bio: row.bio, links };
}

export async function handleFounders(
  req: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (req.method !== "GET") {
    return err("method_not_allowed", "GET only", 405);
  }

  // GET /v1/founders (leaderboard)
  if (url.pathname === "/v1/founders") {
    return leaderboard(env, url);
  }

  const rest = url.pathname.replace(/^\/v1\/founders\//, "");
  const parts = rest.split("/").filter(Boolean);

  // GET /v1/founders/by-key/:publicKey
  if (parts.length === 2 && parts[0] === "by-key") {
    return byKey(env, parts[1]);
  }

  // GET /v1/founders/:number
  if (parts.length === 1 && /^\d+$/.test(parts[0])) {
    return singleFounder(env, Number(parts[0]));
  }

  return err("not_found", `no route for ${url.pathname}`, 404);
}

async function leaderboard(env: Env, url: URL): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  const limitRaw = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitRaw != null) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1) {
      return err("bad_limit", `invalid limit "${limitRaw}"`, 400);
    }
    limit = Math.min(n, MAX_LIMIT);
  }

  // Keyset pagination by founder_number (the PK, already ordered).
  const cursorRaw = url.searchParams.get("cursor");
  let after = 0;
  if (cursorRaw != null) {
    const n = Number(cursorRaw);
    if (!Number.isInteger(n) || n < 0) {
      return err("bad_cursor", `invalid cursor "${cursorRaw}"`, 400);
    }
    after = n;
  }

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM founders`,
  ).first<{ c: number }>();
  const total = totalRow?.c ?? 0;

  // Fetch limit+1 to detect another page without a second COUNT.
  const { results } = await env.DB.prepare(
    `SELECT ${FOUNDER_COLUMNS}
       FROM founders
      WHERE founder_number > ?
      ORDER BY founder_number ASC
      LIMIT ?`,
  )
    .bind(after, limit + 1)
    .all<FounderRow>();

  const rows = (results ?? []) as FounderRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].founder_number : null;

  return json({
    total,
    cutLine: cutLine(total),
    cutLinePct: CUT_LINE_PCT,
    founders: page.map((r) => shapeFounder(r, total, now)),
    nextCursor,
  });
}

async function singleFounder(env: Env, num: number): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM founders`,
  ).first<{ c: number }>();
  const total = totalRow?.c ?? 0;

  const row = await env.DB.prepare(
    `SELECT ${FOUNDER_COLUMNS} FROM founders WHERE founder_number = ?`,
  )
    .bind(num)
    .first<FounderRow>();

  if (!row) {
    return err("founder_not_found", `no founder #${num}`, 404);
  }
  return json({
    total,
    cutLine: cutLine(total),
    founder: shapeFounder(row, total, now),
  });
}

async function byKey(env: Env, publicKeyRaw: string): Promise<Response> {
  if (!/^[0-9a-fA-F]{66}$/.test(publicKeyRaw)) {
    return err("bad_public_key", "publicKey must be a 66-char hex string", 400);
  }
  const publicKey = publicKeyRaw.toLowerCase();
  const now = Math.floor(Date.now() / 1000);

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM founders`,
  ).first<{ c: number }>();
  const total = totalRow?.c ?? 0;

  const row = await env.DB.prepare(
    `SELECT ${FOUNDER_COLUMNS} FROM founders WHERE identity = ?`,
  )
    .bind(publicKey)
    .first<FounderRow>();

  if (!row) {
    // Not a founder (yet). Useful for post-checkout polling.
    return json({ found: false, total, cutLine: cutLine(total) });
  }
  return json({
    found: true,
    total,
    cutLine: cutLine(total),
    founder: shapeFounder(row, total, now),
    paidThrough: row.paid_through,
    proActive: row.paid_through > now,
  });
}
