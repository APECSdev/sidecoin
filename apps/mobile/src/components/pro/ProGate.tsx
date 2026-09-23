// apps/mobile/src/components/pro/ProGate.tsx
//
// Ported 1:1 from apps/wallet/src/components/pro/ProGate.vue.
//
// Presents a PRO upsell panel: a title, a description, a grid of benefits,
// and two calls to action. In the Vue app those CTAs were anchors to `#/pro`
// (the /pro route). React Navigation has no href, so the component takes two
// optional callbacks and renders the same buttons. The copy is unchanged.
//
// The Vue original renders a two-column benefit grid at the `sm` breakpoint;
// a phone is always narrower than `sm`, so the RN version stacks them in a
// single column, matching the Vue layout at mobile widths.

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { GRAY } from "../../theme/colors";
import { Button } from "../ui";
import { ProBadge } from "./ProBadge";

export interface ProGateProps {
  title: string;
  description: string;
  benefits: string[];
  cta?: string;
  /** Navigate to the PRO benefits screen (Vue `href="#/pro"`). */
  onUpgrade?: () => void;
}

export function ProGate({
  title,
  description,
  benefits,
  cta,
  onUpgrade,
}: ProGateProps): React.JSX.Element {
  const handlePress = onUpgrade;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <ProBadge />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      <View style={styles.benefits}>
        {benefits.map((benefit) => (
          <View key={benefit} style={styles.benefit}>
            <Text style={styles.benefitText}>
              <Text style={styles.check}>✓ </Text>
              {benefit}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.ctas}>
        <Button
          label={cta ?? "Upgrade to PRO"}
          variant="pro"
          onPress={handlePress}
        />
        <Button
          label="View PRO benefits"
          variant="secondary"
          onPress={handlePress}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderWidth: 1,
    borderColor: "#f59e0b66",
    borderRadius: 16,
    backgroundColor: "#1a1206",
    padding: 20,
  },
  header: {
    marginBottom: 4,
  },
  title: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
  },
  description: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    color: GRAY[300],
  },
  benefits: {
    marginTop: 20,
    gap: 12,
  },
  benefit: {
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 12,
    backgroundColor: "#030712b3",
    padding: 12,
  },
  benefitText: {
    fontSize: 13,
    color: GRAY[300],
  },
  check: {
    color: "#f59e0b",
  },
  ctas: {
    marginTop: 20,
    gap: 12,
  },
});
