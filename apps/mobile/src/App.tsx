// apps/mobile/src/App.tsx
//
// Root application component for the Sidecoin wallet.
//
// This component sets up the global providers that every screen needs:
//
//   1. SafeAreaProvider — insets for notches/status bars
//   2. GestureHandlerRootView — required by react-native-gesture-handler
//   3. NavigationContainer — React Navigation context
//   4. QueryClientProvider — TanStack Query for async state
//
// It also refreshes entitlements from the adapter once per launch
// (no-op on F-Droid, offline, or without a stored entitlement key).
//
// The navigator itself (bottom tabs + native stack) lives in
// ./navigation/RootNavigator.tsx.
//
// PORT NOTE: the Vue app mounted a persistent sidebar (desktop) plus a
// scrolling footer link bar (mobile) around <RouterView/>. RN uses the
// idiomatic bottom tab bar + native stack instead; that shell is the
// equivalent surface.

import React, { useEffect } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ──────────────────────────────────────────────────────
// Sentry — conditional init (no-ops on F-Droid builds)
// ──────────────────────────────────────────────────────
import { initSentry } from "./lib/sentry";

// ──────────────────────────────────────────────────────
// Entitlements — live plan state (Basic until a key activates)
// ──────────────────────────────────────────────────────
import { refreshEntitlements } from "./entitlements";

// ──────────────────────────────────────────────────────
// Navigation shell
// ──────────────────────────────────────────────────────
import { RootNavigator } from "./navigation/RootNavigator";
import { navigationRef } from "./navigation/ref";
import { navigationTheme } from "./navigation/theme";
import { SC } from "./theme/colors";

// ──────────────────────────────────────────────────────
// Initialize Sentry as early as possible.
// On F-Droid (fdroid flavor) this is a safe no-op.
// ──────────────────────────────────────────────────────
initSentry();

// ──────────────────────────────────────────────────────
// TanStack Query client — global instance.
// Persisted query cache can be added later via
// @tanstack/query-async-storage-persister.
// ──────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,       // 30 seconds
      gcTime: 5 * 60_000,      // 5 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
    },
  },
});

function App(): React.JSX.Element {
  // Query /v1/me/entitlements on launch. With no stored key this short-
  // circuits to the local Basic default; offline it falls back to the cache.
  useEffect(() => {
    void refreshEntitlements();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {/*
           * theme= is REQUIRED for dark mode. Without it React Navigation
           * applies its light DefaultTheme (background rgb(242,242,242)),
           * which paints the navigator gutter white around dark screens.
           */}
          <NavigationContainer ref={navigationRef} theme={navigationTheme}>
            <StatusBar
              barStyle="light-content"
              backgroundColor={SC.bg}
              translucent={false}
            />
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
