// apps/mobile/src/screens/QrScanScreen.tsx
//
// Standalone QR-code scanner screen — the FAB menu's "Scan QR" action.
//
// Before this screen existed, the only way to reach a QR scan was inline from
// SendScreen (its own "Scan" button toggles a full-screen Modal wrapping the
// shared ./components/QrScanner.tsx). This screen exposes the same scanner as
// a first-class route so the floating action button can launch it from any
// tab.
//
// Behaviour: the shared QrScanner emits exactly one decoded value and closes;
// this screen copies that value to the clipboard, shows what was captured, and
// offers a single "Close" action back to the previous screen. It is a
// read-and-copy surface only — it does not parse the payload or touch keys.

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";

import { GRAY, SC } from "../theme/colors";
import { QrScanner } from "../components/QrScanner";
import { Body, Card, Eyebrow, Mono, Muted, Screen } from "../components/ui";
import type { RootStackScreenProps } from "../navigation/types";

export function QrScanScreen({
  navigation,
}: RootStackScreenProps<"qr-scan">): React.JSX.Element {
  const [captured, setCaptured] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);

  /**
   * The scanner calls this once with the decoded payload (its internal
   * multi-frame guard guarantees a single emit). Copy it so the user can paste
   * it into Send/Receive, then surface it for confirmation.
   */
  function onDecode(value: string): void {
    Clipboard.setString(value);
    setCaptured(value);
    setScanning(false);
  }

  if (scanning) {
    return (
      <QrScanner onDecode={onDecode} onClose={() => navigation.goBack()} />
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Scanned</Text>

      <Card tone="inset">
        <Eyebrow>Captured value</Eyebrow>
        <Mono style={styles.value}>{captured ?? "(empty)"}</Mono>
        <Muted style={styles.hint}>
          Copied to the clipboard. Paste it into Send or Receive.
        </Muted>
      </Card>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan another code"
          onPress={() => {
            setCaptured(null);
            setScanning(true);
          }}
          style={styles.scanAgain}
        >
          <Text style={styles.scanAgainText}>Scan another code</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
          onPress={() => navigation.goBack()}
          style={styles.close}
        >
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: SC.text,
    marginBottom: 16,
  },
  value: {
    marginTop: 8,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
  },
  actions: {
    marginTop: 16,
    gap: 12,
  },
  scanAgain: {
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: GRAY[900],
    borderWidth: 1,
    borderColor: GRAY[700],
    paddingVertical: 14,
  },
  scanAgainText: {
    fontSize: 16,
    fontWeight: "600",
    color: GRAY[200],
  },
  close: {
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: SC.primary,
    paddingVertical: 14,
  },
  closeText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
});
