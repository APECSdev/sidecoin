# HANDOFF — sidecoin-api: entitlements API

**Status:** client shipped in `sidecoin` monorepo (apps/mobile 26.10.23;
Alpha meter client-side added 26.10.24); server route **missing** —
`GET https://sidecoin.app/v1/me/entitlements`
returns `404 no route for /v1/me/entitlements` (verified 2026-10-23).
**Goal:** one authoritative route that turns a NOWPayments payment into an
entitlement the wallet can verify, cache, and enforce — on launch, on
demand, and before gated actions.

---

## 1. Product shape (source of truth: `apps/web`)

Pricing and checkout are already live on the marketing site:

- **Monthly $5** (2-month minimum) / **Yearly $36** ($3/mo), crypto-only
  via NOWPayments (BTC, ETH, LTC, XMR, USDT-ERC20, DASH). No fiat rails.
  (`apps/web/src/lib/nowpayments.ts`, `apps/web/src/components/PricingSection.astro`)
- NOWPayments rejects invoices under ≈ $4.96 USD-equivalent (observed
  2026-10-23), hence the 2-month floor on monthly.
- **Yearly-only extras:** Founder Leaderboard + Diamond Circle eligibility.
  Monthly does NOT include them. The entitlement payload is where this
  distinction must surface (see `plan` below).
- Payment endpoints already live in sidecoin-api: `POST /v1/pay/create`,
  `GET /v1/pay/currencies`, `GET /v1/pay/status` (consumed by
  `apps/web/src/lib/nowpayments.ts`; `/v1/pay/currencies` verified 200).
- `sidecoin.app/pro` is the checkout page (200). The mobile app does NOT
  link to it (store policy); it only shows the URL as plain text. Users
  pay on the web, receive a key, and paste it into the app.

## 2. The missing route

```
GET /v1/me/entitlements
Authorization: Bearer <entitlement-key>
```

| Response | Meaning | Client behavior (already implemented) |
| --- | --- | --- |
| `200` + payload below | Current entitlement | Apply, expiry-check, cache in AsyncStorage |
| `401` | Key unknown/revoked | Clear key + cache, re-lock to Basic immediately |
| any other status (404 while undeployed, 5xx, …) | Indeterminate | Fall back to cached state; else Basic |
| network error | Offline | Same cache → Basic fallback chain |

**The 401 contract matters:** it is the ONLY response that destroys local
state. Never return 401 for transient problems — use 5xx, which preserves
the user's cached entitlement.

### Response payload (must validate against this exact shape)

```json
{
  "plan": "pro",
  "status": "active",
  "features": ["l1", "swap", "platform:zside", "wallet:coin-control"],
  "expiresAt": "2027-10-23T00:00:00.000Z",
  "checkedAt": "2026-10-23T12:34:56.000Z"
}
```

- `plan`: `"basic" | "pro" | "founder" | "diamond"` — use `founder` for
  yearly subscribers (drives Founder Leaderboard / Diamond Circle per the
  pricing copy), `diamond` for Diamond Circle members, `pro` for monthly.
  (The tier was renamed from "Alpha Circle"/`alpha` on 26.10.24 when the
  **Alpha meter** claimed the word — see §11.)
- `status`: `"active" | "inactive" | "grace" | "unknown"`.
  `active` and `grace` unlock; everything else re-locks.
- `features`: string array. Feature ids are owned by
  `apps/mobile/src/entitlements.ts` (`platform:<id>`, `wallet:coin-control`,
  `analytics:historical`, `platforms:early-access`, `l1`, `swap`,
  `toolbox`, `hardware:read`, `hardware:signing`). For paid tiers the
  client short-circuits (pro/founder/alpha + active/grace unlock
  everything), so the list is authoritative mainly for `basic` and for
  forward-compat granular grants.
- `expiresAt`: ISO 8601 or `null` (lifetime). **The client enforces expiry
  locally**: an active/grace state past `expiresAt` is treated as
  `inactive` and its feature list collapses to the Basic set. The backend
  MUST also mark expired subscriptions `status: "inactive"` — the client
  check is defense in depth for cached/offline states.
- `checkedAt`: server timestamp; the client overwrites it with its own
  fetch time when caching.

The client validates strictly (unknown plan/status, non-array features,
non-string timestamps → payload rejected, cached state kept). Send exactly
this shape.

## 3. Entitlement key (the bearer token)

- **Proposed format:** `sc_ent_` + 32 lowercase hex chars (16 random
  bytes), issued once per completed payment, shown on the
  `sidecoin.app/pro/success` page (already designed as the "receipt key"
  — see `apps/web/src/pages/pro/success.astro`) and restorable by
  purchaser email.
- The mobile client treats the key as an opaque string (trimmed,
  non-empty) — no format validation client-side, so the API team owns the
  final format.
