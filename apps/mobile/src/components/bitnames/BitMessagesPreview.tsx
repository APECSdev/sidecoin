// apps/mobile/src/components/bitnames/BitMessagesPreview.tsx
//
// Ported 1:1 from apps/wallet/src/components/bitnames/BitMessagesPreview.vue.
//
// BitNames identity surface: the Coin News feed (via CoinNewsPreview) beside
// an identity card, the broadcast-news composer launcher, a contact list, and
// the selected BitNames thread.
//
// The Vue original used `v-model:selected-contact-name`; the RN port takes
// `selectedContactName` + `onSelectContact` to express the same two-way
// binding. `openFeedComposer` bumps a nonce that CoinNewsPreview watches to
// open its composer, exactly like the Vue `composerOpenNonce` ref.
//
// The Vue original lays the feed and aside out in two columns at `xl`; a
// phone is always narrower than `xl`, so the RN version stacks them.

import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CoinNewsPreview } from "./CoinNewsPreview";
import { GRAY } from "../../theme/colors";

export interface BitNamesContact {
  name: string;
  displayName: string;
  useCase: string;
  status: string;
  lastSeen: string;
  paymentHint: string;
}

export interface BitNamesMessage {
  contact: string;
  side: "sent" | "received";
  time: string;
  body: string;
}

export interface BitMessagesPreviewProps {
  contacts: BitNamesContact[];
  messages: BitNamesMessage[];
  selectedContactName: string;
  onSelectContact: (contactName: string) => void;
}

export function BitMessagesPreview({
  contacts,
  messages,
  selectedContactName,
  onSelectContact,
}: BitMessagesPreviewProps): React.JSX.Element {
  const [composerOpenNonce, setComposerOpenNonce] = useState(0);

  const selectedContact = contacts.find(
    (contact) => contact.name === selectedContactName,
  );

  const selectedConversation = messages.filter(
    (message) => message.contact === selectedContactName,
  );

  const selectContact = useCallback(
    (contactName: string) => {
      onSelectContact(contactName);
    },
    [onSelectContact],
  );

  const openFeedComposer = useCallback(() => {
    setComposerOpenNonce((value) => value + 1);
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={styles.heroBody}>
          <View style={styles.heroEyebrowRow}>
            <Text style={styles.heroEyebrow}>BitNames identity</Text>
            <View style={styles.livePill}>
              <Text style={styles.livePillText}>Live Coin News</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>BitMessages</Text>
          <Text style={styles.heroSubtitle}>
            Broadcast signed posts, weekly news, and BitNames-linked messages
            across Signet from one wallet-native identity surface.
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statValueAmber}>—</Text>
            <Text style={styles.statLabel}>Messages</Text>
          </View>
          <View style={[styles.statCell, styles.statCellBordered]}>
            <Text style={styles.statValueEcash}>Live</Text>
            <Text style={styles.statLabel}>News</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValueEcash}>Signet</Text>
            <Text style={styles.statLabel}>Network</Text>
          </View>
        </View>
      </View>

      <View style={styles.feed}>
        <CoinNewsPreview
          showHero={false}
          composerOpenNonce={composerOpenNonce}
        />
      </View>

      <View style={styles.aside}>
        <View style={styles.section}>
          <View style={styles.identityHeader}>
            <View style={styles.identityHeaderText}>
              <Text style={styles.eyebrow}>Identity</Text>
              <Text style={styles.sectionTitle}>
                {selectedContact?.name ?? "No live identity selected"}
              </Text>
            </View>
            {selectedContact ? (
              <View style={styles.resolvedPill}>
                <Text style={styles.resolvedPillText}>Resolved</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.detailList}>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Default feed</Text>
              <Text style={styles.detailValue}>Live indexed feed</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Message fee</Text>
              <Text style={styles.detailValueMono}>Indexed live</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Contact</Text>
              <Text style={styles.detailValueMono}>
                {selectedContact?.name ?? "—"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Broadcast News</Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoBoxTitle}>Local composer available</Text>
            <Text style={styles.infoBoxBody}>
              Use the Coin News feed panel to build, sign, review, and broadcast
              a wallet-controlled OP_RETURN post.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={openFeedComposer}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Open Feed Composer</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contacts</Text>

          {contacts.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                No live BitNames contacts are indexed yet.
              </Text>
            </View>
          ) : (
            <View style={styles.contactList}>
              {contacts.map((contact) => (
                <Pressable
                  key={contact.name}
                  accessibilityRole="button"
                  onPress={() => selectContact(contact.name)}
                  style={[
                    styles.contactButton,
                    selectedContactName === contact.name
                      ? styles.contactButtonSelected
                      : null,
                  ]}
                >
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactUseCase}>{contact.useCase}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BitNames Thread</Text>
          <Text style={styles.threadHint}>
            {selectedContact?.paymentHint ??
              "No live BitNames conversation selected."}
          </Text>

          {selectedConversation.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                No live BitNames messages are indexed yet.
              </Text>
            </View>
          ) : (
            <View style={styles.threadList}>
              {selectedConversation.map((message) => (
                <View
                  key={`${message.contact}-${message.time}-${message.body}`}
                  style={styles.threadMessage}
                >
                  <Text style={styles.threadBody}>{message.body}</Text>
                  <Text style={styles.threadTime}>{message.time}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 24,
    gap: 24,
  },
  hero: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 24,
    gap: 20,
  },
  heroBody: {
    gap: 12,
  },
  heroEyebrowRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  heroEyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#4ade80",
  },
  livePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.4)",
    backgroundColor: "rgba(5,46,22,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  livePillText: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#86efac",
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#ffffff",
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: GRAY[400],
  },
  statsRow: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 12,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statCellBordered: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: GRAY[800],
  },
  statValueAmber: {
    fontSize: 18,
    fontWeight: "900",
    color: "#fbbf24",
  },
  statValueEcash: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4ade80",
  },
  statLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: GRAY[500],
  },
  feed: {
    gap: 24,
  },
  aside: {
    gap: 24,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 20,
  },
  identityHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  identityHeaderText: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: GRAY[500],
  },
  sectionTitle: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff",
  },
  resolvedPill: {
    borderRadius: 999,
    backgroundColor: "#052e16",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  resolvedPillText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#86efac",
  },
  detailList: {
    marginTop: 20,
    gap: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  detailKey: {
    fontSize: 14,
    color: GRAY[500],
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: GRAY[200],
  },
  detailValueMono: {
    fontSize: 14,
    fontFamily: "monospace",
    color: GRAY[200],
  },
  infoBox: {
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    padding: 16,
  },
  infoBoxTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  infoBoxBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: GRAY[400],
  },
  primaryButton: {
    marginTop: 20,
    borderRadius: 8,
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff",
  },
  contactList: {
    marginTop: 16,
    gap: 8,
  },
  contactButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  contactButtonSelected: {
    borderColor: "#16a34a",
    backgroundColor: "rgba(5,46,22,0.3)",
  },
  contactName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  contactUseCase: {
    marginTop: 4,
    fontSize: 12,
    color: GRAY[500],
  },
  emptyBox: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    padding: 16,
  },
  emptyText: {
    fontSize: 14,
    color: GRAY[500],
  },
  threadHint: {
    marginTop: 4,
    fontSize: 14,
    color: GRAY[500],
  },
  threadList: {
    marginTop: 20,
    gap: 12,
  },
  threadMessage: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    padding: 12,
  },
  threadBody: {
    fontSize: 14,
    lineHeight: 22,
    color: GRAY[200],
  },
  threadTime: {
    marginTop: 8,
    fontSize: 12,
    color: GRAY[500],
  },
});
