// apps/mobile/src/components/AlphaMeter.tsx
//
// Alpha balance meter for screen headers (Duolingo Energy pattern).
//
// Renders a compact pill — a colored gauge + the integer balance — for
// metered (free-tier) users, and NOTHING for unlimited plans (pro / founder
// / diamond) or the F-Droid flavor: the paid tier removes the meter.
//
// Tapping the pill opens an explainer modal: current balance, regen ETA,
// the drain/regen rules, the earn-back grant list, and a plain-text
// unlimited-PRO note (never a link — store policy, see
// infra/entitlements/HANDOFF-sidecoin-api.md §6).

import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import {
  ALPHA_CAP,
  ALPHA_GRANTS,
  ALPHA_TICK_MS,
  alphaBalanceWarning,
  alphaRegenEtaMinutes,
  formatAlphaBalance,
  isAlphaMetered,
  tickAlpha,
  useAlpha,
} from "../alpha";
import { useEntitlements } from "../entitlements";
import { ECASH, GRAY } from "../theme/colors";

function gaugeColor(balance: number): string {
  const warning = alphaBalanceWarning(balance);
  if (warning === "critical") return "#ef4444";
  if (warning === "low") return "#f59e0b";
  return "#22c55e";
}

function formatEta(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function AlphaMeter({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element | null {
  const entitlements = useEntitlements();
  const state = useAlpha();
  const [explainerOpen, setExplainerOpen] = useState(false);

  // The engine settles lazily (on reads) and reads deliberately do not emit,
  // so without a ticker the pill would show a stale number until some action
  // emits. Tick while mounted so the gauge visibly drains on a PRO screen
  // and refills while idle.
  useEffect(() => {
    const interval = setInterval(() => {
      tickAlpha(); // settle + persist + emit; subscribers re-render
    }, ALPHA_TICK_MS);
    // Node/Jest return a Timeout with unref(); RN returns a number. Unref
    // when possible so a leaked interval can never hold a process open.
    (interval as unknown as { unref?: () => void }).unref?.();
    return () => clearInterval(interval);
  }, []);

  if (!isAlphaMetered(entitlements)) return null;

  const balance = Math.max(0, Math.floor(state.balance));
  const fill = Math.max(0, Math.min(1, state.balance / ALPHA_CAP));
  const color = gaugeColor(state.balance);
  const eta = alphaRegenEtaMinutes();
  const draining = state.session != null;

  return (
    <>
      <Pressable
        testID="alpha-meter"
        accessibilityRole="button"
        accessibilityLabel={`Alpha balance ${balance} of ${ALPHA_CAP}`}
        onPress={() => setExplainerOpen(true)}
        style={({ pressed }) => [
          styles.pill,
          style,
          pressed && styles.pillPressed,
        ]}
      >
        <View style={styles.gaugeTrack}>
          <View
            style={[
              styles.gaugeFill,
              { width: `${Math.round(fill * 100)}%`, backgroundColor: color },
            ]}
          />
        </View>
        <Text style={[styles.pillText, { color }]}>
          {formatAlphaBalance(state.balance)}
        </Text>
      </Pressable>

      <Modal
        visible={explainerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExplainerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setExplainerOpen(false)}
          accessibilityLabel="Close Alpha explainer"
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Alpha</Text>
            <Text style={styles.sheetBalance} testID="alpha-explainer-balance">
              {formatAlphaBalance(state.balance)} / {ALPHA_CAP}
            </Text>
            <Text style={styles.sheetStatus}>
              {draining
                ? "Draining — you are using PRO features."
                : eta != null
                  ? `Replenishing — full in ${formatEta(eta)}.`
                  : "Full."}
            </Text>

            <Text style={styles.sheetHeading}>How it works</Text>
            <Text style={styles.sheetBody}>
              Alpha powers PRO features on the free tier. It drains while a PRO
              screen is open and when you run a PRO action, and replenishes
              slowly while you are not using them.
            </Text>

            <Text style={styles.sheetHeading}>Earn more</Text>
            {ALPHA_GRANTS.map((grant) => (
              <View key={grant.id} style={styles.grantRow}>
                <Text style={styles.grantText}>
                  +{grant.amount} — {grant.description}
                </Text>
                {state.claimedGrants.includes(grant.id) ? (
                  <Text style={styles.grantClaimed}>claimed</Text>
                ) : null}
              </View>
            ))}

            <Text style={styles.sheetFooter}>
              Sidecoin PRO subscribers get unlimited Alpha — PRO features never
              drain. Upgrade at <Text style={styles.sheetFooterUrl}>sidecoin.app/pro</Text>, then activate your key under
              Settings → Sidecoin PRO.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: GRAY[900],
    marginRight: 12,
  },
  pillPressed: {
    opacity: 0.7,
  },
  gaugeTrack: {
    width: 28,
    height: 6,
    borderRadius: 3,
    backgroundColor: GRAY[800],
    overflow: "hidden",
  },
  gaugeFill: {
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: GRAY[950],
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 16,
    padding: 20,
  },
  sheetTitle: {
    color: GRAY[500],
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  sheetBalance: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 6,
    fontVariant: ["tabular-nums"],
  },
  sheetStatus: {
    color: GRAY[400],
    fontSize: 13,
    marginTop: 4,
  },
  sheetHeading: {
    color: ECASH[400],
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 18,
  },
  sheetBody: {
    color: GRAY[300],
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  grantRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  grantText: {
    color: GRAY[300],
    fontSize: 13,
  },
  grantClaimed: {
    color: GRAY[600],
    fontSize: 11,
    fontStyle: "italic",
  },
  sheetFooterUrl: {
    color: ECASH[400],
    fontWeight: "700",
  },
  sheetFooter: {
    color: GRAY[500],
    fontSize: 12,
    lineHeight: 17,
    marginTop: 18,
  },
});
