// packages/wallet/src/entitlements.ts
//
// Centralized feature access model.
//
// Backend integration plan:
// - Replace CURRENT_ENTITLEMENTS with a Pinia store populated by backend.
// - Query /v1/me/entitlements on launch and before gated actions.
// - Re-lock features when backend returns inactive/expired.
// - Keep Basic defaults local so the wallet remains usable offline.

export type Plan = "basic" | "pro" | "founder" | "alpha";
export type EntitlementStatus = "active" | "inactive" | "grace" | "unknown";

export interface EntitlementState {
  plan: Plan;
  status: EntitlementStatus;
  features: string[];
  expiresAt: string | null;
  checkedAt: string | null;
}

export const BASIC_PLATFORM_IDS = ["thunder", "bitnames"];

export const PRO_PLATFORM_IDS = [
  "zside",
  "bitassets",
  "photon",
  "truthcoin",
  "coinshift",
  "riscy",
  "elementsplus",
];

export const COIN_CONTROL_FEATURE_ID = "wallet:coin-control";

export const BASIC_FEATURES = [
  "l1",
  "swap",
  "toolbox",
  "hardware:read",
  "platform:thunder",
  "platform:bitnames",
];

export const PRO_FEATURES = [
  "platform:zside",
  "platform:bitassets",
  "platform:photon",
  "platform:truthcoin",
  "platform:coinshift",
  "platform:riscy",
  "platform:elementsplus",
  "hardware:signing",
  "analytics:historical",
  "platforms:early-access",
  COIN_CONTROL_FEATURE_ID,
];

export const CURRENT_ENTITLEMENTS: EntitlementState = {
  plan: "basic",
  status: "active",
  features: BASIC_FEATURES,
  expiresAt: null,
  checkedAt: null,
};

export function platformFeatureId(platformId: string): string {
  return `platform:${platformId}`;
}

export function isProPlan(entitlements = CURRENT_ENTITLEMENTS): boolean {
  return ["pro", "founder", "alpha"].includes(entitlements.plan)
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
