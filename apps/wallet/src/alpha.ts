// apps/wallet/src/alpha.ts
//
// Alpha — the metered free tier for PRO features.
//
// Model (decided 2026-10-24, Duolingo Energy-pattern):
// - Everyone starts at ALPHA_CAP (100 Alpha ≈ 1 hour of foreground PRO use).
// - While a PRO screen is foregrounded, a metered (free-tier) user drains
//   ALPHA_DRAIN_PER_MINUTE. While NOT using PRO features, the balance
//   replenishes at ALPHA_REGEN_PER_MINUTE — deliberately ~12.5x slower than
//   the drain, so a full tank takes ~12.5 hours to recover.
// - Every PRO action also declares an explicit Alpha cost
//   (ALPHA_ACTION_COSTS). Reads are always free; only execution drains.
// - Earn-back grants (ALPHA_GRANTS) reward on-chain-verifiable behavior:
//   first L1 deposit, first broadcast, first platform deposit. Each claim is
//   one-time and all grants are capped at ALPHA_GRANT_DAILY_CAP per UTC day.
// - Paid plans (pro / founder / diamond) are UNLIMITED: no drain, no meter
//   UI (Duolingo Super pattern — the paid tier removes the meter; it does
//   not replace subscriptions). (Mobile also exempts the F-Droid flavor;
//   the web wallet has no store flavors, so no flavor check exists here.)
//
// The balance is client-side and optimistic for the testnet phase. Before
// mainnet, sidecoin-api becomes the ledger authority (GET /v1/me/alpha,
// POST /v1/me/alpha/events) — see infra/entitlements/HANDOFF-sidecoin-api.md
// §11. All rates live here as constants until the server config endpoint
// exists; they must stay adjustable without an app release after that.
//
// This file mirrors apps/mobile/src/alpha.ts 1:1 where the platform allows.
// Differences from the mobile original:
//   - Persistence is localStorage (synchronous) instead of AsyncStorage, so
//     loadAlphaState is a sync function instead of an exported Promise.
//   - useAlpha() returns a Vue Ref instead of a React hook value.

import { ref, type Ref } from "vue";

import {
  CURRENT_ENTITLEMENTS,
  canAccessFeature,
  isProPlan,
  platformFeatureId,
  type EntitlementState,
} from "./entitlements";

// ---------------------------------------------------------------------------
// Tunables (server-configurable once sidecoin-api ships the alpha ledger)
// ---------------------------------------------------------------------------

export const ALPHA_CAP = 100;
export const ALPHA_START_BALANCE = 100;

/** Foreground drain on PRO screens: 100 Alpha ≈ 60 minutes. */
export const ALPHA_DRAIN_PER_MINUTE = 100 / 60;

/** Idle replenishment: full tank 0→100 in ~12.5 hours (slower than drain). */
export const ALPHA_REGEN_PER_MINUTE = 8 / 60;

/** Low-balance UX thresholds (banner / meter color). */
export const ALPHA_LOW_WARNING = 25;
export const ALPHA_CRITICAL_WARNING = 10;

/** AlphaMeter poll interval: keeps the displayed integer live (the engine
 * settles lazily on reads, so nothing otherwise ticks the UI). */
export const ALPHA_TICK_MS = 20_000;

/**
 * Every PRO action declares its cost here. Reads (balances, history,
 * preview metrics) are free forever — only execution drains.
 */
export const ALPHA_ACTION_COSTS = {
  "wallet:coin-control:send": 15,
  "platform:workflow-run": 10,
} as const;

export type AlphaActionId = keyof typeof ALPHA_ACTION_COSTS;

export interface AlphaGrantDef {
  id: string;
  amount: number;
  description: string;
}

/**
 * Earn-back grants. Each is claimable ONCE per install and only with
 * on-chain-verifiable evidence (the caller supplies the proof; the engine
 * records the claim). All grants together are capped per UTC day.
 */