- One key = one subscription. Store: key hash → { NOWPayments payment id,
  plan, status, period end, purchaser email, created/revoked timestamps }.
  Hash at rest; the key is a bearer secret.
- **Multi-device:** the same key pasted on N devices entitles them all.
  If per-device limits are ever wanted, that is a v2 concern — do not
  block v1 on it.
- **Rotation/revocation:** revoking server-side + returning 401 is the
  kill switch; the client wipes and re-locks on the next check.

## 4. End-to-end flow (all pieces exist except step 4)

1. User picks a plan on `sidecoin.app/pro` → `POST /v1/pay/create` →
   NOWPayments invoice → pays on-chain.
2. NOWPayments IPN confirms the payment (webhook handler lives in
   sidecoin-api).
3. User lands on `sidecoin.app/pro/success?payment_id=…`, which polls
   `/v1/pay/status`.
4. **(NEW)** On confirmed payment, issue/return the entitlement key and
   render it on the success page with copy-to-clipboard.
5. User pastes the key in the app: **Settings → Sidecoin PRO → Activate
   PRO key** (mobile, shipped). The app calls
   `GET /v1/me/entitlements`, applies the payload, caches it.
6. Re-checks happen: every app launch, manual "Refresh status" in
   Settings, and whenever a locked platform screen mounts.
7. Expiry/revocation/non-renewal → `inactive` (or 401) → the app re-locks
   to Basic everywhere, live, via the entitlement subscription bus.

## 5. Flavor split (hard requirement, F-Droid policy)

- **F-Droid flavor:** every feature unlocked locally as plan `founder`.
  The client short-circuits BEFORE any network call — this route will
  never see F-Droid traffic, and F-Droid builds render no PRO UI at all
  (fdroiddata!50457, note 4064134145). Do not "fix" this.
- **Appstore flavor + dev:** Basic by default; the flow above applies.

## 6. Store-policy context (why the key flow looks like this)

The app deliberately carries **no external purchase link** — the checkout
URL appears only as non-interactive text (Apple/Google policies on
steering to external payments for digital goods). Consequences for the
API:

- Entitlement activation is **key-paste only**. Do not rely on deep links
  from the web checkout back into the app as the primary path.
- The success page must make the key copyable and durable (email restore),
  because users type/paste it into the app by hand later.

## 7. Founder Identity Key (Nostr NIP-06) — future linkage

The wallet derives a Nostr keypair at `m/44'/1237'/0'/0/0`
(`apps/mobile/src/screens/SettingsScreen.tsx`, "Founder Identity Key")
for the upcoming Founder Leaderboard. The web success flow links a
purchase to a Nostr pubkey by having the user paste their npub. If
server-side linkage is wanted later, accept an optional NIP-98 /
signed-event auth on a second route (e.g. `GET /v1/me/entitlements`
with a signed Nostr event) and return the same payload — the client can
adopt it without a contract change. Not required for v1.

## 8. Client implementation (monorepo, shipped 26.10.23)

| File | What |
| --- | --- |
| `apps/mobile/src/entitlements.ts` | Full engine: plan model, gate predicates, `refreshEntitlements()` (fetch → validate → expiry-check → cache), key storage (`sidecoin.entitlementKey.v1`), cache (`sidecoin.entitlementsCache.v1`), subscription bus + `useEntitlements()` hook |
| `apps/mobile/src/App.tsx` | Launch refresh (`useEffect` → `refreshEntitlements()`) |
| `apps/mobile/src/screens/SettingsScreen.tsx` | "Sidecoin PRO" section (appstore/dev only): plan/status badge, key paste + Activate, Refresh, Remove. Hidden on F-Droid via `IS_FDROID_BUILD` |
| `apps/mobile/src/screens/ProBenefitsScreen.tsx` | Upgrade CTA de-linked: `sidecoin.app/pro` as plain text, points at Settings activation |
| `apps/mobile/src/screens/{DashboardScreen,SidechainsScreen,PlatformDetailScreen,SendScreen}.tsx` + `components/pro/ProStatusCard.tsx` | All gates read the live hook; PlatformDetailScreen refreshes before gated actions; locked ProGate CTAs navigate to `pro` |
| `apps/mobile/src/__tests__/entitlementsApi.test.ts` | 16 tests: every response class, expiry re-lock, 401 wipe, cache fallbacks, F-Droid no-network, subscribers |
| `apps/mobile/src/__tests__/entitlementsFdroid.test.ts` | F-Droid all-unlocked seam (must keep passing) |
| `apps/mobile/__mocks__/@react-native-async-storage/async-storage.js` | In-memory manual mock for the new module-top AsyncStorage import |
| `apps/mobile/src/alpha.ts` | **Alpha meter engine** (26.10.24): free tier rides a Duolingo-Energy-style meter instead of a hard lock — 100 Alpha cap, drain 100/h while a PRO screen is foregrounded, regen 8/h idle, per-action costs, on-chain-evidence earn-back grants (one-time, daily-capped). Combined gate `canUseProFeature/Platform` = plan-unlimited OR (metered AND balance > 0). Gating floors to the displayed integer. Unlimited = any paid plan or the F-Droid flavor (no meter UI at all) |
| `apps/mobile/src/components/AlphaMeter.tsx` | Header/dashboard pill (balance gauge, tap-to-explain sheet, regen ETA, grant list); renders `null` for unlimited users |
| `apps/mobile/src/__tests__/alpha.test.ts` | 17 tests: settle/drain/regen math, floor-gating regression (sub-1 residue displays "0" and gates as "0"), action costs, grant one-time + daily cap, persistence, F-Droid/pro short-circuits |
| `apps/mobile/src/__tests__/AlphaMeter.test.tsx` | 6 tests: live countdown via the `ALPHA_TICK_MS` → `tickAlpha()` interval (reads deliberately never emit), explainer sheet, unlimited-plan null render |

