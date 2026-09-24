// apps/mobile/src/screens/ReceiveScreen.tsx
//
// Ported from apps/wallet/src/views/ReceiveView.vue.
//
// Ported 1:1. The Vue view has three tabs (Address / Payment Code / History);
// a network selector that PERSISTS to the keystore via setWalletNetwork; an
// address index that cycles with "Generate New Address"; and a QR code. All of
// that is carried over. `deriveReceiveAddress` is unchanged.
//
// Platform substitutions, no logic loss:
//   • The Vue keystore is synchronous localStorage; the RN keystore is async
//     (keychain), so loadWallet/ setWalletNetwork are awaited.
//   • The Vue view listened for `WALLET_NETWORK_EVENT` on `window`. RN has no
//     DOM event bus; setWalletNetwork here persists and this screen re-reads
//     the wallet on focus (useFocusEffect), which is the RN-idiomatic
//     equivalent of the Vue "network changed elsewhere" listener.
//   • `navigator.clipboard.writeText` -> Clipboard.setString.
//   • <QrcodeVue> -> react-native-qrcode-svg (already a mobile dependency).
//   • RECEIVE_NETWORKS is betanet + signet exactly as in the Vue view. Note
//     the wallet default is betanet (see apps/mobile/src/keystore.ts); a
//     betanet wallet opens this page with neither chip selected and shows the
//     signet chip preview until the user picks one. That matches the Vue
//     view's behaviour when the stored network was not in its two-chip list.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Clipboard from "@react-native-clipboard/clipboard";
import QRCode from "react-native-qrcode-svg";
import { deriveReceiveAddress } from "@sidecoin/shared";

import { loadWallet, setWalletNetwork, type WalletNetwork } from "../keystore";
import { ECASH, GRAY, SC } from "../theme/colors";
import {
  Alert,
  Badge,
  Body,
  Button,
  Card,
  Eyebrow,
  Mono,
  Muted,
  Title,
} from "../components/ui";

type ReceiveTab = "address" | "payment-code" | "history";

// The two networks a user can receive to from this page. Betanet is the
// live ECX practice network ("betanet" on drivechain.dev/config); Signet is
// the L2L signet. The choice IS persisted to the keystore via setWalletNetwork.
const RECEIVE_NETWORKS: { id: WalletNetwork; label: string }[] = [
  { id: "betanet", label: "Betanet" },
  { id: "signet", label: "Signet" },
];

const RECEIVE_TABS: { id: ReceiveTab; label: string }[] = [
  { id: "address", label: "Address" },
  { id: "payment-code", label: "Payment Code" },
  { id: "history", label: "History" },
];

function toLabel(network: WalletNetwork): string {
  return network === "betanet" ? "Betanet" : "Signet";
}