export const ALPHA_GRANTS: readonly AlphaGrantDef[] = [
  {
    id: "grant:first-l1-deposit",
    amount: 25,
    description: "First L1 deposit received",
  },
  {
    id: "grant:first-broadcast",
    amount: 20,
    description: "First transaction broadcast",
  },
  {
    id: "grant:first-platform-deposit",
    amount: 15,
    description: "First sidechain platform deposit",
    // DEFERRED (v26.10.24): no call site yet — the in-app platform deposit
    // flow is "in development", so nothing observes a confirmed L1→sidechain
    // deposit to fire this. Wire it where that flow lands (PlatformDetail).
  },
];

export const ALPHA_GRANT_DAILY_CAP = 50;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface AlphaSession {
  featureId: string;
  startedAt: number;
}

export interface AlphaState {
  /** Float internally; floor for display. */
  balance: number;
  /** Epoch ms of the last settle. */
  updatedAt: number;
  /** Active foreground PRO session, or null when not using PRO features. */
  session: AlphaSession | null;
  /** Grant ids already claimed (one-time each). */
  claimedGrants: string[];
  /** UTC day (YYYY-MM-DD) the daily grant counter belongs to. */
  grantDay: string;
  /** Total Alpha granted on grantDay. */
  grantDayTotal: number;
}

const STORAGE_KEY = "sidecoin.alpha.v1";

function defaultAlphaState(now: number): AlphaState {
  return {
    balance: ALPHA_START_BALANCE,
    updatedAt: now,
    session: null,
    claimedGrants: [],
    grantDay: utcDay(now),
    grantDayTotal: 0,
  };
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function clampBalance(value: number): number {
  if (!Number.isFinite(value)) return ALPHA_START_BALANCE;
  return Math.min(ALPHA_CAP, Math.max(0, value));
}

/**
 * Pure settle: apply elapsed time as drain (active session on a metered
 * plan) or regen (everyone else), clamp, and stamp updatedAt. Exported for
 * tests; module-level callers go through the live state helpers.
 */
export function settleAlphaState(
  state: AlphaState,
  now: number,
  metered: boolean,
): AlphaState {
  const elapsedMinutes = Math.max(0, (now - state.updatedAt) / 60_000);
  const delta = state.session
    ? metered
      ? -elapsedMinutes * ALPHA_DRAIN_PER_MINUTE
      : 0
    : elapsedMinutes * ALPHA_REGEN_PER_MINUTE;
  return {
    ...state,
    balance: clampBalance(state.balance + delta),
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Metering gate
// ---------------------------------------------------------------------------

/**
 * Whether the Alpha meter applies at all. Paid plans are unlimited
 * (Duolingo Super pattern): no drain, no meter UI. (Mobile also exempts the
 * F-Droid flavor; the web wallet has no store flavors.)
 */
export function isAlphaMetered(
  entitlements: EntitlementState = CURRENT_ENTITLEMENTS,
): boolean {
  return !isProPlan(entitlements);
}

// ---------------------------------------------------------------------------
// Live state + subscription bus
// ---------------------------------------------------------------------------

let ALPHA_STATE: AlphaState = defaultAlphaState(Date.now());

type AlphaListener = (state: AlphaState) => void;
const alphaListeners = new Set<AlphaListener>();

/** Vue ref mirror of ALPHA_STATE (updated by every emit). */
const alphaRef: Ref<AlphaState> = ref(ALPHA_STATE);

export function subscribeAlpha(listener: AlphaListener): () => void {
  alphaListeners.add(listener);
  return () => {
    alphaListeners.delete(listener);
  };
}

function emitAlpha(): void {
  alphaRef.value = ALPHA_STATE;
  for (const listener of alphaListeners) listener(ALPHA_STATE);
}

function settleNow(): void {
  ALPHA_STATE = settleAlphaState(ALPHA_STATE, Date.now(), isAlphaMetered());
}

function persistAlpha(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ALPHA_STATE));
  } catch {
    // Persistence failure keeps the in-memory balance for this session.
  }
}

