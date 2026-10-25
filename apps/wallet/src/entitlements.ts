// apps/wallet/src/entitlements.ts
//
// Entitlements: who can use which PRO feature.
//
// Source of truth: the local state below, refreshed from the adapter's
// GET /v1/me/entitlements (Bearer <entitlement key>). The key is the payment
// receipt issued by the sidecoin-api webhook after a confirmed NOWPayments
// checkout at sidecoin.app/pro — it is shown once in the web wallet's
// PaymentFlow receipt panel and can be pasted here under
// Settings → Sidecoin PRO.
//
// This file mirrors apps/mobile/src/entitlements.ts (kept 1:1 where the
// platform allows). Differences from the mobile original:
//   - Persistence is localStorage (browser) instead of AsyncStorage. The
//     public API keeps the same async signatures as mobile so call sites
//     and tests stay 1:1.
//   - There is no F-Droid flavor on the web: IS_FDROID_BUILD /
//     FDROID_ENTITLEMENTS and the "fdroid" refresh branch are mobile-only
//     (store-policy exemption, fdroiddata!50457 note 4064134145). The
//     "fdroid" refresh source remains in the type union for wire parity.
//   - useEntitlements() returns a Vue Ref instead of a React hook value.
//   - The entitlements base URL follows the wallet's configurable API base
//     (getApiBaseUrl, default https://sidecoin.app/v1); mobile pins
//     DEFAULT_BASE_URL.

import { ref, type Ref } from "vue";
import { DEFAULT_BASE_URL } from "@sidecoin/api-client";

import { getApiBaseUrl } from "./api";

// ──────────────────────────────────────────────────────
// Plans + features (1:1 with apps/mobile/src/entitlements.ts)

export type Plan = "basic" | "pro" | "founder" | "diamond";
export type EntitlementStatus = "active" | "inactive" | "grace" | "unknown";

export interface EntitlementState {
  plan: Plan;
  status: EntitlementStatus;
  features: string[];
  expiresAt: string | null;
  checkedAt: string | null;
}

export const BASIC_PLATFORM_IDS = ["thunder", "bitnames", "snowside"];
export const PRO_PLATFORM_IDS = [
  "zside",
  "bitassets",
  "photon",
  "truthcoin",
  "coinshift",
  "riscy",
  "elementsplus",
];
// NOTE: "snowside" is intentionally NOT in PRO_PLATFORM_IDS — address
// generation is available to everyone (Basic) so it can serve as a mining
// target. Promote to PRO here only if/when premium Snowside features are
// gated separately.

export const COIN_CONTROL_FEATURE_ID = "wallet:coin-control";

// Hardware signing is FREE for everyone — it is a safety primitive, not a
// premium feature. The coin-splitter (also free) reuses this surface after
// the fork. PRO gating for *advanced* hardware workflows (multi-key,
// policy scripts) will be added later under a distinct feature id.
export const BASIC_FEATURES = [
  "l1",
  "swap",
  "toolbox",
  "hardware:read",
  "hardware:signing",
  "platform:thunder",
  "platform:bitnames",
  "platform:snowside",
];

export const PRO_FEATURES = [
  "platform:zside",
  "platform:bitassets",
  "platform:photon",
  "platform:truthcoin",
  "platform:coinshift",
  "platform:riscy",
  "platform:elementsplus",
  "analytics:historical",
  "platforms:early-access",
  COIN_CONTROL_FEATURE_ID,
];

const BASIC_ENTITLEMENTS: EntitlementState = {
  plan: "basic",
  status: "active",
  features: BASIC_FEATURES,
  expiresAt: null,
  checkedAt: null,
};

// Live binding: reassigned by refreshEntitlements()/setEntitlementKey(null)
// and emitted to subscribers + the useEntitlements ref.
export let CURRENT_ENTITLEMENTS: EntitlementState = BASIC_ENTITLEMENTS;

export function platformFeatureId(platformId: string): string {
  return `platform:${platformId}`;
}

export function isProPlan(entitlements = CURRENT_ENTITLEMENTS): boolean {
  return ["pro", "founder", "diamond"].includes(entitlements.plan)
    && ["active", "grace"].includes(entitlements.status);
}

export function canAccessFeature(
  feature: string,
  entitlements = CURRENT_ENTITLEMENTS,
): boolean {
  if (isProPlan(entitlements)) return true;
  return entitlements.features.includes(feature);
}

