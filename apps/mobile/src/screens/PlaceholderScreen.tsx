// apps/mobile/src/screens/PlaceholderScreen.tsx
//
// Temporary staging screen used while the 12 Vue views are ported.
//
// Each screen names the Vue source file it will be replaced by, so the port
// progress is visible in the running app. The Dashboard is the only screen
// with real content in Phase 2 (it carries the shared-package validation that
// the app shipped with).

import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ECASH, GRAY, SC } from "../theme/colors";

export interface PlaceholderScreenProps {
  title: string;
  source: string;
  note?: string;
}

export function PlaceholderScreen({
  title,
  source,
  note,
}: PlaceholderScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <Text style={styles.title}>{title}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Port pending</Text>
        <Text style={styles.cardBody}>
          This screen is wired into the navigation shell. Its UI is ported from:
        </Text>
        <Text style={styles.source}>{source}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
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
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: SC.text,
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 12,
    backgroundColor: SC.surface,
    padding: 16,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: ECASH[400],
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 13,
    color: SC.textMuted,
    marginBottom: 8,
  },
  source: {
    fontSize: 12,
    fontFamily: "monospace",
    color: SC.text,
  },
  note: {
    marginTop: 12,
    fontSize: 12,
    color: SC.textMuted,
  },
});
