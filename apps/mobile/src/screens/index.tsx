// apps/mobile/src/screens/index.ts
//
// Screen registry for the Sidecoin React Native wallet.
//
// Phase 2 wires every route from apps/wallet/src/router/index.ts into the
// navigation shell. DashboardScreen is the real (carried-over) screen; the
// rest are staging placeholders that name their Vue source file. Each is
// replaced during Phase 4 (view port).

import React from "react";

import { DashboardScreen } from "./DashboardScreen";
import { PlaceholderScreen } from "./PlaceholderScreen";

/**
 * Every route name in the Vue router (`apps/wallet/src/router/index.ts`),
 * paired with the Vue file it is ported from. Keyed by route name so the port
 * progress is greppable.
 */
export const SCREEN_SOURCES = {
  onboarding: "apps/wallet/src/views/OnboardingView.vue",
  dashboard: "apps/wallet/src/views/DashboardView.vue",
  send: "apps/wallet/src/views/SendView.vue",
  receive: "apps/wallet/src/views/ReceiveView.vue",
  swap: "apps/wallet/src/views/AssetSwapView.vue",
  markets: "apps/wallet/src/views/MarketsView.vue",
  platforms: "apps/wallet/src/views/SidechainsView.vue",
  "platform-detail": "apps/wallet/src/views/PlatformDetailView.vue",
  hardware: "apps/wallet/src/views/HardwareWalletView.vue",
  toolbox: "apps/wallet/src/views/ToolboxView.vue",
  pro: "apps/wallet/src/views/ProBenefitsView.vue",
  settings: "apps/wallet/src/views/SettingsView.vue",
} as const;

export type ScreenKey = keyof typeof SCREEN_SOURCES;

export { DashboardScreen } from "./DashboardScreen";
export { PlaceholderScreen } from "./PlaceholderScreen";

/**
 * Build a placeholder screen component for a given route. Kept as a factory so
 * every placeholder is a stable, named component (React requires stable
 * identities across renders; an inline arrow would remount on every pass).
 *
 * The returned type accepts arbitrary navigator props because placeholders
 * take none; navigators pass route/navigation props regardless.
 */
export function makePlaceholder(
  key: ScreenKey,
  title: string,
  note?: string,
): React.ComponentType<object> {
  function Placeholder(): React.JSX.Element {
    return (
      <PlaceholderScreen title={title} source={SCREEN_SOURCES[key]} note={note} />
    );
  }
  Placeholder.displayName = `Placeholder(${key})`;
  return Placeholder;
}