function parseAlphaState(raw: string | null): AlphaState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AlphaState> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.balance !== "number") return null;
    if (typeof parsed.updatedAt !== "number") return null;
    const session =
      parsed.session &&
      typeof parsed.session === "object" &&
      typeof parsed.session.featureId === "string" &&
      typeof parsed.session.startedAt === "number"
        ? { featureId: parsed.session.featureId, startedAt: parsed.session.startedAt }
        : null;
    const claimedGrants = Array.isArray(parsed.claimedGrants)
      ? parsed.claimedGrants.filter((g): g is string => typeof g === "string")
      : [];
    const grantDay =
      typeof parsed.grantDay === "string" ? parsed.grantDay : utcDay(Date.now());
    const grantDayTotal =
      typeof parsed.grantDayTotal === "number" && parsed.grantDayTotal >= 0
        ? parsed.grantDayTotal
        : 0;
    return {
      balance: clampBalance(parsed.balance),
      updatedAt: parsed.updatedAt,
      session,
      claimedGrants,
      grantDay,
      grantDayTotal,
    };
  } catch {
    return null;
  }
}

/** Load the persisted balance once at module import (launch). Synchronous —
 * localStorage, unlike mobile's AsyncStorage, needs no await. */
export function loadAlphaState(): AlphaState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  const parsed = parseAlphaState(raw);
  if (parsed) {
    ALPHA_STATE = parsed;
    settleNow();
    emitAlpha();
  }
  return ALPHA_STATE;
}

// Module import = launch: restore the persisted balance immediately.
loadAlphaState();

/**
 * Current settled balance. Settles elapsed time on every read so callers
 * never observe a stale balance after the tab sat in the background.
 */
export function getAlphaBalance(): number {
  settleNow();
  return ALPHA_STATE.balance;
}

export function getAlphaState(): AlphaState {
  settleNow();
  return ALPHA_STATE;
}

/** Vue composable — a ref that updates on every balance/session/grant change. */
export function useAlpha(): Ref<AlphaState> {
  return alphaRef;
}

/**
 * Settle + persist + emit in one step — the AlphaMeter interval's callback.
 * Distinct from getAlphaState(), which deliberately does NOT emit: it runs
 * during renders (the meter render paths), where notifying subscribers
 * would trigger re-render mid-render.
 */
export function tickAlpha(): void {
  settleNow();
  persistAlpha();
  emitAlpha();
}

// ---------------------------------------------------------------------------
// Foreground PRO sessions (per-minute drain)
// ---------------------------------------------------------------------------

/**
 * Begin a foreground PRO session (PRO screen focused). No-op for unlimited
 * plans — subscribers never drain. Settles first so the previous idle
 * stretch is credited as regen before the drain starts.
 */
export function beginProSession(featureId: string): void {
  if (!isAlphaMetered()) return;
  settleNow();
  if (ALPHA_STATE.session) return;
  ALPHA_STATE = {
    ...ALPHA_STATE,
    session: { featureId, startedAt: Date.now() },
  };
  persistAlpha();
  emitAlpha();
}

/**
 * End the foreground PRO session (screen blurred/unmounted). Settles first
 * so the drain for the just-ended stretch is charged exactly once.
 */
export function endProSession(): void {
  if (!ALPHA_STATE.session) return;
  settleNow();
  ALPHA_STATE = { ...ALPHA_STATE, session: null };
  persistAlpha();
  emitAlpha();
}

// ---------------------------------------------------------------------------
// Action costs
// ---------------------------------------------------------------------------

export function alphaCostFor(actionId: AlphaActionId): number {
  return ALPHA_ACTION_COSTS[actionId];
}

/** True when the user may START the action (any positive balance). */
export function canAffordAction(actionId: AlphaActionId): boolean {
  if (!isAlphaMetered()) return true;
  void actionId;
  // Floor to the displayed integer: the number the meter shows IS the gate,
  // so a sub-1 regen residue cannot pass a check the user reads as "0".
  return Math.floor(getAlphaBalance()) > 0;
}

/**
 * Charge an action. Unlimited plans pass through free. Metered users are
 * floored at 0 — an in-flight action is never hard-blocked mid-flight, so a
 * cost larger than the remaining balance simply empties the tank. Returns
 * false only when the tank was already empty (caller should gate instead).
 */
