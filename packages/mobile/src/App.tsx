// packages/mobile/src/App.tsx
//
// Root application component for the Sidecoin wallet.
//
// This component sets up the global providers that every
// screen needs access to:
//
//   1. SafeAreaProvider — insets for notches/status bars
//   2. GestureHandlerRootView — required by react-native-gesture-handler
//   3. NavigationContainer — React Navigation context
//   4. QueryClientProvider — TanStack Query for async state
//
// The actual tab/stack navigation structure will be added
// in Phase 1 Step 1.2 (Navigation Shell).

import React from "react";
import { StatusBar, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ──────────────────────────────────────────────────────
// Shared package — validate workspace linking works
// ──────────────────────────────────────────────────────
import { ECASH_MAINNET } from "@sidecoin/shared/chain";
import { LAUNCH_SIDECHAINS } from "@sidecoin/shared/sidechains";
import { getForkCountdown } from "@sidecoin/shared/chain";

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

// ──────────────────────────────────────────────────────
// Placeholder home screen.
// This will be replaced by the navigation shell in the
// next scaffolding step.
// ──────────────────────────────────────────────────────
function PlaceholderHome(): React.JSX.Element {
  const countdown = getForkCountdown(ECASH_MAINNET);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>

        {/* ── App Title ── */}
        <Text style={styles.title}>Sidecoin</Text>
        <Text style={styles.subtitle}>eCash Drivechain Wallet</Text>

        {/* ── Fork Countdown ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fork Countdown</Text>
          {countdown.isPast ? (
            <Text style={styles.countdownText}>Fork is ACTIVE 🟢</Text>
          ) : (
            <Text style={styles.countdownText}>
              {countdown.days}d {countdown.hours}h {countdown.minutes}m {countdown.seconds}s
            </Text>
          )}
          <Text style={styles.detail}>
            Block ~{ECASH_MAINNET.fork.activationBlockHeight.toLocaleString()}
          </Text>
          <Text style={styles.detail}>
            {ECASH_MAINNET.fork.activationTimestampUtc}
          </Text>
        </View>

        {/* ── Chain Info ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chain</Text>
          <Text style={styles.detail}>
            PoW: {ECASH_MAINNET.consensus.powAlgorithm}
          </Text>
          <Text style={styles.detail}>
            BIP-300: {ECASH_MAINNET.fork.bip300Active ? "Active" : "Inactive"}
          </Text>
          <Text style={styles.detail}>
            BIP-301: {ECASH_MAINNET.fork.bip301Active ? "Active" : "Inactive"}
          </Text>
        </View>

        {/* ── Sidechains ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Sidechains ({LAUNCH_SIDECHAINS.length})
          </Text>
          {LAUNCH_SIDECHAINS.map((sc) => (
            <Text key={sc.slot} style={styles.detail}>
              #{sc.slot} {sc.displayName} — {sc.status}
            </Text>
          ))}
        </View>

        {/* ── Workspace Validation ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workspace</Text>
          <Text style={styles.successText}>
            ✅ @sidecoin/shared linked and working
          </Text>
        </View>

      </View>
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────
// Root App component
// ──────────────────────────────────────────────────────
function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer>
            <StatusBar
              barStyle="light-content"
              backgroundColor="#0D1117"
              translucent={false}
            />
            <PlaceholderHome />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ──────────────────────────────────────────────────────
// Styles — inline for the placeholder.
// Will be replaced by NativeWind className usage once
// the navigation shell is in place.
// ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#0D1117",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#F7931A",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#8B949E",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#161B22",
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#E6EDF3",
    marginBottom: 8,
  },
  detail: {
    fontSize: 13,
    color: "#8B949E",
    marginBottom: 2,
  },
  countdownText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#F7931A",
    marginBottom: 4,
  },
  successText: {
    fontSize: 13,
    color: "#3FB950",
  },
});

export default App;
