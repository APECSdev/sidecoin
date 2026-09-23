// apps/mobile/src/components/bitnames/CoinNewsComposer.tsx
//
// Ported from apps/wallet/src/components/bitnames/CoinNewsComposer.vue.
//
// Ported 1:1. Builds a v2 Coin News OP_RETURN transaction LOCALLY, shows the
// signed hex + payload hex for review, then broadcasts only when the user
// presses the explicit Broadcast button. The feed selector, title/link/body
// inputs with their UTF-8 byte counters, the posting-safety list, the review
// grid, and the broadcast receipt are all carried over.
//
// Platform substitutions, no logic loss:
//   • `<select>` -> a pressable option list.
//   • `<input>/<textarea>` -> TextInput (multiline for body/hex review).
//   • `<form @submit.prevent>` -> a Build button (no HTML form in RN).
//   • The read-only hex review fields keep `editable={false}`.

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  ApiError,
  L1_CHAIN_ID,
  broadcastTransaction,
  getL1Utxos,
  satsToBtc,
  type BroadcastReceipt,
} from "../../api";
import { loadWallet } from "../../keystore";
import { toSpendableUtxo } from "../../send";
import {
  buildAndSignOpReturnTransaction,
  buildOpReturnScript,
  deriveSigningKey,
  encodeCoinNewsV2,
  selectCoinsForOpReturn,
  type CoinNewsFeedSlug,
  type SignedOpReturnTransaction,
} from "@sidecoin/shared";
import { ECASH, GRAY } from "../../theme/colors";
import { Button, Card, SectionTitle } from "../ui";

const FEE_RATE_SAT_PER_VB = 2;
const MAX_COIN_NEWS_FIELD_BYTES = 255;
const textEncoder = new TextEncoder();

const feedOptions: { value: CoinNewsFeedSlug; label: string }[] = [
  { value: "us-weekly", label: "US Weekly" },
  { value: "japan-weekly", label: "Japan Weekly" },
  { value: "nascar", label: "NASCAR" },
  { value: "nostr", label: "Nostr" },
];

interface BuiltCoinNewsTransaction extends SignedOpReturnTransaction {
  feed: CoinNewsFeedSlug;
  title: string;
  link: string | null;
  body: string | null;
  payloadBytes: number;
  payloadHex: string;
  opReturnScriptBytes: number;
}

function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizedOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatCoins(sats: bigint): string {
  return `${satsToBtc(sats)} eCash`;
}

