# Handoff: proxy all third-party data through the Sidecoin API (EvoNext)

**Audience:** the EvoNext / `sidecoin-api` team.
**Author:** Sidecoin mobile (`apps/mobile`) port.
**Date:** 2026-09-23.

## Why this document exists

The operator directive is: **every external data source must be reached
through the Sidecoin API (`https://sidecoin.app/v1`), never directly from a
client.** The wallet and mobile clients currently violate this in two places
(below). This document states, with evidence, exactly which calls must be
proxied and what the adapter must expose so the clients can be switched over
without any further guesswork.

## Verified current state (all facts below were checked live on 2026-09-23)

### 1. The adapter is up, but has no routes for the affected data

| URL | HTTP | Body (truncated) |
| --- | --- | --- |
| `https://sidecoin.app/v1/health` | `200` | `{"status":"ok","service":"sidecoin-api",...}` |
| `https://sidecoin.app/v1/sidechains` | `200` | `{"sidechains":[{"slot":9,"id":"thunder",...` |
| `https://sidecoin.app/v1/coin-news/feeds` | `404` | `{"error":{"code":"not_found","message":"no route for /v1/coin-news/feeds"}}` |
| `https://sidecoin.app/v1/coin-news` | `404` | `{"error":{"code":"not_found","message":"no route for /v1/coin-news"}}` |
| `https://sidecoin.app/v1/markets` | `404` | `{"error":{"code":"not_found","message":"no route for /v1/markets"}}` |
| `https://sidecoin.app/v1/market/price/ecx` | `404` | `{"error":{"code":"not_found","message":"no route for /v1/market/price/ecx"}}` |

### 2. The clients bypass the adapter today

Both `apps/mobile/src/api/index.ts` and `apps/wallet/src/api/index.ts` contain
the same two direct third-party bases:

```ts
export const SUPAQT_BASE_URL = "https://supaqt.com/v1";
export const ECASHFARM_BASE_URL = "https://ecashfarm.com/v1";
```

- Coin News (`getCoinNewsFeeds`, `getCoinNewsPosts`) calls
  `${SUPAQT_BASE_URL}/coin-news/...` directly.
- The ECX market price (`getMarketPrice`) calls
  `${ECASHFARM_BASE_URL}/markets` directly and reads `projected.ecxUsd`.

These are the **only** two direct third-party data calls in the client API
layer. L1 reads/broadcast already go to public Esplora by explicit design (see
`AGENTS.md` §9) and are **out of scope** for this handoff.

### 3. The adapter's own client forbids direct third-party calls

`packages/api-client/src/index.ts:4` states:

> `// adapter (default https://sidecoin.app/v1) — never to SupaQt directly.`

That comment is the contract this handoff is asking the adapter to fulfill.

## What EvoNext must build

The adapter must expose the following so the clients can drop their direct
bases entirely. Shapes below are the **minimum** needed to keep the existing
client-side types (`CoinNewsFeed`, `CoinNewsPost`, `CoinNewsPostsPage`,
`MarketPrice`) satisfiable 1:1.

### A. Coin News

**`GET /v1/coin-news/feeds`** → currently served by SupaQt as:

```json
{
  "feeds": [
    { "id": "us-weekly",   "name": "US Weekly",   "postCount": 14 },
    { "id": "japan-weekly","name": "Japan Weekly","postCount": 2 },
    { "id": "nascar",      "name": "NASCAR",      "postCount": 2 },
    { "id": "nostr",       "name": "Nostr",       "postCount": 3 }
  ]
}
```

(Exact field names must be confirmed against the live SupaQt payload; the
adapter's response must match whatever the client already parses so no client
change is needed beyond the base URL.)

**`GET /v1/coin-news/feeds/:feedId/posts?limit=&cursor=`** → paged posts;
returns `{ posts: [...], next_cursor: string | null }`.

### B. ECX market price

**`GET /v1/market/price/ecx`** → must return the existing `MarketPrice` shape:

```json
{
  "asset": "ECX",
  "name": "eCash",
  "price_usd": 0.00042,
  "source": "eCash Farm",
  "as_of": "2026-09-23T22:06:29Z"
}
```

The upstream value is `projected.ecxUsd` from
`https://ecashfarm.com/v1/markets` (an `updatedAt` epoch-seconds field is the
`as_of`). The adapter must document whether it proxies this projection verbatim
or computes its own — the client currently labels it "(Projected)" and links
to eCash Farm, so the semantics must be preserved.

## Notes / open questions for the operator

1. **Domain spelling.** The operator stated the correct brand is **"SupaQt"**
   and to ignore the parked domain. The working endpoint is
   `https://supaqt.com/v1` (reachable, returns live feeds). `superqt.com` is a
   parked "This Domain Is For Sale" page returning 404 for
   `/v1/coin-news/feeds`. Confirmed from live probes.
2. **Who owns the mirror?** This handoff assumes the adapter caches/proxies
   SupaQt and eCash Farm. If EvoNext would rather the clients consume a
   different first-party endpoint, propose it and the client symbols
   (`SUPAQT_BASE_URL`, `ECASHFARM_BASE_URL`) will be repointed.
3. **Until the routes exist**, the clients keep calling the third-party bases;
   nothing will break, but the directive is only satisfied once the two 404s
   above return real payloads.

## Client-side change that follows (for reference — NOT done yet)

Once the adapter routes exist, `apps/mobile/src/api/index.ts` (and the same
file in `apps/wallet`) replace the two `*_BASE_URL` constants with the adapter
client's `DEFAULT_BASE_URL` and route the two functions through it. That is a
small, mechanical change; it is deliberately **not** made in this commit
because the target routes do not exist yet.