export function canAccessPlatform(
  platformId: string,
  entitlements = CURRENT_ENTITLEMENTS,
): boolean {
  return canAccessFeature(platformFeatureId(platformId), entitlements);
}

export function isProPlatform(platformId: string): boolean {
  return PRO_PLATFORM_IDS.includes(platformId);
}

// ──────────────────────────────────────────────────────
// Backend state (key + cache + refresh)

/** REST base serving the entitlements route (same adapter as the rest of
 * /v1). getApiBaseUrl() returns "" when the wallet runs on the client
 * default — fall back to DEFAULT_BASE_URL so the default path still hits
 * the production adapter. */
export function entitlementsBaseUrl(): string {
  return getApiBaseUrl() || DEFAULT_BASE_URL;
}

/** localStorage key for the user-pasted entitlement key (payment receipt). */
export const ENTITLEMENT_KEY_STORAGE_KEY = "sidecoin.entitlementKey.v1";

/** localStorage key for the last successfully fetched entitlement state. */
export const ENTITLEMENTS_CACHE_STORAGE_KEY = "sidecoin.entitlementsCache.v1";

export type EntitlementsRefreshSource =
  | "fdroid"   // mobile F-Droid flavor only; never produced on the web
  | "network"  // fresh 200 from the backend (cached)
  | "cache"    // backend unreachable/undesirable response: last good state
  | "basic";   // no key, or key rejected (401), or nothing cached

export interface EntitlementsRefreshResult {
  state: EntitlementState;
  source: EntitlementsRefreshSource;
}

const PLANS: readonly Plan[] = ["basic", "pro", "founder", "diamond"];
const STATUSES: readonly EntitlementStatus[] = [
  "active",
  "inactive",
  "grace",
  "unknown",
];

/**
 * Validate an unknown payload against the EntitlementState contract. Returns
 * null on any shape violation — a malformed backend response must never be
 * applied (the caller falls back to the cached state instead).
 */
export function parseEntitlementState(payload: unknown): EntitlementState | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.plan !== "string" || !PLANS.includes(candidate.plan as Plan)) {
    return null;
  }
  if (
    typeof candidate.status !== "string"
    || !STATUSES.includes(candidate.status as EntitlementStatus)
  ) {
    return null;
  }
  if (
    !Array.isArray(candidate.features)
    || !candidate.features.every((feature) => typeof feature === "string")
  ) {
    return null;
  }
  if (candidate.expiresAt !== null && typeof candidate.expiresAt !== "string") {
    return null;
  }
  if (candidate.checkedAt !== null && typeof candidate.checkedAt !== "string") {
    return null;
  }
  return {
    plan: candidate.plan as Plan,
    status: candidate.status as EntitlementStatus,
    features: candidate.features as string[],
    expiresAt: candidate.expiresAt as string | null,
    checkedAt: candidate.checkedAt as string | null,
  };
}

/**
 * Local expiry enforcement (defense in depth — the backend also marks the
 * status): an active/grace state whose expiresAt is in the past is treated
 * as inactive, which re-locks every PRO feature on the next render. The
 * feature list collapses to the Basic set — an inactive paid plan is the
 * free tier, so a stale pro feature list cannot keep platforms unlocked.
 */
export function withExpiryCheck(
  state: EntitlementState,
  now: Date = new Date(),
): EntitlementState {
  if (state.expiresAt === null) return state;
  if (state.status !== "active" && state.status !== "grace") return state;
  const expiresAtMs = Date.parse(state.expiresAt);
  if (Number.isNaN(expiresAtMs)) return state;
  if (expiresAtMs > now.getTime()) return state;
  return {
    ...state,
    status: "inactive",
    features: state.features.filter((feature) => BASIC_FEATURES.includes(feature)),
  };
}

// ─── Subscribers ─────────────────────────────────────

type EntitlementsListener = (state: EntitlementState) => void;

const listeners = new Set<EntitlementsListener>();

/** Vue ref mirror of CURRENT_ENTITLEMENTS (updated by every emit). */
const entitlementsRef: Ref<EntitlementState> = ref(CURRENT_ENTITLEMENTS);

/**
 * Subscribe to entitlement changes (activation, re-lock, refresh). Returns
 * the unsubscribe function. Mirrors the mobile listener pattern.
 */