export function spendAlpha(actionId: AlphaActionId): boolean {
  if (!isAlphaMetered()) return true;
  settleNow();
  if (Math.floor(ALPHA_STATE.balance) <= 0) return false;
  ALPHA_STATE = {
    ...ALPHA_STATE,
    balance: clampBalance(ALPHA_STATE.balance - ALPHA_ACTION_COSTS[actionId]),
  };
  persistAlpha();
  emitAlpha();
  return true;
}

// ---------------------------------------------------------------------------
// Earn-back grants (on-chain-verifiable)
// ---------------------------------------------------------------------------

export interface AlphaGrantResult {
  claimed: boolean;
  amount: number;
  reason?: "unknown" | "already-claimed" | "daily-cap";
}

/**
 * Record a grant after the caller has verified its on-chain evidence (e.g.
 * the first incoming Esplora tx for `grant:first-l1-deposit`). One-time per
 * grant id; all grants capped at ALPHA_GRANT_DAILY_CAP per UTC day.
 */
export function claimAlphaGrant(grantId: string): AlphaGrantResult {
  const def = ALPHA_GRANTS.find((g) => g.id === grantId);
  if (!def) return { claimed: false, amount: 0, reason: "unknown" };
  settleNow();
  if (ALPHA_STATE.claimedGrants.includes(grantId)) {
    return { claimed: false, amount: 0, reason: "already-claimed" };
  }
  const today = utcDay(Date.now());
  const dayTotal = ALPHA_STATE.grantDay === today ? ALPHA_STATE.grantDayTotal : 0;
  if (dayTotal + def.amount > ALPHA_GRANT_DAILY_CAP) {
    return { claimed: false, amount: 0, reason: "daily-cap" };
  }
  ALPHA_STATE = {
    ...ALPHA_STATE,
    balance: clampBalance(ALPHA_STATE.balance + def.amount),
    claimedGrants: [...ALPHA_STATE.claimedGrants, grantId],
    grantDay: today,
    grantDayTotal: dayTotal + def.amount,
  };
  persistAlpha();
  emitAlpha();
  return { claimed: true, amount: def.amount };
}

// ---------------------------------------------------------------------------
// UX helpers
// ---------------------------------------------------------------------------

/** Minutes until the tank refills completely; null when full or draining. */
export function alphaRegenEtaMinutes(): number | null {
  const state = getAlphaState();
  if (state.session) return null;
  if (state.balance >= ALPHA_CAP) return null;
  return Math.ceil((ALPHA_CAP - state.balance) / ALPHA_REGEN_PER_MINUTE);
}

export type AlphaBalanceWarning = "low" | "critical" | null;

export function alphaBalanceWarning(balance: number): AlphaBalanceWarning {
  if (balance <= ALPHA_CRITICAL_WARNING) return "critical";
  if (balance <= ALPHA_LOW_WARNING) return "low";
  return null;
}

/** Display form: integer floor, e.g. "87". */
export function formatAlphaBalance(balance: number): string {
  return String(Math.max(0, Math.floor(balance)));
}

// ---------------------------------------------------------------------------
// Combined gating: plan-unlimited OR Alpha-metered
// ---------------------------------------------------------------------------

/**
 * The free tier is Alpha-metered instead of hard-locked (Duolingo Energy
 * pattern): a basic-plan user reaches PRO features while the tank is
 * non-empty and hits the ProGate only at 0 Alpha.
 */
export function canUseProFeature(
  feature: string,
  entitlements: EntitlementState = CURRENT_ENTITLEMENTS,
): boolean {
  if (canAccessFeature(feature, entitlements)) return true;
  if (!isAlphaMetered(entitlements)) return false;
  return Math.floor(getAlphaBalance()) > 0;
}

export function canUseProPlatform(
  platformId: string,
  entitlements: EntitlementState = CURRENT_ENTITLEMENTS,
): boolean {
  return canUseProFeature(platformFeatureId(platformId), entitlements);
}
