// apps/mobile/src/screens/SettingsScreen.tsx
//
// Ported from apps/wallet/src/views/SettingsView.vue.
//
// Ported 1:1. The L1 network selector (persisted to the keystore), the adapter
// base URL form, the appearance/theme selector, the Demo Mode toggle with its
// explainer modal, the Founder identity key (NIP-06), and the collapsed debug
// info are all carried over. All five sections keep their exact copy and
// behaviour.
//
// Platform substitutions, no logic loss:
//   • loadWallet / setWalletNetwork / getWalletTheme / setWalletTheme /
//     isDemoModeEnabled / setDemoMode are ASYNC in the RN port (keychain +
//     AsyncStorage), so onMount and the handlers await them.
//   • `navigator.clipboard.writeText` -> Clipboard.setString.
//   • `window`-dispatched theme/demo/network events -> this screen writes
//     through the shared helpers which emit to their in-memory listener sets.
//   • `<details>` debug block -> a pressable disclosure (RN has no <details>).
//   • The Demo Mode explainer modal is an RN Modal (the Vue one was a fixed
//     overlay div).
//   • The Vue `fixed inset-0 … backdrop-blur` overlay has no RN analogue; a
//     transparent Modal with a dimmed backdrop container is the idiomatic
//     equivalent.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Clipboard from "@react-native-clipboard/clipboard";
import { DEFAULT_BASE_URL } from "@sidecoin/api-client";
import { deriveNostrIdentityKey } from "@sidecoin/shared";

import { getApiBaseUrl, setApiBaseUrl } from "../api";
import { loadWallet, setWalletNetwork, type WalletNetwork } from "../keystore";
import { isDemoModeEnabled, setDemoMode } from "../demo";
import {
  WALLET_THEMES,
  getWalletTheme,
  setWalletTheme,
  type WalletTheme,
} from "../theme";
import type { RootStackParamList } from "../navigation/types";
import { ECASH, GRAY, SC } from "../theme/colors";
import {
  Alert,
  Badge,
  Body,
  Button,
  Card,
  Mono,
  Muted,
  Title,
} from "../components/ui";

// ─── Network selector (Betanet / Signet) ────────
// Persists the wallet's L1 network to the keystore. Both are
// non-production (betanet = the ECX beta practice network, the wallet
// default; signet = the live L2L signet). Betanet is a mainnet fork from
// drivechain.dev/config. Switching emits the wallet-network listener so the
// Dashboard and Receive re-derive / re-fetch for the new network immediately.
const NETWORK_OPTIONS: { id: WalletNetwork; label: string; description: string }[] = [
  { id: "betanet", label: "Betanet", description: "ECX beta practice network (mainnet fork) — the default." },
  { id: "signet", label: "Signet", description: "Live L2L signet — the default test network." },
];

