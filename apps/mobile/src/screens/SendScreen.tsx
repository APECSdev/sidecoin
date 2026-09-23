// apps/mobile/src/screens/SendScreen.tsx
//
// Ported from apps/wallet/src/views/SendView.vue.
//
// Ported 1:1. The tabbed Simple / Advanced / Review flow, the real
// build -> review -> broadcast pipeline, the fee policy, the send-safety
// checklist, the PRO Coin Control preview (locked/unlocked), the review grid
// (amount / fee / change / size / txid / signed hex), the broadcast receipt,
// and the "no transaction built yet" empty state all keep their exact copy and
// behaviour.
//
// Platform substitutions, no logic loss:
//   • `loadWallet()` is ASYNC in the RN keystore (keychain), so the handlers
//     await it. Every other call in the build path is identical.
//   • `<form @submit.prevent>` + a submit button -> a Pressable; the disabled
//     rule (`sending || !address || !amount`) is unchanged.
//   • `<input>` / `<textarea readonly>` -> TextInput (hex field is
//     `editable={false}`).
//   • `<a href="#/pro">` -> navigation.navigate("pro").
//   • The lazy `qr-scanner` overlay -> the RN QrScanner component
//     (react-native-vision-camera), mounted inside an RN Modal. It is mounted
//     only while open, so the camera library is never touched during a normal
//     render — the same laziness the Vue async component provided.
//   • The Vue `xl:grid-cols-[1fr_0.8fr]` two-column layout becomes a vertical
//     stack on a phone.
//   • The preview coin-control `<table>` becomes a row stack (Select / Amount /
//     Confirmations / Label / Address / TxID / Status per row).

import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  buildAndSignP2wpkhTransaction,
  deriveSigningKey,
  selectCoins,
  type SignedTransaction,
} from "@sidecoin/shared";

import { parsePaymentUri } from "../components/paymenturi";
import { QrScanner } from "../components/QrScanner";
import { toSpendableUtxo, parseCoinsToSats } from "../send";
import { loadWallet, type WalletNetwork } from "../keystore";
import {
  getL1Utxos,
  broadcastTransaction,
  satsToBtc,
  L1_CHAIN_ID,
  ApiError,
  type BroadcastReceipt,
} from "../api";
import { canAccessFeature, COIN_CONTROL_FEATURE_ID } from "../entitlements";
import type { RootStackParamList } from "../navigation/types";
import { ECASH, GRAY } from "../theme/colors";
import { Alert, Badge, Button, Card, Muted } from "../components/ui";

// The scanner is mounted only while open, so the camera library
// (react-native-vision-camera) is never imported during normal render or in
// unit tests.
//
// Flat fee rate for signet (an empty mempool confirms at 1 sat/vB).
const FEE_RATE_SAT_PER_VB = 1;

type SendTab = "simple" | "advanced" | "review";

/** A built+signed tx plus the recipient amount, for the Review panel. */
interface BuiltTx extends SignedTransaction {
  amountSatoshis: bigint;
}

interface CoinControlPreviewRow {
  selected: boolean;
  amount: string;
  confirmations: string;
  label: string;
  address: string;
  txid: string;
  status: string;
}

const SEND_TABS: { id: SendTab; label: string }[] = [
  { id: "simple", label: "Simple" },
  { id: "advanced", label: "Advanced" },
  { id: "review", label: "Review" },
];

const COIN_CONTROL_PREVIEW_ROWS: CoinControlPreviewRow[] = [
  {
    selected: true,
    amount: "0.75000000",
    confirmations: "216",
    label: "Primary receive",
    address: "tb1qpreviewprimaryreceiveaddress000000000000000",
    txid: "7f4a2d9c...91bd",
    status: "Spendable",
  },
  {
    selected: false,
    amount: "0.31250000",
    confirmations: "42",
    label: "Thunder deposit change",
    address: "tb1qpreviewthunderchange0000000000000000000",
    txid: "52ac88e1...44de",
    status: "Review",
  },
  {
    selected: false,
    amount: "0.05000000",
    confirmations: "6",
    label: "Small coin",
    address: "tb1qpreviewcoincontrolsmall000000000000000",
    txid: "09fa12cc...7f4a",
    status: "Spendable",
  },
];

