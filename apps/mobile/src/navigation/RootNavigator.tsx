// apps/mobile/src/navigation/RootNavigator.tsx
//
// Navigation shell — the React Native replacement for the flat hash router in
// apps/wallet/src/router/index.ts.
//
// Structure:
//   NativeStack (root)
//     ├─ "onboarding"        — full-screen, no tabs (always reachable)
//     └─ "main"              — the bottom tab shell
//          ├─ dashboard  (Home)
//          ├─ feed
//          ├─ explore
//          └─ platforms  (deliberately LAST)
//       pushed on top of the stack:
//          send, receive, settings, qr-scan, swap, markets, platform-detail,
//          hardware, toolbox, pro, profile
//
// Send, Receive, and Settings used to be tabs. They now live behind the
// floating action button (./components/FabMenu.tsx), which also adds QR scan and
// Profile actions; the tab bar keeps only the four primary destinations.
//
// FAB SCOPE (operator directive): the FAB is present on EVERY screen except
// "qr-scan" (the camera preview owns the viewport) and "onboarding" (no wallet
// exists yet). The tab shell draws its own FAB so it can clear the tab bar; the
// parent draws one for every other stack screen.
//
// The Vue router kept all 12 routes flat and always mounted a sidebar/footer
// with 9 links. RN splits primary destinations into a bottom tab bar and
// secondary screens into the stack, which is the platform-idiomatic layout.
//
// GATE PARITY: the Vue router had a global beforeEach that redirected to
// onboarding when `hasWallet()` was false. Here that is an effect on the root
// navigator, evaluated once at startup, because the RN keystore API is async
// (keychain-backed) whereas the Vue one was synchronous localStorage.

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { createBottomTabNavigator, BottomTabBar } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

import type { RootStackParamList, TabParamList } from "./types";
import { SC, ECASH, GRAY } from "../theme/colors";
import { hasWallet } from "../keystore";
import { FabMenu } from "../components/FabMenu";
import { HeaderAvatar } from "../components/HeaderAvatar";
import { navigationRef } from "./ref";

import {
  AssetSwapScreen,
  DashboardScreen,
  ExploreScreen,
  FeedScreen,
  MarketsScreen,
  OnboardingScreen,
  PlatformDetailScreen,
  ProBenefitsScreen,
  ProfileScreen,
  QrScanScreen,
  ReceiveScreen,
  SendScreen,
  SettingsScreen,
  SidechainsScreen,
  ToolboxScreen,
  makePlaceholder,
} from "../screens";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// ──────────────────────────────────────────────────────
// Stack screens pushed above the tab shell
// ──────────────────────────────────────────────────────
const SwapScreen = AssetSwapScreen;
const HardwareScreen = makePlaceholder(
  "hardware",
  "Hardware wallet",
  "Ledger / Trezor / OneKey (WebUSB in the web build — out of scope for the RN port).",
);

/**
 * Routes where the FAB must NOT render:
 *   • "main"       — the tab shell draws its own FAB so it can clear the bar.
 *   • "qr-scan"    — the camera preview owns the viewport and already has a
 *                    Close affordance; a floating button would cover the
 *                    viewfinder and could be tapped mid-scan.
 *   • "onboarding" — no wallet exists yet, so every FAB action is a dead end.
 */
const FAB_HIDDEN_ROUTES: readonly string[] = ["main", "qr-scan", "onboarding"];

// ──────────────────────────────────────────────────────
// Tab icon map — MaterialIcons names.
// ──────────────────────────────────────────────────────
const TAB_ICONS: Record<keyof TabParamList, string> = {
  dashboard: "dashboard",
  platforms: "layers",
  feed: "rss-feed",
  explore: "public",
};

function MainTabs(): React.JSX.Element {
  // Measured tab-bar height, reported by the wrapper View around the tab bar
  // below. Defaults to a sensible value so the FAB is positioned correctly
  // before the first layout pass.
  const [tabBarHeight, setTabBarHeight] = useState(64);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.tabsRoot}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: ECASH[400],
          tabBarInactiveTintColor: GRAY[500],
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name={TAB_ICONS[route.name as keyof TabParamList]}
              size={size}
              color={color}
            />
          ),
        })}
        // The default tab bar is wrapped so its real rendered height can be
        // measured and handed to the FAB (which floats above it).
        tabBar={(props) => (
          <View
            onLayout={(event) =>
              setTabBarHeight(event.nativeEvent.layout.height)
            }
          >
            <BottomTabBar {...props} />
          </View>
        )}
      >
        <Tab.Screen
          name="dashboard"
          component={DashboardScreen}
          options={{ tabBarLabel: "Home" }}
        />
        <Tab.Screen
          name="feed"
          component={FeedScreen}
          options={{ tabBarLabel: "Feed" }}
        />
        <Tab.Screen
          name="explore"
          component={ExploreScreen}
          options={{ tabBarLabel: "Explore" }}
        />
        {/*
          * Platforms is intentionally LAST: the requested tab order is
          * Home | Feed | Explore | Platforms. The browse-only platform list
          * anchors the trailing edge; the high-frequency destinations sit
          * closer to the thumb.
          */}
        <Tab.Screen
          name="platforms"
          component={SidechainsScreen}
          options={{ tabBarLabel: "Platforms" }}
        />
      </Tab.Navigator>

      {/*
       * The tab-shell FAB floats above the tab bar. It is rendered as a
       * sibling of the navigator (not inside a scene) so it stays put while
       * tabs switch.
       *
       * `bottomOffset` accounts for the Android navigation bar inset and the
       * measured tab bar so the FAB never overlaps the four tabs.
       */}
      <FabMenu bottomOffset={insets.bottom + tabBarHeight + 16} />
    </View>
  );
}