export function SettingsScreen(): React.JSX.Element {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [nodeUrl, setNodeUrl] = useState("");
  const [electrumUrl, setElectrumUrl] = useState("tcp://127.0.0.1:50001");
  const [saved, setSaved] = useState(false);
  const [usingDefault, setUsingDefault] = useState(true);
  const [demoMode, setDemoModeState] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<WalletTheme>("default");
  const [showDemoModeExplainer, setShowDemoModeExplainer] = useState(false);

  const [selectedNetwork, setSelectedNetwork] = useState<WalletNetwork>("betanet");
  const [networkSaved, setNetworkSaved] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);

  // ─── Founder Identity Key (NIP-06 Nostr key) ────────────────
  // Derived locally from the wallet mnemonic at m/44'/1237'/0'/0/0. This is the
  // canonical Founder identity: copy it here and paste it at sidecoin.app/pro.
  // Only the PUBLIC key is ever shown; the private half never leaves derivation.
  const [identityKey, setIdentityKey] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const networkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (networkTimer.current) clearTimeout(networkTimer.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const currentUrl = getApiBaseUrl();
      if (cancelled) return;
      if (currentUrl) {
        setNodeUrl(currentUrl);
      }
      setUsingDefault(getApiBaseUrl() === "");
      setDemoModeState(await isDemoModeEnabled());
      if (cancelled) return;
      setSelectedTheme(await getWalletTheme());
      if (cancelled) return;

      try {
        const wallet = await loadWallet();
        if (cancelled) return;
        if (!wallet) {
          setIdentityError("No wallet found. Create or import a wallet first.");
          return;
        }
        setSelectedNetwork(wallet.network);
        setIdentityKey(deriveNostrIdentityKey(wallet.mnemonic, 0).publicKeyHex);
      } catch (err) {
        console.error("[SettingsScreen] identity key derivation failed:", err);
        setIdentityError("Could not derive your Founder identity key.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const copyIdentityKey = useCallback(() => {
    if (!identityKey) return;
    try {
      Clipboard.setString(identityKey);
      setCopied(true);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[SettingsScreen] clipboard write failed:", err);
    }
  }, [identityKey]);

  const handleSave = useCallback(() => {
    setApiBaseUrl(nodeUrl);
    setUsingDefault(getApiBaseUrl() === "");
    console.log("[SettingsScreen] Saving settings:", {
      nodeUrl,
      electrumUrl,
    });
    setSaved(true);
    saveTimer.current = setTimeout(() => setSaved(false), 2000);
  }, [nodeUrl, electrumUrl]);

  const handleDemoModeChange = useCallback((next: boolean) => {
    setDemoModeState(next);
    void setDemoMode(next);

    if (next) {
      setShowDemoModeExplainer(true);
    }
  }, []);

  const handleThemeChange = useCallback((theme: WalletTheme) => {
    setSelectedTheme(theme);
    void setWalletTheme(theme);
  }, []);

  const closeDemoModeExplainer = useCallback(() => {
    setShowDemoModeExplainer(false);
  }, []);

  const handleNetworkChange = useCallback(
    async (network: WalletNetwork) => {
      if (network === selectedNetwork) return;
      setNetworkError(null);
      try {
        await setWalletNetwork(network);
        setSelectedNetwork(network);
        setNetworkSaved(true);
        networkTimer.current = setTimeout(() => setNetworkSaved(false), 2000);
      } catch (e) {
        setNetworkError(
          e instanceof Error ? e.message : "Could not change the network.",
        );
      }
    },
    [selectedNetwork],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Title style={styles.heading}>Settings</Title>

      {/* Network selector — Betanet / Signet. Persisted to the keystore. */}
      <Card style={styles.section} testID="network-selector-card">
        <View style={styles.rowBetween}>
          <View style={styles.growShrink}>
            <Text style={styles.labelStrong}>L1 Network</Text>
            <Muted style={styles.hint}>
              Choose which network your wallet uses for balances, sends, and
              receives. This is saved to your wallet and shown in the sidebar.
              Both networks read balances from public Esplora endpoints
              (drivechain.dev/config).
            </Muted>
          </View>
          {networkSaved ? <Badge label="Saved ✓" tone="active" /> : null}
        </View>

        <View style={styles.networkGrid}>
          {NETWORK_OPTIONS.map((opt) => {
            const isActive = selectedNetwork === opt.id;
            return (
              <Pressable
                key={opt.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => handleNetworkChange(opt.id)}
                style={[
                  styles.optionCard,
                  isActive ? styles.optionCardActive : null,
                ]}
                testID="network-option"
              >
                <View style={styles.optionHead}>
                  <Text style={styles.optionTitle}>{opt.label}</Text>
                  {isActive ? <Badge label="Active" tone="active" /> : null}
                </View>
                <Muted style={styles.optionDescription}>{opt.description}</Muted>
              </Pressable>
            );
          })}
        </View>

        {networkError ? (
          <Text style={styles.errorText}>{networkError}</Text>
        ) : null}
      </Card>

      {/* Connection status */}
      {usingDefault ? (
        <Alert tone="warning" style={styles.section}>
          <Text style={styles.alertTitle}>Using Default Adapter</Text>
          <Text style={styles.alertBody}>
            Requests go to {DEFAULT_BASE_URL}. Set a custom adapter URL below to
            override.
          </Text>
        </Alert>
      ) : (
        <Alert tone="info" style={styles.section}>
          <Text style={styles.alertTitle}>Custom Adapter</Text>
          <Text style={styles.alertBody}>Adapter: {getApiBaseUrl()}</Text>
        </Alert>
      )}

      <View style={styles.form}>
        <View>
          <Text style={styles.label}>Adapter Base URL</Text>
          <TextInput
            value={nodeUrl}
            onChangeText={setNodeUrl}
            placeholder={DEFAULT_BASE_URL}
            placeholderTextColor={GRAY[600]}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        <View>
          <Text style={styles.label}>Electrum Server URL</Text>
          <TextInput
            value={electrumUrl}
            onChangeText={setElectrumUrl}
            placeholderTextColor={GRAY[600]}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        <Button
          label={saved ? "Saved ✓" : "Save Settings"}
          onPress={handleSave}
          style={styles.saveButton}
        />
      </View>

      {/* Appearance settings are display-only. They must never affect wallet
          logic, signing, balances, swaps, coin splitting, or broadcast. */}
      <Card style={styles.section}>
        <Text style={styles.labelStrong}>Appearance</Text>
        <Text style={styles.sectionTitle}>Theme</Text>
        <Muted style={styles.hint}>
          Choose the visual style that best fits your wallet experience.
        </Muted>

        <View style={styles.themeGrid}>
          {WALLET_THEMES.map((theme) => {
            const isActive = selectedTheme === theme.id;
            return (
              <Pressable
                key={theme.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => handleThemeChange(theme.id)}
                style={[
                  styles.optionCard,
                  isActive ? styles.optionCardActive : null,
                ]}
              >
                <View style={styles.optionHead}>
                  <Text style={styles.optionTitle}>{theme.label}</Text>
                  {isActive ? <Badge label="Active" tone="active" /> : null}
                </View>
                <Muted style={styles.optionDescription}>
                  {theme.description}
                </Muted>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Demo Mode is display-only. It must never affect signing, sending,
          swapping, splitting, settlement, or broadcast. */}
      <Card
        style={[styles.section, demoMode ? styles.demoCardActive : null]}
        testID="demo-mode-settings-card"
      >
        <View style={styles.demoRow}>
          <View style={styles.growShrink}>
            <Text
              style={[
                styles.labelStrong,
                demoMode ? styles.ecashStrong : null,
              ]}
            >
              Experience
            </Text>
            <View style={styles.demoTitleRow}>
              <Text style={styles.sectionTitle}>Demo Mode</Text>
              {demoMode ? <Badge label="Active" tone="active" /> : null}
            </View>
            <Muted style={styles.hint}>
              Explore Sidecoin with sample balances, platform activity, and PRO
              previews. Demo Mode changes display data only.
            </Muted>
            {demoMode ? (
              <Text style={styles.demoActiveNote}>
                Sample balances and platform activity are enabled.
              </Text>
            ) : null}
            {demoMode ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowDemoModeExplainer(true)}
                style={styles.demoExplainerButton}
              >
                <Text style={styles.demoExplainerButtonText}>
                  What changes in Demo Mode?
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Switch
            accessibilityLabel="Demo Mode"
            value={demoMode}
            onValueChange={handleDemoModeChange}
            trackColor={{ false: GRAY[700], true: ECASH[600] }}
            thumbColor="#ffffff"
          />
        </View>
      </Card>

      {/* ─── Founder Identity Key ──────────────────────────── */}
      <Card style={styles.section}>
        <Text style={styles.labelStrong}>Founder Identity Key</Text>
        <Muted style={styles.hint}>
          Paste this at <Text style={styles.ecashText}>sidecoin.app/pro</Text> to
          claim your Founder profile. It's your public Nostr identity — safe to
          share.
        </Muted>

        {identityKey ? (
          <View style={styles.identityRow}>
            <View style={styles.identityCode}>
              <Mono style={styles.identityText}>{identityKey}</Mono>
            </View>
            <Button
              label={copied ? "Copied ✓" : "Copy"}
              size="sm"
              onPress={copyIdentityKey}
            />
          </View>
        ) : identityError ? (
          <Text style={styles.amberText}>{identityError}</Text>
        ) : (
          <Muted style={styles.hint}>Deriving…</Muted>
        )}
      </Card>

      {/* Debug info hidden by default for a cleaner user-facing settings page. */}
      <DebugInfo usingDefault={usingDefault} />

      {/* Demo Mode explainer. Display-only: this modal explains UI scope only.
          It must never trigger signing, sending, swaps, splitting, settlement,
          entitlement changes, hardware calls, or broadcast. */}
      <Modal
        visible={showDemoModeExplainer}
        transparent
        animationType="fade"
        onRequestClose={closeDemoModeExplainer}
        testID="demo-mode-explainer-modal"
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.growShrink}>
                <Badge label="Demo Mode" tone="active" />
                <Text style={styles.modalTitle}>Demo Mode is now active</Text>
                <Body style={styles.modalIntro}>
                  You can explore Sidecoin with sample balances, platform
                  activity, and PRO previews across the Drivechains Financial
                  Hub.
                </Body>
              </View>
              <Button
                label="Close"
                variant="secondary"
                size="sm"
                onPress={closeDemoModeExplainer}
              />
            </View>

            <ScrollView style={styles.modalBody}>
              <Card tone="inset" style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>
                  What Demo Mode changes
                </Text>
                {[
                  "Dashboard balances and platform activity use sample data.",
                  "Platform portfolio cards show screenshot-ready activity.",
                  "PRO previews stay visible so you can explore the full hub.",
                  "The sidebar and Dashboard clearly show Demo Mode is enabled.",
                ].map((item) => (
                  <View key={item} style={styles.checkRow}>
                    <Text style={styles.checkGreen}>✓</Text>
                    <Text style={styles.checkText}>{item}</Text>
                  </View>
                ))}
              </Card>

              <Card tone="inset" style={styles.modalSection}>
                <Text style={styles.modalSectionTitleAmber}>
                  What Demo Mode never changes
                </Text>
                {[
                  "Your wallet keys, seed phrase, and identity key are unchanged.",
                  "Send, receive, swap, split, signing, and broadcast logic are unchanged.",
                  "Hardware wallet operations are not simulated or bypassed.",
                  "Entitlements, PRO checks, and wallet security rules stay intact.",
                ].map((item) => (
                  <View key={item} style={styles.checkRow}>
                    <Text style={styles.checkAmber}>✓</Text>
                    <Text style={styles.checkText}>{item}</Text>
                  </View>
                ))}
              </Card>

              <Muted style={styles.modalFootnote}>
                Demo Mode is a display-only experience for exploring Sidecoin
                before connecting live activity.
              </Muted>

              <View style={styles.modalActions}>
                <Button
                  label="Explore Dashboard"
                  variant="pro"
                  onPress={() => {
                    closeDemoModeExplainer();
                    navigation.navigate("main", { screen: "dashboard" });
                  }}
                />
                <Button
                  label="Keep browsing"
                  variant="secondary"
                  onPress={closeDemoModeExplainer}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ──────────────────────────────────────────────────────
// Debug info disclosure — <details> replacement.
// ──────────────────────────────────────────────────────
function DebugInfo({ usingDefault }: { usingDefault: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Card style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.debugSummary}
      >
        <Text style={styles.debugSummaryText}>
          {open ? "▾" : "▸"} Show Debug Info
        </Text>
      </Pressable>

      {open ? (
        <View style={styles.debugBody}>
          <Mono style={styles.debugLine}>Version: 26.5.11</Mono>
          <Mono style={styles.debugLine}>Product: Drivechains Financial Hub</Mono>
          <Mono style={styles.debugLine}>Platform: React Native</Mono>
          <Mono style={styles.debugLine}>
            Adapter: {usingDefault ? "Default" : "Custom"}
          </Mono>
          <Mono style={styles.debugLine}>Fork Target: 2026-10-31 15:00Z</Mono>
          <Mono style={styles.debugLine}>Fork Block: ~973,728</Mono>
          <Mono style={styles.debugLine}>
            Platforms: Thunder · zSide · BitNames · BitAssets · Photon ·
            Truthcoin · CoinShift
          </Mono>
          <Mono style={styles.debugLine}>BIPs: 300, 301</Mono>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SC.bg,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 24,
  },
  heading: {
    fontSize: 24,
  },
  section: {
    maxWidth: 720,
    padding: 16,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  growShrink: {
    flexShrink: 1,
  },
  label: {
    marginBottom: 4,
    fontSize: 13,
    color: GRAY[400],
  },
  labelStrong: {
    fontSize: 13,
    fontWeight: "600",
    color: GRAY[300],
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: GRAY[500],
  },
  networkGrid: {
    marginTop: 16,
    gap: 12,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 12,
    backgroundColor: GRAY[950],
    padding: 16,
  },
  optionCardActive: {
    borderColor: ECASH[500],
    backgroundColor: GRAY[900],
  },
  optionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  optionTitle: {
    fontWeight: "900",
    color: "#ffffff",
  },
  optionDescription: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    marginTop: 12,
    fontSize: 12,
    color: "#f87171",
  },
  alertTitle: {
    fontWeight: "600",
    fontSize: 13,
    color: "#fcd34d",
  },
  alertBody: {
    marginTop: 4,
    fontSize: 12,
    color: "#fbbf24",
  },
  form: {
    maxWidth: 512,
    gap: 16,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 6,
    backgroundColor: GRAY[900],
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#ffffff",
    fontSize: 14,
  },
  saveButton: {
    alignSelf: "flex-start",
  },
  sectionTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "900",
    color: "#ffffff",
  },
  themeGrid: {
    marginTop: 16,
    gap: 12,
  },
  demoCardActive: {
    borderColor: ECASH[700],
    backgroundColor: GRAY[950],
  },
  demoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  demoTitleRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  ecashStrong: {
    color: ECASH[400],
  },
  ecashText: {
    color: ECASH[400],
  },
  demoActiveNote: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: "600",
    color: ECASH[400],
  },
  demoExplainerButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: ECASH[700],
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  demoExplainerButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: ECASH[400],
  },
  identityRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  identityCode: {
    flex: 1,
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 6,
    backgroundColor: GRAY[950],
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  identityText: {
    fontSize: 11,
    color: GRAY[300],
  },
  amberText: {
    marginTop: 4,
    fontSize: 12,
    color: "#fbbf24",
  },
  debugSummary: {
    paddingVertical: 2,
  },
  debugSummaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: GRAY[400],
  },
  debugBody: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: GRAY[800],
    paddingTop: 12,
    gap: 4,
  },
  debugLine: {
    fontSize: 11,
    color: GRAY[500],
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3,7,18,0.8)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: ECASH[700],
    borderRadius: 16,
    backgroundColor: GRAY[900],
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: GRAY[800],
    padding: 20,
  },
  modalTitle: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: "900",
    color: "#ffffff",
  },
  modalIntro: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 22,
  },
  modalBody: {
    padding: 20,
  },
  modalSection: {
    padding: 16,
    marginBottom: 16,
  },
  modalSectionTitle: {
    fontWeight: "900",
    color: ECASH[400],
  },
  modalSectionTitleAmber: {
    fontWeight: "900",
    color: "#fbbf24",
  },
  checkRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 12,
  },
  checkGreen: {
    color: ECASH[400],
  },
  checkAmber: {
    color: "#fbbf24",
  },
  checkText: {
    flexShrink: 1,
    fontSize: 13,
    color: GRAY[300],
  },
  modalFootnote: {
    marginBottom: 16,
    fontSize: 12,
    lineHeight: 18,
  },
  modalActions: {
    gap: 12,
    marginBottom: 8,
  },
});