export function CoinNewsComposer(): React.JSX.Element {
  const [feed, setFeed] = useState<CoinNewsFeedSlug>("us-weekly");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [body, setBody] = useState("");
  const [building, setBuilding] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [built, setBuilt] = useState<BuiltCoinNewsTransaction | null>(null);
  const [receipt, setReceipt] = useState<BroadcastReceipt | null>(null);

  const titleBytes = utf8ByteLength(title.trim());
  const linkBytes = utf8ByteLength(link.trim());
  const bodyBytes = utf8ByteLength(body.trim());

  const canBuild =
    title.trim().length > 0 && !building && !broadcasting;

  async function buildNewsTransaction(): Promise<void> {
    setBuilding(true);
    setError(null);
    setBuilt(null);
    setReceipt(null);

    try {
      const wallet = await loadWallet();
      if (!wallet) {
        setError("No wallet found. Complete wallet setup first.");
        return;
      }

      const draftTitle = title.trim();
      const draftLink = normalizedOptional(link);
      const draftBody = normalizedOptional(body);

      const payload = encodeCoinNewsV2({
        feed,
        title: draftTitle,
        link: draftLink,
        body: draftBody,
      });
      const opReturnScript = buildOpReturnScript(payload);

      const key = deriveSigningKey(wallet.mnemonic, wallet.network, 0);
      const utxoSet = await getL1Utxos(key.address, {}, wallet.network);

      if (utxoSet.truncated) {
        setError(
          "The UTXO set was truncated upstream; refusing to build from an " +
            "incomplete set. Please try again shortly.",
        );
        return;
      }

      const spendable = utxoSet.utxos.map(toSpendableUtxo);
      const selection = selectCoinsForOpReturn({
        utxos: spendable,
        opReturnScriptLength: opReturnScript.length,
        feeRateSatPerVb: FEE_RATE_SAT_PER_VB,
      });

      const signed = buildAndSignOpReturnTransaction({
        network: wallet.network,
        selectedUtxos: selection.selectedUtxos,
        opReturnScript,
        feeSatoshis: selection.feeSatoshis,
        changeScriptPubKey: key.scriptPubKey,
        signingKeys: [key],
      });

      setBuilt({
        ...signed,
        feed,
        title: draftTitle,
        link: draftLink,
        body: draftBody,
        payloadBytes: payload.length,
        payloadHex: bytesToHex(payload),
        opReturnScriptBytes: opReturnScript.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  }

  async function broadcastNewsTransaction(): Promise<void> {
    if (!built) return;

    setBroadcasting(true);
    setError(null);

    try {
      const wallet = await loadWallet();
      const network = wallet?.network ?? "signet";
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

  function resetComposer(): void {
    setBuilt(null);
    setReceipt(null);
    setError(null);
  }

  return (
    <Card style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.growShrink}>
          <Text style={styles.eyebrowBlue}>Local OP_RETURN signing</Text>
          <SectionTitle style={styles.title}>Compose Coin News</SectionTitle>
          <Text style={styles.bodyText}>
            Build a v2 Coin News OP_RETURN transaction locally, review the signed
            hex, then broadcast explicitly. SupaQt only indexes the post after
            the wallet broadcasts it.
          </Text>
        </View>

        <View style={styles.networkPill}>
          <Text style={styles.networkPillText}>Signet</Text>
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.form}>
        <View style={styles.fields}>
          <Text style={styles.fieldLabel}>Feed</Text>
          <View style={styles.feedOptions}>
            {feedOptions.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: feed === option.value }}
                onPress={() => setFeed(option.value)}
                style={[
                  styles.feedOption,
                  feed === option.value ? styles.feedOptionActive : null,
                ]}
              >
                <Text style={styles.feedOptionText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            autoComplete="off"
            placeholder="Introducing SidΞcoin"
            placeholderTextColor={GRAY[600]}
            style={styles.input}
          />
          <Text style={styles.helpText}>
            Required. Encoded as UTF-8 with a one-byte length prefix.{" "}
            {titleBytes} / {MAX_COIN_NEWS_FIELD_BYTES} bytes.
          </Text>

          <Text style={styles.fieldLabel}>Link</Text>
          <TextInput
            value={link}
            onChangeText={setLink}
            autoComplete="off"
            keyboardType="url"
            placeholder="https://sidecoin.app/markets"
            placeholderTextColor={GRAY[600]}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Text style={styles.helpText}>
            Optional TLV 0x01. {linkBytes} / {MAX_COIN_NEWS_FIELD_BYTES} bytes.
          </Text>

          <Text style={styles.fieldLabel}>Body</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={5}
            placeholder="Short public post body..."
            placeholderTextColor={GRAY[600]}
            style={[styles.input, styles.textArea]}
          />
          <Text style={styles.helpText}>
            Optional TLV 0x02. {bodyBytes} / {MAX_COIN_NEWS_FIELD_BYTES} bytes. Do
            not post secrets.
          </Text>
        </View>

        <View style={styles.aside}>
          <Text style={styles.asideEyebrow}>Posting safety</Text>
          <SectionTitle style={styles.asideTitle}>Public and permanent</SectionTitle>

          <View style={styles.safetyList}>
            {[
              "Transaction is built and signed locally.",
              "Broadcast happens only after review.",
              "Author is not encoded in Phase 1.",
              "Flag byte is omitted unless protocol semantics are defined.",
              "Title, link, and body are each capped at 255 UTF-8 bytes.",
            ].map((item) => (
              <View key={item} style={styles.safetyRow}>
                <Text style={styles.safetyCheck}>✓</Text>
                <Text style={styles.safetyText}>{item}</Text>
              </View>
            ))}
          </View>

          <Button
            label={building ? "Building…" : "Build Signed News Transaction"}
            disabled={!canBuild}
            style={styles.buildButton}
            onPress={() => void buildNewsTransaction()}
          />

          {built ? (
            <Button
              label="Edit draft"
              variant="secondary"
              style={styles.editButton}
              onPress={resetComposer}
            />
          ) : null}
        </View>
      </View>

      {built ? (
        <Card tone="inset" style={styles.review}>
          <View style={styles.reviewHeader}>
            <View style={styles.growShrink}>
              <Text style={styles.reviewEyebrow}>Review before broadcast</Text>
              <SectionTitle style={styles.reviewTitle}>
                Signed locally, ready to broadcast
              </SectionTitle>
            </View>

            <Button
              label={
                broadcasting ? "Broadcasting…" : "Broadcast News Transaction"
              }
              variant="primary"
              disabled={broadcasting}
              style={styles.broadcastButton}
              onPress={() => void broadcastNewsTransaction()}
            />
          </View>

          <View style={styles.reviewGrid}>
            <ReviewTile label="Feed" value={built.feed} mono />
            <ReviewTile
              label="Fee"
              value={formatCoins(built.feeSatoshis)}
              mono
              valueColor={ECASH[400]}
            />
            <ReviewTile
              label="Change"
              value={formatCoins(built.changeSatoshis)}
              mono
            />
            <ReviewTile label="Payload" value={`${built.payloadBytes} bytes`} mono />
            <ReviewTile
              label="OP_RETURN script"
              value={`${built.opReturnScriptBytes} bytes`}
              mono
            />
            <ReviewTile label="TxID" value={built.txid} mono small />
          </View>

          <Text style={styles.hexLabel}>Coin News payload hex</Text>
          <TextInput
            value={built.payloadHex}
            editable={false}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.hexInput]}
          />

          <Text style={styles.hexLabel}>Signed transaction hex</Text>
          <TextInput
            value={built.hex}
            editable={false}
            multiline
            numberOfLines={5}
            style={[styles.input, styles.hexInput]}
          />

          {receipt ? (
            <View style={styles.receipt}>
              <Text style={styles.receiptTitle}>Broadcast receipt</Text>
              <Text style={styles.receiptText}>
                {receipt.accepted ? "Accepted" : "Submitted"} on{" "}
                {receipt.chainId}.
              </Text>
              <Text style={styles.receiptTxid}>{receipt.txid}</Text>
            </View>
          ) : null}
        </Card>
      ) : null}
    </Card>
  );
}

function ReviewTile({
  label,
  value,
  mono = false,
  small = false,
  valueColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
  valueColor?: string;
}): React.JSX.Element {
  return (
    <View style={styles.reviewTile}>
      <Text style={styles.reviewTileLabel}>{label}</Text>
      <Text
        style={[
          styles.reviewTileValue,
          mono ? styles.mono : null,
          small ? styles.reviewTileValueSmall : null,
          valueColor ? { color: valueColor } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderColor: "#1e40af66",
    backgroundColor: "#1725541a",
    padding: 20,
  },
  headerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  growShrink: {
    flexShrink: 1,
  },
  eyebrowBlue: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 4,
    color: "#60a5fa",
  },
  title: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "900",
  },
  bodyText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 22,
    color: GRAY[400],
  },
  networkPill: {
    borderWidth: 1,
    borderColor: "#16a34a4d",
    backgroundColor: "#052e1666",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  networkPillText: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: ECASH[300],
  },
  errorText: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#991b1b",
    borderRadius: 12,
    backgroundColor: "#450a0a4d",
    padding: 16,
    fontSize: 13,
    color: "#f87171",
  },
  form: {
    marginTop: 24,
    gap: 20,
  },
  fields: {
    gap: 16,
  },
  fieldLabel: {
    marginBottom: 4,
    fontSize: 13,
    fontWeight: "600",
    color: GRAY[300],
  },
  feedOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  feedOption: {
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 8,
    backgroundColor: GRAY[900],
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  feedOptionActive: {
    borderColor: ECASH[500],
  },
  feedOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 8,
    backgroundColor: GRAY[900],
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 14,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  helpText: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 18,
    color: GRAY[600],
  },
  aside: {
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 12,
    backgroundColor: GRAY[950],
    padding: 20,
  },
  asideEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 2.5,
    color: GRAY[500],
  },
  asideTitle: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "900",
  },
  safetyList: {
    marginTop: 20,
    gap: 12,
  },
  safetyRow: {
    flexDirection: "row",
    gap: 8,
  },
  safetyCheck: {
    color: ECASH[400],
  },
  safetyText: {
    flexShrink: 1,
    fontSize: 13,
    color: GRAY[300],
    lineHeight: 20,
  },
  buildButton: {
    marginTop: 24,
  },
  editButton: {
    marginTop: 12,
  },
  review: {
    marginTop: 24,
    borderColor: GRAY[800],
    padding: 20,
  },
  reviewHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  reviewEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 2.5,
    color: GRAY[500],
  },
  reviewTitle: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "900",
  },
  broadcastButton: {
    alignSelf: "flex-start",
  },
  reviewGrid: {
    marginTop: 20,
    gap: 12,
  },
  reviewTile: {
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 12,
    backgroundColor: GRAY[900],
    padding: 16,
  },
  reviewTileLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 2.5,
    color: GRAY[500],
  },
  reviewTileValue: {
    marginTop: 8,
    fontSize: 13,
    color: "#ffffff",
  },
  reviewTileValueSmall: {
    fontSize: 11,
  },
  mono: {
    fontFamily: "monospace",
  },
  hexLabel: {
    marginTop: 20,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: "600",
    color: GRAY[300],
  },
  hexInput: {
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    fontSize: 11,
    fontFamily: "monospace",
    color: GRAY[300],
  },
  receipt: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: ECASH[800],
    borderRadius: 12,
    backgroundColor: "#052e164d",
    padding: 16,
  },
  receiptTitle: {
    fontWeight: "900",
    color: "#ffffff",
  },
  receiptText: {
    marginTop: 8,
    fontSize: 13,
    color: ECASH[300],
  },
  receiptTxid: {
    marginTop: 8,
    fontSize: 11,
    color: ECASH[300],
    fontFamily: "monospace",
  },
});
