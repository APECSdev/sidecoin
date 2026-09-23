// apps/mobile/src/components/pro/ProStatusCard.tsx
//
// Ported 1:1 from apps/wallet/src/components/pro/ProStatusCard.vue.
//
// Two branches, exactly as in the Vue original:
//   • pro  -> amber "Sidecoin PRO" / "All platforms unlocked."
//   • else -> white "Sidecoin Basic" + a link to the PRO screen.
//
// The `router-link to="/pro"` becomes an optional onUpgrade callback; the
// entitlement decision itself is unchanged (isProPlan(CURRENT_ENTITLEMENTS)).

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { GRAY } from "../../theme/colors";
import { CURRENT_ENTITLEMENTS, isProPlan } from "../../entitlements";
import { Button } from "../ui";

export interface ProStatusCardProps {
  /** Navigate to the PRO benefits screen (Vue `router-link to="/pro"`). */
  onUpgrade?: () => void;
}

export function ProStatusCard({
  onUpgrade,
}: ProStatusCardProps): React.JSX.Element {
  const pro = isProPlan(CURRENT_ENTITLEMENTS);

  return (
    <View style={styles.card}>
      {pro ? (
        <View>
          <Text style={[styles.heading, styles.headingPro]}>Sidecoin PRO</Text>
          <Text style={styles.body}>All platforms unlocked.</Text>
        </View>
      ) : (
        <View>
          <Text style={styles.heading}>Sidecoin Basic</Text>
          <Text style={styles.body}>
            Core wallet tools are ready. Advanced platform workflows unlock from
            deeper product areas.
          </Text>
          <Button
            label="Upgrade to PRO"
            variant="ghost"
            size="sm"
            onPress={onUpgrade}
            style={styles.cta}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 12,
    backgroundColor: GRAY[900],
    padding: 12,
  },
  heading: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  headingPro: {
    color: "#fbbf24",
  },
  body: {
    marginTop: 4,
    fontSize: 12,
    color: GRAY[500],
  },
  cta: {
    marginTop: 12,
    alignSelf: "flex-start",
    borderColor: "#f59e0b99",
  },
});