export function SendScreen(): React.JSX.Element {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [selectedTab, setSelectedTab] = useState<SendTab>("simple");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [built, setBuilt] = useState<BuiltTx | null>(null);
  const [receipt, setReceipt] = useState<BroadcastReceipt | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  // The network label tracks the stored wallet network (the wallet default is
  // betanet), so the header chip stays truthful instead of hardcoding one
  // network name.
  const [walletNetwork, setWalletNetworkState] = useState<WalletNetwork>("betanet");
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const wallet = await loadWallet();
      if (cancelled || !wallet) return;
      setWalletNetworkState(wallet.network);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasCoinControlAccess = useMemo(
    () => canAccessFeature(COIN_CONTROL_FEATURE_ID),
    [],
  );

  const previewSelectedTotal = useMemo(
    () =>
      COIN_CONTROL_PREVIEW_ROWS.filter((row) => row.selected)
        .reduce((total, row) => total + Number(row.amount), 0)
        .toFixed(8),
    [],
  );

  function openScanner(): void {
    setShowScanner(true);
  }

  function closeScanner(): void {
    setShowScanner(false);
  }

  /**
   * Fill the form from a scanned QR value. Accepts a bare address or a BIP-21
   * "bitcoin:" URI (with optional amount); the recipient field is always set,
   * and the amount field only when the URI carried a valid one.
   */
  function onScanDecode(value: string): void {
    const parsed = parsePaymentUri(value);
    if (parsed.address) setAddress(parsed.address);
    if (parsed.amount) setAmount(parsed.amount);
    setShowScanner(false);
  }

  /**
   * Build + sign the transaction LOCALLY (does not broadcast). Single-address
   * wallet: we derive the index-0 BIP-84 key (the same path Receive shows),
   * fetch the spendable set for THAT address (the only script we can sign),
   * select coins, and sign. The signed hex is shown for optional verification
   * (testmempoolaccept) before the separate Broadcast step.
   */
  async function handleSend(): Promise<void> {
    setSending(true);
    setError(null);
    setBuilt(null);
    setReceipt(null);
    try {
      const wallet = await loadWallet();
      if (!wallet) {
        setError("No wallet found. Complete wallet setup first.");
        return;
      }

      // Parse the amount up front so a bad value fails fast (before any network).
      const amountSatoshis = parseCoinsToSats(amount);

      // Index-0 signing key — identical path to deriveReceiveAddress(.., 0).
      const key = deriveSigningKey(wallet.mnemonic, wallet.network, 0);

      // Spendable set for this one address (the only coins we hold a key for).
      // Reads from the public Esplora endpoint for the wallet's current
      // network (betanet or signet).
      const utxoSet = await getL1Utxos(key.address, {}, wallet.network);
      if (utxoSet.truncated) {
        setError(
          "The UTXO set was truncated upstream; refusing to build from an " +
            "incomplete set. Please try again shortly.",
        );
        return;
      }

      const spendable = utxoSet.utxos.map(toSpendableUtxo);

      const selection = selectCoins({
        utxos: spendable,
        targetSatoshis: amountSatoshis,
        feeRateSatPerVb: FEE_RATE_SAT_PER_VB,
      });

      const signed = buildAndSignP2wpkhTransaction({
        network: wallet.network,
        selectedUtxos: selection.selectedUtxos,
        toAddress: address.trim(),
        amountSatoshis,
        feeSatoshis: selection.feeSatoshis,
        changeScriptPubKey: key.scriptPubKey, // change returns to index 0
        signingKeys: [key],
      });

      setBuilt({ ...signed, amountSatoshis });
      setSelectedTab("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  /** Relay the already-signed tx to the L1 node via the public Esplora
   * endpoint for the wallet's current network (betanet or signet). */
  async function broadcast(): Promise<void> {
    if (!built) return;
    setBroadcasting(true);
    setError(null);
    try {
      const wallet = await loadWallet();
      const network = wallet?.network ?? "betanet";
      setReceipt(await broadcastTransaction(L1_CHAIN_ID, built.hex, network));
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`Broadcast failed (${e.code}): ${e.message}`);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBroadcasting(false);
    }
  }

  /** Discard the built tx and return to the form. */
  function cancel(): void {
    setBuilt(null);
    setReceipt(null);
    setError(null);
    setSelectedTab("simple");
  }

  const networkLabel =
    walletNetwork === "signet"
      ? "Signet"
      : "Betanet";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.hero}>
        <Text style={styles.heroEyebrow}>L1 Wallet</Text>
        <Text style={styles.heroTitle}>Send eCash</Text>
        <Text style={styles.heroBody}>
          Build, review, sign, and broadcast a local L1 transaction with an
          explicit review step before funds leave your wallet.
        </Text>

        <View style={styles.badgeRow}>
          <Badge label={networkLabel} tone="neutral" />
          <Badge label="Local signing" tone="active" />
        </View>
      </Card>

      <Card style={styles.body}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {SEND_TABS.map((tab) => (
            <Pressable
              key={tab.id}
              accessibilityRole="button"
              testID={`send-tab-${tab.id}`}
              onPress={() => setSelectedTab(tab.id)}
              style={[
                styles.tab,
                selectedTab === tab.id ? styles.tabActive : null,
              ]}
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
        </ScrollView>

        {error ? (
          <Alert tone="error" style={styles.errorAlert}>
            <Text style={styles.errorText}>{error}</Text>
          </Alert>
        ) : null}

        {selectedTab === "simple" ? (
          <View style={styles.column}>
            <Card tone="inset" style={styles.panel}>
              <Text style={styles.panelTitle}>Simple send</Text>
              <Text style={styles.panelBody}>
                Enter a recipient and amount. Sidecoin builds and signs locally,
                then shows a full review before broadcast.
              </Text>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Recipient Address</Text>
                <View style={styles.addressRow}>
                  <TextInput
                    accessibilityLabel="Recipient Address"
                    value={address}
                    onChangeText={setAddress}
                    placeholder="ecash1q..."
                    placeholderTextColor={GRAY[600]}
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, styles.addressInput]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Scan QR code"
                    onPress={openScanner}
                    style={styles.scanButton}
                  >
                    <Text style={styles.scanButtonText}>Scan</Text>
                  </Pressable>
                </View>
                <Text style={styles.fieldFooter}>
                  QR scanning supports bare addresses and BIP-21 payment URIs.
                </Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Amount (eCash)</Text>
                <TextInput
                  accessibilityLabel="Amount (eCash)"
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00000000"
                  placeholderTextColor={GRAY[600]}
                  inputMode="decimal"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>

              <Card tone="inset" style={styles.feeCard}>
                <Text style={styles.smallLabel}>Fee policy</Text>
                <Text style={styles.feeValue}>{FEE_RATE_SAT_PER_VB} sat/vB</Text>
                <Badge label="Signet default" tone="neutral" />
              </Card>

              <Button
                label={sending ? "Building…" : "Review Transaction"}
                onPress={handleSend}
                disabled={sending || !address || !amount}
                loading={sending}
                fullWidth
                style={styles.submit}
              />
            </Card>

            <Card tone="inset" style={styles.panel}>
              <Text style={styles.smallLabel}>Send safety</Text>
              <Text style={styles.panelTitle}>Review before broadcast</Text>
              <View style={styles.checkList}>
                {[
                  "Transaction is built and signed locally.",
                  "Broadcast happens only after review.",
                  "Change returns to your wallet index 0 key.",
                  "Invalid amounts fail before any network call.",
                ].map((item) => (
                  <View key={item} style={styles.checkRow}>
                    <Text style={styles.checkMark}>✓</Text>
                    <Text style={styles.checkText}>{item}</Text>
                  </View>
                ))}
              </View>
            </Card>

            <Card tone="pro" style={styles.panel}>
              <View style={styles.proHeader}>
                <Badge label="PRO" tone="pro" />
                <Text style={styles.proEyebrow}>Advanced</Text>
              </View>
              <Text style={styles.panelTitle}>Coin Control preview</Text>
              <Text style={styles.proBody}>
                Manual UTXO selection lives in Advanced as a Sidecoin PRO power
                tool preview. Simple sends continue to use automatic coin
                selection.
              </Text>
              <Button
                label="Preview Coin Control"
                variant="secondary"
                size="sm"
                onPress={() => setSelectedTab("advanced")}
                style={styles.proButton}
              />
            </Card>
          </View>
        ) : selectedTab === "advanced" ? (
          <View style={styles.column}>
            <Card tone="inset" style={styles.panel}>
              <View style={styles.advancedHead}>
                <Text style={styles.panelTitle}>Advanced send tools</Text>
                <View style={styles.badgeRow}>
                  <Badge label="PRO" tone="pro" />
                  <Badge
                    label={hasCoinControlAccess ? "Unlocked" : "Locked"}
                    tone={hasCoinControlAccess ? "active" : "neutral"}
                  />
                </View>
              </View>
              <Text style={styles.panelBody}>
                Advanced tools are designed for power users who want explicit
                control over privacy, fees, UTXOs, and transaction review.
              </Text>

              <Card tone="pro" style={styles.coinControl}>
                <Text style={styles.proEyebrow}>Coin Control</Text>
                <Text style={styles.panelTitle}>
                  Manual UTXO selection preview
                </Text>
                <Text style={styles.proBody}>
                  Coin Control will let Sidecoin PRO users inspect coins,
                  select exact UTXOs, review confirmations, and build advanced
                  sends. This preview does not change transaction construction.
                </Text>

                <Card tone="inset" style={styles.previewTotalCard}>
                  <Text style={styles.smallLabel}>Preview selected</Text>
                  <Text style={styles.previewTotal}>
                    {previewSelectedTotal}
                  </Text>
                  <Text style={styles.previewHint}>
                    Display-only sample coins
                  </Text>
                </Card>

                {!hasCoinControlAccess ? (
                  <Card tone="inset" style={styles.proGate}>
                    <Text style={styles.proEyebrow}>Sidecoin PRO required</Text>
                    <Text style={styles.panelTitle}>
                      Unlock advanced Coin Control
                    </Text>
                    <Text style={styles.proBody}>
                      Basic users keep automatic coin selection. PRO unlocks the
                      advanced Coin Control workflow for manual UTXO review and
                      selection.
                    </Text>
                    <Button
                      label="Upgrade to PRO"
                      variant="pro"
                      size="sm"
                      onPress={() => navigation.navigate("pro")}
                      style={styles.proButton}
                    />
                  </Card>
                ) : null}

                <View style={styles.tableHeadRow}>
                  {["Select", "Amount", "Confirmations"].map((h) => (
                    <Text key={h} style={styles.tableHeadCell}>
                      {h}
                    </Text>
                  ))}
                </View>
                {COIN_CONTROL_PREVIEW_ROWS.map((row) => (
                  <View key={row.txid} style={styles.tableRow}>
                    <View style={styles.tableCellRow}>
                      <Text style={styles.tableHeadCell}>Label</Text>
                      <Text style={styles.tableValue}>{row.label}</Text>
                    </View>
                    <View style={styles.tableCellRow}>
                      <Text style={styles.tableHeadCell}>Amount</Text>
                      <Text style={styles.tableAmount}>{row.amount}</Text>
                    </View>
                    <View style={styles.tableCellRow}>
                      <Text style={styles.tableHeadCell}>Confirmations</Text>
                      <Text style={styles.tableValue}>{row.confirmations}</Text>
                    </View>
                    <View style={styles.tableCellRow}>
                      <Text style={styles.tableHeadCell}>Address</Text>
                      <Text style={styles.tableMono}>{row.address}</Text>
                    </View>
                    <View style={styles.tableCellRow}>
                      <Text style={styles.tableHeadCell}>TxID</Text>
                      <Text style={styles.tableMono}>{row.txid}</Text>
                    </View>
                    <View style={styles.tableCellRow}>
                      <Text style={styles.tableHeadCell}>Status</Text>
                      <Text style={styles.tableValue}>{row.status}</Text>
                    </View>
                    <View style={styles.tableCellRow}>
                      <Text style={styles.tableHeadCell}>Select</Text>
                      <Text style={styles.tableValue}>
                        {row.selected ? "Selected" : "Not selected"}
                      </Text>
                    </View>
                  </View>
                ))}

                <View style={styles.disabledRow}>
                  <Button label="Select all" variant="secondary" size="sm" disabled fullWidth />
                  <Button label="Clear" variant="secondary" size="sm" disabled fullWidth />
                  <Button
                    label="Use selected coins"
                    variant="secondary"
                    size="sm"
                    disabled
                    fullWidth
                  />
                </View>

                <Card tone="inset" style={styles.previewNote}>
                  <Text style={styles.smallLabel}>Preview-only safety note</Text>
                  <Text style={styles.proBody}>
                    This screen is a visual PRO preview. It does not fetch extra
                    coins, does not persist selections, does not override automatic
                    coin selection, and does not change the Simple Send build/sign
                    path.
                  </Text>
                </Card>
              </Card>
            </Card>

            <Card tone="inset" style={styles.panel}>
              <Text style={styles.smallLabel}>Advanced warning</Text>
              <Text style={styles.panelTitle}>Power tools require care</Text>
              <Text style={styles.panelBody}>
                Manual coin selection can affect privacy, fees, and change outputs.
                Sidecoin keeps this separate from Simple Send so everyday payments
                remain straightforward.
              </Text>
              <View style={styles.checkList}>
                {[
                  "Inspect confirmations before spending.",
                  "Keep automatic coin selection as the default.",
                  "Review all outputs before broadcast.",
                ].map((item) => (
                  <View key={item} style={styles.checkRow}>
                    <Text style={styles.warnMark}>✓</Text>
                    <Text style={styles.checkText}>{item}</Text>
                  </View>
                ))}
              </View>
            </Card>

            <Card tone="inset" style={styles.panel}>
              <Text style={styles.smallLabel}>Future workflow</Text>
              <Text style={styles.panelTitle}>How Coin Control will work</Text>
              <View style={styles.checkList}>
                {[
                  "Load spendable wallet UTXOs for the signing key.",
                  "Select exact coins and review privacy tradeoffs.",
                  "Build locally using selected coins only.",
                  "Review outputs, fee, change, txid, and signed hex.",
                ].map((item, index) => (
                  <View key={item} style={styles.checkRow}>
                    <Text style={styles.warnMark}>{index + 1}.</Text>
                    <Text style={styles.checkText}>{item}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : built && !receipt ? (
          <View style={styles.column}>
            {/* Review: built + signed locally, not yet broadcast. */}
            <Card tone="inset" style={styles.panel}>
              <Text style={styles.smallLabel}>Review transaction</Text>
              <Text style={styles.panelTitle}>
                Signed locally, ready to broadcast
              </Text>

              <View style={styles.reviewGrid}>
                <Card tone="surface" style={styles.reviewTile}>
                  <Text style={styles.smallLabel}>Amount</Text>
                  <Text style={styles.reviewValueGreen}>
                    {satsToBtc(built.amountSatoshis)}
                  </Text>
                </Card>
                <Card tone="surface" style={styles.reviewTile}>
                  <Text style={styles.smallLabel}>Fee</Text>
                  <Text style={styles.reviewValue}>
                    {satsToBtc(built.feeSatoshis)}
                  </Text>
                </Card>
                {built.hasChange ? (
                  <Card tone="surface" style={styles.reviewTile}>
                    <Text style={styles.smallLabel}>Change</Text>
                    <Text style={styles.reviewValue}>
                      {satsToBtc(built.changeSatoshis)}
                    </Text>
                  </Card>
                ) : null}
                <Card tone="surface" style={styles.reviewTile}>
                  <Text style={styles.smallLabel}>Size</Text>
                  <Text style={styles.reviewValue}>{built.vsize} vB</Text>
                </Card>
              </View>

              <Card tone="surface" style={styles.txidCard}>
                <Text style={styles.smallLabel}>Txid</Text>
                <Text style={styles.txidText}>{built.txid}</Text>
              </Card>

              <View style={styles.field}>
                <Text style={styles.smallLabel}>Signed transaction hex</Text>
                <TextInput
                  accessibilityLabel="Signed transaction hex"
                  value={built.hex}
                  editable={false}
                  multiline
                  style={[styles.input, styles.hexInput]}
                />
                <Text style={styles.fieldFooter}>
                  Optional: verify on your node before broadcasting with{" "}
                  <Text style={styles.code}>testmempoolaccept</Text>.
                </Text>
              </View>

              <View style={styles.actionRow}>
                <Button
                  label={broadcasting ? "Broadcasting…" : "Broadcast"}
                  onPress={broadcast}
                  disabled={broadcasting}
                  loading={broadcasting}
                  style={styles.actionButton}
                />
                <Button
                  label="Back to edit"
                  variant="secondary"
                  onPress={cancel}
                  style={styles.actionButton}
                />
              </View>
            </Card>

            <Card tone="inset" style={styles.panel}>
              <Text style={styles.smallLabel}>Broadcast checklist</Text>
              <Text style={styles.panelTitle}>Confirm before sending</Text>
              <View style={styles.checkList}>
                {[
                  "Recipient address is correct.",
                  "Amount and fee are expected.",
                  "Signed transaction hex is available for node review.",
                  "Broadcast is a separate final action.",
                ].map((item) => (
                  <View key={item} style={styles.checkRow}>
                    <Text style={styles.checkMark}>✓</Text>
                    <Text style={styles.checkText}>{item}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : receipt ? (
          <View style={styles.column}>
            <Alert tone="success" style={styles.receiptCard}>
              <Text style={styles.receiptEyebrow}>Broadcast receipt</Text>
              <Text style={styles.receiptTitle}>
                Broadcast {receipt.accepted ? "accepted" : "submitted"}
              </Text>
              <Text style={styles.receiptTxid}>
                Txid: <Text style={styles.mono}>{receipt.txid}</Text>
              </Text>
            </Alert>

            <Card tone="inset" style={styles.panel}>
              <Text style={styles.smallLabel}>Next step</Text>
              <Text style={styles.panelTitle}>Track confirmation</Text>
              <Text style={styles.panelBody}>
                Your transaction has been handed to the adapter for relay. Watch
                your wallet activity and node indexer for confirmation status.
              </Text>
              <Button
                label="Send another"
                variant="secondary"
                size="sm"
                onPress={cancel}
                style={styles.proButton}
              />
            </Card>
          </View>
        ) : (
          <Card tone="inset" style={styles.panel}>
            <Text style={styles.smallLabel}>Review</Text>
            <Text style={styles.panelTitle}>No transaction built yet</Text>
            <Text style={styles.panelBody}>
              Complete the Simple send form to build a locally signed transaction.
              You will review the amount, fee, change, txid, and signed hex before
              broadcasting.
            </Text>
            <Button
              label="Open Simple Send"
              size="sm"
              onPress={() => setSelectedTab("simple")}
              style={styles.proButton}
            />
          </Card>
        )}
      </Card>

      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={closeScanner}
        presentationStyle="fullScreen"
      >
        <QrScanner onDecode={onScanDecode} onClose={closeScanner} />
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  hero: {
    padding: 20,
  },
  heroEyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: ECASH[500],
  },
  heroTitle: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: "900",
    color: "#ffffff",
  },
  heroBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: GRAY[400],
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  body: {
    padding: 16,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRAY[800],
  },
  tab: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: GRAY[950],
  },
  tabActive: {
    backgroundColor: ECASH[600],
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: GRAY[400],
  },
  tabTextActive: {
    color: "#ffffff",
  },
  errorAlert: {
    marginTop: 24,
  },
  errorText: {
    fontSize: 14,
  },
  column: {
    marginTop: 24,
    gap: 16,
  },
  panel: {
    padding: 20,
  },
  panelTitle: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff",
  },
  panelBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: GRAY[500],
  },
  field: {
    marginTop: 20,
  },
  fieldLabel: {
    marginBottom: 4,
    fontSize: 14,
    fontWeight: "600",
    color: GRAY[300],
  },
  addressRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GRAY[700],
    backgroundColor: GRAY[900],
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: "#ffffff",
  },
  addressInput: {
    flex: 1,
  },
  scanButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GRAY[700],
    backgroundColor: GRAY[800],
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
  },
  scanButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  fieldFooter: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 20,
    color: GRAY[600],
  },
  code: {
    color: GRAY[300],
  },
  feeCard: {
    marginTop: 20,
    padding: 16,
    gap: 6,
  },
  smallLabel: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: GRAY[500],
  },
  feeValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  submit: {
    marginTop: 24,
  },
  checkList: {
    marginTop: 20,
    gap: 12,
  },
  checkRow: {
    flexDirection: "row",
    gap: 8,
  },
  checkMark: {
    color: ECASH[400],
  },
  warnMark: {
    color: "#fbbf24",
  },
  checkText: {
    flex: 1,
    fontSize: 14,
    color: GRAY[300],
  },
  proHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  proEyebrow: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#fbbf24",
  },
  proBody: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 22,
    color: GRAY[300],
  },
  proButton: {
    marginTop: 20,
    alignSelf: "flex-start",
  },
  advancedHead: {
    gap: 12,
  },
  coinControl: {
    marginTop: 24,
    padding: 20,
  },
  previewTotalCard: {
    marginTop: 16,
    padding: 16,
  },
  previewTotal: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "900",
    color: "#fbbf24",
  },
  previewHint: {
    marginTop: 4,
    fontSize: 12,
    color: GRAY[500],
  },
  proGate: {
    marginTop: 20,
    padding: 20,
  },
  tableHeadRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRAY[800],
  },
  tableHeadCell: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: GRAY[500],
  },
  tableRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRAY[900],
    gap: 6,
  },
  tableCellRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  tableValue: {
    flexShrink: 1,
    fontSize: 14,
    color: GRAY[300],
  },
  tableAmount: {
    flexShrink: 1,
    fontSize: 14,
    color: "#fbbf24",
  },
  tableMono: {
    flexShrink: 1,
    fontSize: 12,
    color: GRAY[500],
  },
  disabledRow: {
    marginTop: 20,
    gap: 12,
  },
  previewNote: {
    marginTop: 20,
    padding: 16,
  },
  reviewGrid: {
    marginTop: 24,
    gap: 12,
  },
  reviewTile: {
    padding: 16,
  },
  reviewValueGreen: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "900",
    color: ECASH[400],
  },
  reviewValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "900",
    color: GRAY[200],
  },
  txidCard: {
    marginTop: 20,
    padding: 16,
    gap: 8,
  },
  txidText: {
    fontSize: 12,
    color: ECASH[400],
  },
  hexInput: {
    minHeight: 96,
    textAlignVertical: "top",
    fontSize: 12,
    color: GRAY[300],
    backgroundColor: GRAY[950],
  },
  actionRow: {
    marginTop: 24,
    gap: 12,
  },
  actionButton: {
    alignSelf: "flex-start",
  },
  receiptCard: {
    padding: 20,
    gap: 8,
  },
  receiptEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  receiptTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff",
  },
  receiptTxid: {
    fontSize: 14,
  },
  mono: {
    fontSize: 13,
  },
});