export function subscribeEntitlements(
  listener: EntitlementsListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitEntitlements(): void {
  entitlementsRef.value = CURRENT_ENTITLEMENTS;
  for (const listener of listeners) {
    listener(CURRENT_ENTITLEMENTS);
  }
}

/**
 * Vue composable: the live entitlement state as a ref. Components re-render
 * whenever a refresh or key change applies a new state.
 */
export function useEntitlements(): Ref<EntitlementState> {
  return entitlementsRef;
}

// ─── Entitlement key (payment receipt) ───────────────

/** The stored entitlement key, or null when none has been activated. */
export async function getEntitlementKey(): Promise<string | null> {
  try {
    const key = localStorage.getItem(ENTITLEMENT_KEY_STORAGE_KEY);
    return key !== null && key.trim().length > 0 ? key : null;
  } catch {
    return null;
  }
}

/**
 * Persist (or clear, with null) the entitlement key. Clearing also drops the
 * cached state and immediately re-locks to the local default — removing the
 * key is a local action and needs no network round-trip. Activating a new
 * key only stores it; call refreshEntitlements() to apply it.
 */
export async function setEntitlementKey(key: string | null): Promise<void> {
  const normalized = key !== null && key.trim().length > 0 ? key.trim() : null;
  if (normalized !== null) {
    try {
      localStorage.setItem(ENTITLEMENT_KEY_STORAGE_KEY, normalized);
    } catch {
      // Storage failure keeps the key in memory only — refresh still works.
    }
    return;
  }
  try {
    localStorage.removeItem(ENTITLEMENT_KEY_STORAGE_KEY);
    localStorage.removeItem(ENTITLEMENTS_CACHE_STORAGE_KEY);
  } catch {
    // Ignore — the in-memory re-lock below still applies.
  }
  CURRENT_ENTITLEMENTS = BASIC_ENTITLEMENTS;
  emitEntitlements();
}

// ─── Refresh ─────────────────────────────────────────

async function loadCachedEntitlements(): Promise<EntitlementState | null> {
  try {
    const raw = localStorage.getItem(ENTITLEMENTS_CACHE_STORAGE_KEY);
    if (raw === null) return null;
    return parseEntitlementState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function applyEntitlements(
  state: EntitlementState,
  source: EntitlementsRefreshSource,
): EntitlementsRefreshResult {
  CURRENT_ENTITLEMENTS = state;
  emitEntitlements();
  return { state, source };
}

/**
 * Pull the live entitlement state from the adapter and apply it.
 *
 *   source "network" — 200 + valid payload: applied, expiry-checked, cached.
 *   401              — the key is unknown or revoked: key + cache are cleared
 *                      and the app re-locks to Basic (source "basic").
 *   any other status — including 404 while the route is still undeployed —
 *                      falls back to the cached state (source "cache"), or
 *                      Basic when nothing is cached.
 *   fetch throws     — offline: same cache → Basic fallback chain.
 *
 * (Mobile has a fourth source, "fdroid", for the F-Droid flavor's local
 * all-features state; the web wallet has no store flavors.)
 *
 * fetchImpl is injectable for tests; defaults to the global fetch.
 */
export async function refreshEntitlements(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<EntitlementsRefreshResult> {
  const key = await getEntitlementKey();
  if (key === null) {
    return applyEntitlements(BASIC_ENTITLEMENTS, "basic");
  }

  try {
    const res = await fetchImpl(`${entitlementsBaseUrl()}/me/entitlements`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${key}`,
      },
    });
    if (res.ok) {
      const parsed = parseEntitlementState(await res.json());
      if (parsed !== null) {
        const checked = withExpiryCheck({
          ...parsed,
          checkedAt: new Date().toISOString(),
        });
        try {
          localStorage.setItem(
            ENTITLEMENTS_CACHE_STORAGE_KEY,
            JSON.stringify(checked),
          );
        } catch {
          // Cache write failure only costs the offline fallback.
        }
        return applyEntitlements(checked, "network");
      }
      // Malformed payload — fall through to the cached state.
    } else if (res.status === 401) {
      await setEntitlementKey(null);
      return { state: CURRENT_ENTITLEMENTS, source: "basic" };
    }
    // Every other status (404 while the route is undeployed, 5xx, …) falls
    // through to the cached state.
  } catch {
    // Offline — fall through to the cached state.
  }

  const cached = await loadCachedEntitlements();
  if (cached !== null) {
    return applyEntitlements(withExpiryCheck(cached), "cache");
  }
  return applyEntitlements(BASIC_ENTITLEMENTS, "basic");
}
