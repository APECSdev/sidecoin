// apps/mobile/src/components/pro/ProBadge.tsx
//
// Ported 1:1 from apps/wallet/src/components/pro/ProBadge.vue.
//
// The Vue original is a static amber pill with no props and no state — this
// is the same pill, rendered with React Native primitives.

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { GRAY } from "../../theme/colors";

export function ProBadge(): React.JSX.Element {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>PRO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#f59e0b",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: GRAY[950],
  },
});