export function ReceiveScreen(): React.JSX.Element {
  const [mnemonic, setMnemonic] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<WalletNetwork>("betanet");
  const [addressIndex, setAddressIndex] = useState(0);
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedPaymentCode, setCopiedPaymentCode] = useState(false);
  const [error, setError] = useState("");
  const [selectedTab, setSelectedTab] = useState<ReceiveTab>("address");

  // BIP-44 coin type: 0 for mainnet + mainnet forks (betanet), 1 for test
  // networks. Mirrors the coinTypeFor logic in @sidecoin/shared/wallet/derivation.
  // Here selectedNetwork is signet (coin type 1) or betanet (coin type 0).
  const coinType = selectedNetwork === "betanet" ? 0 : 1;

  const derivationPath = `m/84'/${coinType}'/0'/0/${addressIndex}`;

  const paymentCodePreview = address ? `sidecoin:receive:${address}` : "";

  const networkLabel = useMemo(() => toLabel(selectedNetwork), [selectedNetwork]);

  // Re-derive the receive address for the currently selected network + index.
  // Called whenever the network or index changes (session-only), exactly as
  // the Vue `watch([selectedNetwork, addressIndex], updateAddress)`.
  useEffect(() => {
    if (!hasKey || !mnemonic) {
      setAddress("");
      return;
    }
    try {
      setError("");
      setAddress(deriveReceiveAddress(mnemonic, selectedNetwork, addressIndex));
    } catch (e) {
      console.error("[ReceiveScreen] Failed to derive address:", e);
      setAddress("");
      setError("Unable to derive a receive address from the stored key.");
    }
  }, [hasKey, mnemonic, selectedNetwork, addressIndex]);

  const loadStored = useCallback(async () => {
    // Background read: served from the session cache after the first unlock,
    // so focusing this screen never re-prompts for a fingerprint.
    const wallet = await loadWallet({ authenticate: false });
    if (!wallet) return;
    setHasKey(true);
    setMnemonic(wallet.mnemonic);
    setSelectedNetwork(wallet.network);
  }, []);

  // On mount AND on every focus — the focus read is the RN replacement for the
  // Vue `window.addEventListener(WALLET_NETWORK_EVENT, …)` listener, so a
  // network switch made in Settings is reflected here.
  useFocusEffect(
    useCallback(() => {
      void loadStored();
    }, [loadStored]),
  );

  // Cycle to the next receive address index (session-only, not persisted).
  const generateNewAddress = useCallback(() => {
    setAddressIndex((i) => i + 1);
  }, []);

  // Persist a network switch to the keystore. Falls back gracefully when
  // there's no stored wallet yet.
  const handleNetworkChange = useCallback(
    (network: WalletNetwork) => {
      setSelectedNetwork(network);
      setAddressIndex(0);
      setHasKey((present) => {
        if (present) {
          void setWalletNetwork(network).catch((e) => {
            console.error("[ReceiveScreen] Could not persist network:", e);
          });
        }
        return present;
      });
    },
    [],
  );

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      if (paymentTimer.current) clearTimeout(paymentTimer.current);
    },
    [],
  );

  const copyAddress = useCallback(() => {
    if (!address) return;
    try {
      Clipboard.setString(address);
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("[ReceiveScreen] Failed to copy:", e);
    }
  }, [address]);

  const copyPaymentCode = useCallback(() => {
    if (!paymentCodePreview) return;
    try {
      Clipboard.setString(paymentCodePreview);
      setCopiedPaymentCode(true);
      paymentTimer.current = setTimeout(() => setCopiedPaymentCode(false), 2000);
    } catch (e) {
      console.error("[ReceiveScreen] Failed to copy payment code preview:", e);
    }
  }, [paymentCodePreview]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.rootContent}>
      <Card style={styles.hero}>
        <View style={styles.heroHead}>
          <View style={styles.heroCopy}>
            <Eyebrow>L1 Wallet</Eyebrow>
            <Title>Receive eCash</Title>
            <Body style={styles.heroBody}>
              Generate your wallet receive address, scan a QR code, and review
              receive metadata from one place.
            </Body>
          </View>
          <Badge label="Native SegWit" tone="active" />
        </View>
      </Card>

      {/* Derivation failed */}
      {error ? (
        <Alert tone="error" title="Address unavailable">
          <Text style={styles.errorDetail}>{error}</Text>
        </Alert>
      ) : !address ? (
        <Alert tone="warning" title="Wallet setup required">
          Receive addresses are derived from your wallet key. Address
          generation becomes available once key setup is complete.
        </Alert>
      ) : (
        <Card style={styles.panel}>
          <View style={styles.tabs}>
            {RECEIVE_TABS.map((tab) => (
              <Pressable
                key={tab.id}
                accessibilityRole="button"
                onPress={() => setSelectedTab(tab.id)}
                style={[styles.tab, selectedTab === tab.id ? styles.tabActive : null]}
              >
                <Text
                  style={[
                    styles.tabText,
                    selectedTab === tab.id ? styles.tabTextActive : null,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {selectedTab === "address" ? (
            <View style={styles.addressTab}>
              {/* Network selector — persists to the wallet (see setWalletNetwork). */}
              <View style={styles.networkRow}>
                <View style={styles.networkCopy}>
                  <Text style={styles.sectionEyebrow}>Receive to network</Text>
                  <Muted style={styles.networkHint}>
                    Select which network to receive to. This is saved to your
                    wallet and used everywhere (Dashboard, Send, Sidebar).
                  </Muted>
                </View>
                <View style={styles.networkButtons}>
                  {RECEIVE_NETWORKS.map((net) => (
                    <Pressable
                      key={net.id}
                      accessibilityRole="button"
                      onPress={() => handleNetworkChange(net.id)}
                      style={[
                        styles.networkButton,
                        selectedNetwork === net.id ? styles.networkButtonActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.networkButtonText,
                          selectedNetwork === net.id
                            ? styles.tabTextActive
                            : null,
                        ]}
                      >
                        {net.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Card tone="inset" style={styles.qrCard}>
                <Text style={styles.sectionEyebrow}>Scan this QR code</Text>
                <View style={styles.qrWrap}>
                  <View style={styles.qrFrame}>
                    <QRCode value={address} size={220} ecl="M" />
                  </View>
                </View>
                <Muted style={styles.qrNote}>
                  Send only funds for this network to this address. Deposits
                  appear after confirmation and indexing.
                </Muted>
              </Card>

              <Card tone="inset" style={styles.addressCard}>
                <Muted style={styles.addressLabel}>Your Receive Address</Muted>
                <Text style={styles.addressText}>{address}</Text>
                <View style={styles.addressActions}>
                  <Button
                    label={copied ? "Copied ✓" : "Copy Address"}
                    onPress={copyAddress}
                  />
                  <Button
                    label="Generate New Address"
                    variant="secondary"
                    onPress={generateNewAddress}
                  />
                </View>
              </Card>

              <Card tone="inset" style={styles.detailsCard}>
                <Text style={styles.sectionEyebrow}>Address details</Text>
                <View style={styles.detailsGrid}>
                  <View style={styles.detailTile}>
                    <Muted style={styles.detailTileLabel}>Network</Muted>
                    <Text style={styles.detailTileValue}>{networkLabel}</Text>
                  </View>
                  <View style={styles.detailTile}>
                    <Muted style={styles.detailTileLabel}>Address type</Muted>
                    <Text style={styles.detailTileValue}>Native SegWit</Text>
                  </View>
                  <View style={styles.detailTile}>
                    <Muted style={styles.detailTileLabel}>Address index</Muted>
                    <Mono style={styles.detailTileMono}>{addressIndex}</Mono>
                  </View>
                  <View style={[styles.detailTile, styles.detailTileWide]}>
                    <Muted style={styles.detailTileLabel}>Derivation</Muted>
                    <Mono style={styles.detailTileMono}>{derivationPath}</Mono>
                  </View>
                </View>
              </Card>
            </View>
          ) : selectedTab === "payment-code" ? (
            <View style={styles.paymentTab}>
              <Card tone="inset" style={styles.paymentCard}>
                <Text style={styles.sectionEyebrow}>Payment code preview</Text>
                <Text style={styles.paymentTitle}>
                  Reusable receive identity
                </Text>
                <Muted style={styles.paymentBody}>
                  This preview packages your current receive address into a
                  Sidecoin receive card format. Future identity-based receiving
                  can build on this pattern without changing your wallet keys.
                </Muted>
                <View style={styles.previewBox}>
                  <Text style={styles.sectionEyebrow}>Preview code</Text>
                  <Mono style={styles.previewCode}>{paymentCodePreview}</Mono>
                </View>
                <Button
                  label={copiedPaymentCode ? "Copied ✓" : "Copy Preview Code"}
                  onPress={copyPaymentCode}
                  style={styles.paymentCta}
                />
              </Card>

              <Card tone="pro" style={styles.bitnamesCard}>
                <Text style={styles.amberEyebrow}>Coming next</Text>
                <Text style={styles.paymentTitle}>BitNames receiving</Text>
                <Body style={styles.paymentBody}>
                  BitNames can make receiving easier by connecting human-readable
                  names, contacts, and reusable payment metadata.
                </Body>
                <View style={styles.bitnamesList}>
                  {[
                    "Resolve a BitName before sending.",
                    "Attach wallet addresses to identity records.",
                    "Use contacts for repeat payments and messaging.",
                  ].map((item) => (
                    <View key={item} style={styles.bitnamesItem}>
                      <Text style={styles.amberCheck}>✓</Text>
                      <Text style={styles.bitnamesText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          ) : (
            <View style={styles.historyTab}>
              <View style={styles.historyHead}>
                <View style={styles.heroCopy}>
                  <Text style={styles.paymentTitle}>Receive history</Text>
                  <Muted style={styles.historyHint}>
                    Address usage and confirmed deposits will appear here after
                    indexing.
                  </Muted>
                </View>
                <Button label="Export CSV" variant="secondary" size="sm" disabled />
              </View>

              <Card tone="inset" style={styles.historyTable}>
                <View style={styles.historyHeadRow}>
                  <Text style={styles.historyTh}>Label</Text>
                  <Text style={styles.historyTh}>Status</Text>
                </View>
                <View style={styles.historyRow}>
                  <View style={styles.historyCell}>
                    <Text style={styles.historyTd}>Primary receive</Text>
                    <Mono style={styles.historyAddress}>{address}</Mono>
                  </View>
                  <View style={styles.historyCellEnd}>
                    <Text style={styles.historyTd}>Ready</Text>
                    <Text style={styles.historyAmount}>—</Text>
                  </View>
                </View>
              </Card>
            </View>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 16,
  },
  // ScrollView content container -- mirrors the Dashboard/Settings pattern so
  // the address card (below the fold) is reachable. `gap` moved here because
  // ScrollView ignores it on the outer style; `flex: 1` stays on the outer
  // style so short content still fills the screen exactly as before.
  rootContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  hero: {
    padding: 20,
  },
  heroHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  heroCopy: {
    flexShrink: 1,
  },
  heroBody: {
    marginTop: 8,
  },
  errorDetail: {
    marginTop: 4,
    fontSize: 12,
  },
  panel: {
    padding: 16,
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: GRAY[800],
    paddingBottom: 12,
  },
  tab: {
    borderRadius: 10,
    backgroundColor: GRAY[950],
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabActive: {
    backgroundColor: ECASH[600],
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: GRAY[400],
  },
  tabTextActive: {
    color: "#ffffff",
  },
  addressTab: {
    marginTop: 20,
    gap: 16,
  },
  networkRow: {
    gap: 12,
  },
  networkCopy: {
    flexShrink: 1,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: GRAY[500],
  },
  networkHint: {
    marginTop: 4,
    fontSize: 12,
  },
  networkButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  networkButton: {
    borderRadius: 10,
    backgroundColor: GRAY[950],
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  networkButtonActive: {
    backgroundColor: ECASH[600],
  },
  networkButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: GRAY[400],
  },
  qrCard: {
    padding: 20,
  },
  qrWrap: {
    marginTop: 20,
    alignItems: "center",
  },
  qrFrame: {
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 16,
  },
  qrNote: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
  },
  addressCard: {
    padding: 20,
  },
  addressLabel: {
    marginBottom: 8,
    fontSize: 14,
  },
  addressText: {
    fontFamily: "monospace",
    fontSize: 13,
    color: ECASH[400],
  },
  addressActions: {
    marginTop: 16,
    gap: 10,
  },
  detailsCard: {
    padding: 20,
  },
  detailsGrid: {
    marginTop: 16,
    gap: 12,
  },
  detailTile: {
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 10,
    backgroundColor: GRAY[900],
    padding: 12,
  },
  detailTileWide: {},
  detailTileLabel: {
    fontSize: 12,
  },
  detailTileValue: {
    marginTop: 4,
    fontWeight: "600",
    color: GRAY[200],
  },
  detailTileMono: {
    marginTop: 4,
    fontSize: 12,
    color: GRAY[300],
  },
  paymentTab: {
    marginTop: 20,
    gap: 16,
  },
  paymentCard: {
    padding: 20,
  },
  paymentTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "900",
    color: "#ffffff",
  },
  paymentBody: {
    marginTop: 12,
  },
  previewBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 12,
    backgroundColor: GRAY[900],
    padding: 16,
  },
  previewCode: {
    marginTop: 8,
    fontSize: 12,
    color: ECASH[400],
  },
  paymentCta: {
    marginTop: 16,
    alignSelf: "flex-start",
  },
  bitnamesCard: {
    padding: 20,
  },
  amberEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 2.5,
    color: "#fbbf24",
  },
  bitnamesList: {
    marginTop: 16,
    gap: 12,
  },
  bitnamesItem: {
    flexDirection: "row",
    gap: 8,
  },
  amberCheck: {
    color: "#fbbf24",
  },
  bitnamesText: {
    flexShrink: 1,
    fontSize: 13,
    color: GRAY[300],
  },
  historyTab: {
    marginTop: 20,
  },
  historyHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  historyHint: {
    marginTop: 8,
  },
  historyTable: {
    marginTop: 16,
    padding: 16,
  },
  historyHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: GRAY[800],
    paddingBottom: 8,
  },
  historyTh: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: GRAY[500],
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 12,
  },
  historyCell: {
    flexShrink: 1,
    gap: 4,
  },
  historyCellEnd: {
    alignItems: "flex-end",
    gap: 4,
  },
  historyTd: {
    fontSize: 13,
    color: GRAY[300],
  },
  historyAddress: {
    fontSize: 11,
    color: GRAY[500],
  },
  historyAmount: {
    fontFamily: "monospace",
    fontSize: 13,
    color: ECASH[400],
  },
});