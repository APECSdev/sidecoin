// apps/mobile/src/screens/OnboardingScreen.tsx
//
// Ported from apps/wallet/src/views/OnboardingView.vue.
//
// Ported 1:1 with the following, unavoidable platform differences:
//   • `saveWallet` is ASYNC in the RN keystore (keychain-backed) whereas the
//     Vue one was synchronous localStorage, so `finish` is now async and the
//     Continue / Import buttons show a busy state while it writes.
//   • Navigation: the Vue view called `router.push({ name: "dashboard" })`;
//     here we `replace("main")` on the root stack, which both enters the tab
//     shell and drops onboarding from the back stack (the Vue hash router
//     left it reachable — the RN stack intentionally does not).
//   • The warning banner text is updated: the Vue copy said the phrase is
//     "stored unencrypted in this browser". That is not true of this app —
//     see apps/mobile/src/keystore.ts, which stores the mnemonic in the
//     platform keychain (encrypted at rest) and defaults to betanet.
//   • The checkbox is a pressable row (RN has no <input type="checkbox">).

import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { generateMnemonic, validateMnemonic } from "@sidecoin/shared";

import { saveWallet } from "../keystore";
import type { RootStackParamList } from "../navigation/types";
import { ECASH, GRAY, SC } from "../theme/colors";
import { Alert, Body, Button, Card, Field, Title } from "../components/ui";

type Mode = "choose" | "generate" | "import";

export function OnboardingScreen(): React.JSX.Element {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [mode, setMode] = useState<Mode>("choose");

  // generate flow
  const [generated, setGenerated] = useState("");
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const words = useMemo(
    () => (generated ? generated.split(" ").filter(Boolean) : []),
    [generated],
  );

  // import flow
  const [imported, setImported] = useState("");
  const importValid = useMemo(() => validateMnemonic(imported), [imported]);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function startGenerate(): void {
    setGenerated(generateMnemonic(128));
    setSavedConfirmed(false);
    setMode("generate");
  }

  async function finish(mnemonic: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await saveWallet(mnemonic);
      navigation.replace("main");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Title style={styles.heading}>Set up your wallet</Title>
      <Body style={styles.sub}>
        eCash Drivechains · Betanet test wallet
      </Body>

      <Alert tone="warning" style={styles.warn}>
        ⚠️ Test wallet. The recovery phrase is encrypted in this device's
        keystore. Do not use a real-funds phrase.
      </Alert>

      {/* Choose */}
      {mode === "choose" ? (
        <View style={styles.choose}>
          <Button label="Generate a new phrase" onPress={startGenerate} fullWidth />
          <Button
            label="Import an existing phrase"
            variant="secondary"
            onPress={() => setMode("import")}
            fullWidth
          />
        </View>
      ) : null}

      {/* Generate */}
      {mode === "generate" ? (
        <View style={styles.flow}>
          <Card tone="inset" style={styles.wordsCard}>
            <View style={styles.wordsWrap}>
              {words.map((w, i) => (
                <View key={`${i}-${w}`} style={styles.wordPill}>
                  <Text style={styles.wordText}>
                    <Text style={styles.wordIndex}>{i + 1}. </Text>
                    {w}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: savedConfirmed }}
            onPress={() => setSavedConfirmed((v) => !v)}
            style={styles.checkRow}
          >
            <View
              style={[styles.checkbox, savedConfirmed ? styles.checkboxOn : null]}
            >
              {savedConfirmed ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.checkLabel}>
              I have written down my recovery phrase.
            </Text>
          </Pressable>

          <View style={styles.row}>
            <Button
              label="Back"
              variant="ghost"
              onPress={() => setMode("choose")}
            />
            <Button
              label="Continue"
              onPress={() => finish(generated)}
              disabled={!savedConfirmed}
              loading={busy}
              style={styles.grow}
            />
          </View>
        </View>
      ) : null}

      {/* Import */}
      {mode === "import" ? (
        <View style={styles.flow}>
          <Field
            label="Recovery phrase"
            value={imported}
            onChangeText={setImported}
            placeholder="Enter your 12 or 24 word phrase"
            multiline
          />
          {imported && !importValid ? (
            <Text style={styles.invalid}>Not a valid BIP-39 phrase.</Text>
          ) : null}

          <View style={styles.row}>
            <Button
              label="Back"
              variant="ghost"
              onPress={() => setMode("choose")}
            />
            <Button
              label="Import"
              onPress={() => finish(imported)}
              disabled={!importValid}
              loading={busy}
              style={styles.grow}
            />
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SC.bg,
    paddingHorizontal: 20,
    paddingTop: 32,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  heading: {
    fontSize: 24,
    marginTop: 0,
  },
  sub: {
    fontSize: 13,
    color: GRAY[500],
    marginTop: 4,
  },
  warn: {
    marginTop: 16,
  },
  choose: {
    marginTop: 24,
    gap: 12,
  },
  flow: {
    marginTop: 24,
    gap: 16,
  },
  wordsCard: {
    padding: 16,
  },
  wordsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  wordPill: {
    backgroundColor: GRAY[800],
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wordText: {
    fontFamily: "monospace",
    fontSize: 13,
    color: GRAY[200],
  },
  wordIndex: {
    color: GRAY[600],
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: GRAY[600],
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: ECASH[500],
    borderColor: ECASH[500],
  },
  checkmark: {
    color: GRAY[950],
    fontSize: 14,
    fontWeight: "900",
  },
  checkLabel: {
    flexShrink: 1,
    fontSize: 13,
    color: GRAY[300],
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  grow: {
    flex: 1,
  },
  invalid: {
    fontSize: 12,
    color: "#f87171",
    marginTop: -6,
  },
  error: {
    marginTop: 16,
    fontSize: 13,
    color: "#f87171",
  },
});