Note: the client pins entitlements to `DEFAULT_BASE_URL`
(`https://sidecoin.app/v1` from `@sidecoin/api-client`) rather than the
debug-overridable API base, so billing state always comes from one
authority. Flag if the API team wants staging support.

**Web wallet (`apps/wallet`) note:** it consumes the same hardcoded
`CURRENT_ENTITLEMENTS` pattern via the Vue originals these screens were
ported from (`apps/wallet/src/views/ProBenefitsView.vue` etc.). Porting
this same engine to the web wallet is tracked as a follow-up in the
monorepo; it needs no contract change.

## 9. Decisions the API team owns

1. Key format + entropy (proposal in §3).
2. Where keys surface: success page rendering + email restore flow.
3. Plan mapping: monthly→`pro`, yearly→`founder`, Diamond Circle→`diamond`
   (matches the pricing copy; adjust if product wants different slugs —
   the client validates against the four values above only).
4. Renewal handling: NOWPayments is one-shot invoicing — decide how a
   renewal payment extends `expiresAt` for the same key (re-issue vs.
   extend), and the grace-period length for failed renewals.
5. Rate limiting on `/v1/me/entitlements` (it is a bearer-token endpoint;
   launch + manual refresh + locked-screen mounts are the call drivers).

## 10. Verification checklist (post-deploy)

- [ ] `curl -s https://sidecoin.app/v1/me/entitlements` → 401 (no key)
- [ ] `curl -s -H "Authorization: Bearer <valid>" …/me/entitlements` → 200,
      payload validates against §2 (all four fields, correct types)
- [ ] Revoked key → 401; client wipes and shows Basic on next check
- [ ] `expiresAt` in the past → server says `inactive` AND client
      `withExpiryCheck` agrees (test: paste key, refresh, gates locked)
- [ ] Airplane mode with a cached pro state → app stays pro (source
      `cache`); with no cache → Basic
- [ ] F-Droid build: zero requests to the route (client short-circuits)

## 11. Future requirement — server-side Alpha ledger (pre-mainnet gate)

The Alpha meter shipped **client-side only** (26.10.24). That is an
accepted temporary risk: test-network coins are worthless and no real
purchase path exists yet, so gaming a client-only meter costs nothing
real. **Before mainnet value is at stake the balance must become
server-authoritative** — the same way the entitlements state moved
server-side in this document's v1.

Proposed contract (mirrors the entitlements shape; details the API team
owns, like §9):

- `GET /v1/me/alpha` (Bearer entitlement key) →
  `{ balance: number, updatedAt: string, claimedGrants: string[],
    grantDay: string, grantDayTotal: number }` — the authoritative tank.
  Users WITHOUT a key are anonymous-metered (client-side, as today); the
  server ledger only needs to cover keyed users.
- `POST /v1/me/alpha/events` (Bearer entitlement key) — append-only event
  log the server settles against:
  `{ type: "drain", featureId, elapsedMs } |
   { type: "spend", actionId, cost } |
   { type: "grant", grantId, evidence }`.
  Server recomputes the balance from the log + regen curve and REJECTS
  events that would overdraw. `evidence` for grants is the on-chain proof
  (txid for `first-l1-deposit` / `first-broadcast` /
  `first-platform-deposit`) so the server can verify against an Esplora
  backend before crediting — the client currently trusts its own
  observation, which is the gameable part.
- Constants to mirror (`apps/mobile/src/alpha.ts` is the source of truth):
  cap 100, drain 100/hour while a PRO screen is foregrounded, regen
  8/hour while idle, grant amounts 25/20/15, daily grant cap 50,
  low/critical warnings at 25/10.

Anti-gaming rationale for the server: balance in a server row keyed by
the entitlement key, events validated against the clock (drain `elapsedMs`
cannot exceed wall time since `updatedAt`), grants credited only after
the txid verifies on-chain. The client keeps its local meter as a
cache/offline fallback exactly like the entitlements cache.
