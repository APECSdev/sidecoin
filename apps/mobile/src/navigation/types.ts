// apps/mobile/src/navigation/types.ts
//
// Navigation type map for the Sidecoin wallet.
//
// The route names mirror apps/wallet/src/router/index.ts, so the ported
// screens keep their route identity. The Vue app used a flat hash router with
// 12 routes; the RN app splits these across a bottom tab bar (primary) and a
// native stack (secondary/detail screens plus onboarding).
//
// Tab routes (always reachable from the tab bar):
//   dashboard, platforms, feed, explore
//
// Stack routes pushed on top of the tab shell:
//   send, receive, settings, qr-scan, swap, markets, platform-detail,
//   hardware, toolbox, pro
//
// Onboarding is a stack route rendered INSTEAD of the tab shell when no
// wallet is stored (the Vue router's beforeEach gate).
//
// send/receive/settings used to be tab routes; they were moved behind the
// floating action button (./components/FabMenu.tsx) so the tab bar carries
// only the four primary destinations. They remain stack routes so the push
// navigates to the same ported screens.

import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

/** Screens inside the bottom tab shell. */
export type TabParamList = {
  dashboard: undefined;
  platforms: undefined;
  feed: undefined;
  explore: undefined;
};

/** Top-level native stack. "main" hosts the tab shell. */
export type RootStackParamList = {
  main: NavigatorScreenParams<TabParamList> | undefined;
  onboarding: undefined;
  send: undefined;
  receive: undefined;
  settings: undefined;
  "qr-scan": undefined;
  swap: undefined;
  markets: undefined;
  "platform-detail": { platformId: string };
  hardware: undefined;
  toolbox: undefined;
  pro: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> =
  BottomTabScreenProps<TabParamList, T>;
