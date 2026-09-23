// apps/mobile/src/screens/DashboardScreen.tsx
//
// Phase 2 staging version of apps/wallet/src/views/DashboardView.vue.
//
// This carries over the exact content the app shipped with before the
// navigation shell existed (fork countdown, chain info, sidechain list,
// workspace validation), so nothing regresses. The live balance / deposit /
// market-price fan-out from the Vue original is NOT ported yet — that depends
// on the API layer (Phase 3) and is deliberately out of scope here.

import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SC } from "../theme/colors";
import { ECASH_MAINNET, getForkCountdown } from "@sidecoin/shared/chain";
import { LAUNCH_SIDECHAINS } from "@sidecoin/shared/sidechains";

function formatSidechainSlot(slot: number | null): string {
  return slot == null ? "Slot TBD" : `#${slot}`;
}

export function DashboardScreen(): React.JSX.Element {
  const countdown = getForkCountdown(ECASH_MAINNET);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
      ]}
    >
      {/* ── App Title ── */}
      <Text style={styles.title} accessibilityLabel="Sidecoin">SidΞcoin</Text>
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
          <Text key={sc.id} style={styles.detail}>
            {formatSidechainSlot(sc.slot)} {sc.displayName} — {sc.status}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SC.bg,
  },
  content: {
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: SC.primary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: SC.textMuted,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: SC.surface,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: SC.text,
    marginBottom: 8,
  },
  detail: {
    fontSize: 13,
    color: SC.textMuted,
    marginBottom: 2,
  },
  countdownText: {
    fontSize: 20,
    fontWeight: "600",
    color: SC.primary,
    marginBottom: 4,
  },
  successText: {
    fontSize: 13,
    color: SC.success,
  },
});
