// apps/mobile/src/components/FabMenu.tsx
//
// Floating action button (FAB) for the Sidecoin wallet shell.
//
// The wallet used to carry Send, Receive, and Settings in the bottom tab bar,
// which made five tabs and buried the secondary destinations. They now live
// behind this FAB, and the tab bar keeps only the four primary destinations
// (Home, Feed, Explore, Platforms — Platforms is deliberately last). The FAB
// also exposes Profile and QR scan actions.
//
// Behaviour:
//   • collapsed  — a single round "+" button floating above the tab bar
//   • expanded   — the same button rotates to "×", a scrim covers the screen,
//                  and one action row per destination fades in above it
//   • the scrim (or a second press on the FAB) dismisses the menu
//
// POSITIONING NOTE: this component is rendered as a sibling of the tab
// navigator (so it floats above every tab), NOT inside a tab scene. React
// Navigation's `useBottomTabBarHeight()` reads a context that wraps only the
// scenes, so calling it here would throw. The caller therefore measures the
// tab bar and passes its height down as `bottomOffset`.

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

import { ECASH, GRAY, SC } from "../theme/colors";
import type { RootStackParamList } from "../navigation/types";

/** One FAB destination: a MaterialIcons glyph, a label, and a stack route. */
interface FabAction {
  /** MaterialIcons glyph name. */
  icon: string;
  /** Visible label. */
  label: string;
  /** Stack route to push. */
  route: keyof RootStackParamList;
  /**
   * Stable identifier for this action. Serves triple duty: React list key,
   * accessibility-free discriminator, and the suffix of the rendered testID
   * (see the `fab-action-*` testID below). Named for what it identifies, not
   * for the test that queries it.
   */
  actionId: string;
}

/**
 * Menu order, top-to-bottom as rendered. Send/Receive/Settings were the three
 * destinations removed from the tab bar; Scan QR is the added scanner entry.
 */
const FAB_ACTIONS: FabAction[] = [
  { icon: "send", label: "Send", route: "send", actionId: "send" },
  { icon: "qr-code", label: "Receive", route: "receive", actionId: "receive" },
  { icon: "person", label: "Profile", route: "profile", actionId: "profile" },
  { icon: "settings", label: "Settings", route: "settings", actionId: "settings" },
  { icon: "qr-code-scanner", label: "Scan QR", route: "qr-scan", actionId: "scan" },
];

export interface FabMenuProps {
  /**
   * Distance in px from the bottom of the screen to the FAB's bottom edge.
   * The caller passes the measured tab-bar height plus a gap.
   */
  bottomOffset: number;
}

export function FabMenu({ bottomOffset }: FabMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  function go(route: keyof RootStackParamList): void {
    setOpen(false);
    // Routes live on the parent stack; the tab navigator bubbles the action up.
    navigation.navigate(route as never);
  }

  return (
    <>
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          testID="fab-scrim"
          style={styles.scrim}
          onPress={() => setOpen(false)}
        />
      ) : null}

      <View
        pointerEvents="box-none"
        testID="fab-container"
        style={[styles.container, { bottom: bottomOffset }]}
      >
        {open ? (
          <View style={styles.actions}>
            {FAB_ACTIONS.map((action) => (
              <Pressable
                key={action.actionId}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                testID={`fab-action-${action.actionId}`}
                onPress={() => go(action.route)}
                style={styles.action}
              >
                <Text style={styles.actionLabel}>{action.label}</Text>
                <View style={styles.actionIcon}>
                  <MaterialIcons
                    name={action.icon}
                    size={20}
                    color={SC.text}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? "Close menu" : "Open menu"}
          testID="fab-toggle"
          onPress={() => setOpen((value) => !value)}
          style={styles.fab}
        >
          <MaterialIcons
            name={open ? "close" : "add"}
            size={28}
            color="#ffffff"
          />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  container: {
    position: "absolute",
    right: 16,
    alignItems: "flex-end",
    gap: 12,
  },
  actions: {
    alignItems: "flex-end",
    gap: 12,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: SC.text,
    backgroundColor: GRAY[900],
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    overflow: "hidden",
  },
  actionIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: GRAY[700],
    backgroundColor: SC.surface,
  },
  fab: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
    height: 60,
    borderRadius: 9999,
    backgroundColor: ECASH[600],
    elevation: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
