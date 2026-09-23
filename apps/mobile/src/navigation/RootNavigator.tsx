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
//          ├─ platforms
//          ├─ feed       (mock)
//          └─ explore    (mock)
//       pushed on top of the stack:
//          send, receive, settings, qr-scan, swap, markets, platform-detail,
//          hardware, toolbox, pro
//
// Send, Receive, and Settings used to be tabs. They now live behind the
// floating action button (./components/FabMenu.tsx), which also adds a QR scan
// route; the tab bar keeps only the four primary destinations.
//
// The Vue router kept all 12 routes flat and always mounted a sidebar/footer
// with 9 links. RN splits primary destinations into a bottom tab bar and
// secondary screens into the stack, which is the platform-idiomatic layout.
//
// GATE PARITY: the Vue router had a global beforeEach that redirected to
// onboarding when `hasWallet()` was false. Here that is an effect on the root
// navigator, evaluated once at startup, because the RN keystore API is async
// (keychain-backed) whereas the Vue one was synchronous localStorage.

import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { createBottomTabNavigator, BottomTabBar } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

import type { RootStackParamList, TabParamList } from "./types";
import { SC, ECASH, GRAY } from "../theme/colors";
import { hasWallet } from "../keystore";
import { FabMenu } from "../components/FabMenu";

import {
  AssetSwapScreen,
  DashboardScreen,
  ExploreScreen,
  FeedScreen,
  MarketsScreen,
  OnboardingScreen,
  PlatformDetailScreen,
  ProBenefitsScreen,
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
// Tab screens
// ──────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────
// Stack screens pushed above the tab shell
// ──────────────────────────────────────────────────────
const SwapScreen = AssetSwapScreen;
const HardwareScreen = makePlaceholder(
  "hardware",
  "Hardware wallet",
  "Ledger / Trezor / OneKey (WebUSB in the web build — out of scope for the RN port).",
);

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
          name="platforms"
          component={SidechainsScreen}
          options={{ tabBarLabel: "Platforms" }}
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
      </Tab.Navigator>

      {/*
       * The FAB floats above the tab bar. It is rendered as a sibling of the
       * navigator (not inside a scene) so it stays put while tabs switch, and
       * it disappears entirely once a stack screen covers "main".
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
    <Stack.Navigator
      screenOptions={{
        headerStyle: styles.header,
        headerTintColor: SC.text,
        headerTitleStyle: styles.headerTitle,
        contentStyle: styles.stackContent,
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
        name="onboarding"
        component={OnboardingScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
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
