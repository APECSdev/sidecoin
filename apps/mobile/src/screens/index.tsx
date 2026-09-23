// apps/mobile/src/screens/index.ts
//
// Screen registry for the Sidecoin React Native wallet.
//
// Every route from apps/wallet/src/router/index.ts is wired into the
// navigation shell. Each entry below records the Vue file it is ported from,
// so the port progress is greppable:
//
//   Phase 4 (view port) replaces the staging placeholders one batch at a time.
//   Ported so far: dashboard, onboarding, markets, pro, platforms (4b),
//                  receive (4b), swap (4b), toolbox (4b), settings (4c),
//                  send (4c), platform-detail (4d).
//   Still staged:  hardware.

import React from "react";

import { AssetSwapScreen } from "./AssetSwapScreen";
import { DashboardScreen } from "./DashboardScreen";
import { MarketsScreen } from "./MarketsScreen";
import { OnboardingScreen } from "./OnboardingScreen";
import { PlaceholderScreen } from "./PlaceholderScreen";
import { PlatformDetailScreen } from "./PlatformDetailScreen";
import { ProBenefitsScreen } from "./ProBenefitsScreen";
import { ReceiveScreen } from "./ReceiveScreen";
import { SendScreen } from "./SendScreen";
import { SidechainsScreen } from "./SidechainsScreen";
import { SettingsScreen } from "./SettingsScreen";
import { ToolboxScreen } from "./ToolboxScreen";

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

export { AssetSwapScreen } from "./AssetSwapScreen";
export { DashboardScreen } from "./DashboardScreen";
export { MarketsScreen } from "./MarketsScreen";
export { OnboardingScreen } from "./OnboardingScreen";
export { PlaceholderScreen } from "./PlaceholderScreen";
export { PlatformDetailScreen } from "./PlatformDetailScreen";
export { ProBenefitsScreen } from "./ProBenefitsScreen";
export { ReceiveScreen } from "./ReceiveScreen";
export { SendScreen } from "./SendScreen";
export { SidechainsScreen } from "./SidechainsScreen";
export { SettingsScreen } from "./SettingsScreen";
export { ToolboxScreen } from "./ToolboxScreen";

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