export function RootNavigator(): React.JSX.Element {
  const [booting, setBooting] = useState(true);
  const [walletPresent, setWalletPresent] = useState(false);
  const insets = useSafeAreaInsets();

  // Route name of the currently focused ROOT stack screen. Updated on every
  // navigation event so the FAB can hide itself on the excluded routes.
  const [stackRoute, setStackRoute] = useState<keyof RootStackParamList>("main");

  /**
   * Name of the topmost screen of the ROOT stack — i.e. "main" whenever a tab
   * is focused, not the tab's own name.
   *
   * `navigationRef.getCurrentRoute()` walks to the DEEPEST focused route, so
   * on the Platforms tab it returns "platforms". That value is never in
   * FAB_HIDDEN_ROUTES, so the root FAB rendered a SECOND floating button on
   * top of the tab shell's FAB — and, sitting at the bottom inset, it covered
   * the rightmost tab so Platforms could not be tapped. Reading the root
   * navigator's own state fixes both: the root route stays "main" while the
   * tabs are focused, so the stack-level FAB stays hidden and the tab bar is
   * unobstructed.
   */
  const readRootRoute = useCallback((): keyof RootStackParamList | null => {
    const state = navigationRef.getRootState();
    const route = state?.routes[state.index ?? 0];
    return (route?.name as keyof RootStackParamList) ?? null;
  }, []);

  // Subscribe to NavigationContainer route changes. The container owns the
  // onStateChange prop, so the ref is how this component observes it. The
  // listener fires after mount too, which seeds `stackRoute` correctly when the
  // app starts straight into onboarding.
  useEffect(() => {
    // Seed from the current state in case the container has already settled.
    setStackRoute((current) => readRootRoute() ?? current);
    return navigationRef.addListener("state", () => {
      const name = readRootRoute();
      if (name) setStackRoute(name);
    });
  }, [readRootRoute]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const present = await hasWallet();
      if (cancelled) return;
      setWalletPresent(present);
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Splash while the keychain-backed keystore is read.
  if (booting) {
    return (
      <View style={[styles.splash, { paddingTop: insets.top }]}>
        <Text style={styles.splashTitle} accessibilityLabel="Sidecoin">SidΞcoin</Text>
        <ActivityIndicator color={SC.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack.Navigator
        screenOptions={{
          headerStyle: styles.header,
          headerTintColor: SC.text,
          headerTitleStyle: styles.headerTitle,
          contentStyle: styles.stackContent,
          // Every stack screen carries the Profile avatar in the top right.
          // The four tab screens set headerShown:false and reach Profile via
          // the FAB instead, so this header applies only where a header exists.
          headerRight: () => <HeaderAvatar />,
        }}
        initialRouteName={walletPresent ? "main" : "onboarding"}
      >
        <Stack.Screen
          name="main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="send" component={SendScreen} options={{ title: "Send" }} />
        <Stack.Screen
          name="receive"
          component={ReceiveScreen}
          options={{ title: "Receive" }}
        />
        <Stack.Screen
          name="settings"
          component={SettingsScreen}
          options={{ title: "Settings" }}
        />
        <Stack.Screen
          name="qr-scan"
          component={QrScanScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="swap" component={SwapScreen} options={{ title: "Swap" }} />
        <Stack.Screen
          name="markets"
          component={MarketsScreen}
          options={{ title: "Markets" }}
        />
        <Stack.Screen
          name="platform-detail"
          component={PlatformDetailScreen}
          options={{ title: "Platform" }}
        />
        <Stack.Screen
          name="hardware"
          component={HardwareScreen}
          options={{ title: "Hardware Wallet" }}
        />
        <Stack.Screen
          name="toolbox"
          component={ToolboxScreen}
          options={{ title: "Toolbox" }}
        />
        <Stack.Screen name="pro" component={ProBenefitsScreen} options={{ title: "Pro" }} />
        <Stack.Screen
          name="profile"
          component={ProfileScreen}
          options={{ title: "Profile" }}
        />
        <Stack.Screen
          name="onboarding"
          component={OnboardingScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>

      {/**
       * FAB for stack screens.
       *
       * Rendered OUTSIDE Stack.Navigator so it persists across pushes instead
       * of remounting per route. The tab shell renders its own FAB (see
       * MainTabs) because that one must clear the tab bar; this one only has
       * to clear the Android navigation-bar inset.
       *
       * Hidden on FAB_HIDDEN_ROUTES — see the constant's doc comment.
       */}
      {!FAB_HIDDEN_ROUTES.includes(stackRoute) ? (
        <FabMenu bottomOffset={insets.bottom + 16} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  tabsRoot: {
    flex: 1,
    backgroundColor: SC.bg,
  },
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SC.bg,
    gap: 16,
  },
  splashTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: SC.primary,
  },
  header: {
    backgroundColor: SC.bg,
  },
  headerTitle: {
    color: SC.text,
    fontWeight: "600",
  },
  stackContent: {
    backgroundColor: SC.bg,
  },
  tabBar: {
    backgroundColor: SC.bg,
    borderTopColor: GRAY[800],
  },
  tabLabel: {
    fontSize: 11,
  },
});
