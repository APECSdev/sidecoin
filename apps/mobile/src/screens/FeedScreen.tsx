// apps/mobile/src/screens/FeedScreen.tsx
//
// MOCK — the "Feed" bottom tab.
//
// SCOPE NOTE (requested by the operator): the real screen is an integrated
// Nostr client plus other direct-comms channels in one continuous scroll.
// This file is a MOCK: it renders a representative feed with static,
// clearly-labelled sample data so the navigation shell can be reviewed. There
// is NO network client, NO key management, and NO relay connection here.
//
// The data below is explicitly labelled as sample content in the UI so the
// screen never presents fabricated activity as real.

import React from "react";
import { StyleSheet, View } from "react-native";

import { GRAY } from "../theme/colors";
import {
  Badge,
  Body,
  Card,
  Eyebrow,
  Mono,
  Muted,
  Screen,
  Subtitle,
  Title,
} from "../components/ui";

/** A single feed entry — a Nostr note or a direct-comms message. */
interface FeedItem {
  /** "nostr" notes are public; "dm" entries are end-to-end encrypted. */
  kind: "nostr" | "dm";
  /** Display name of the author. */
  author: string;
  /** Relay or transport the entry arrived over. */
  channel: string;
  /** Short, human-readable age. */
  age: string;
  /** Message body. */
  body: string;
}

/**
 * Static sample content. Every value here is a literal — nothing is fetched.
 * It exists to exercise the layout (mixed public/encrypted entries in one
 * continuous scroll), not to represent real activity.
 */
const SAMPLE_FEED: FeedItem[] = [
  {
    kind: "nostr",
    author: "sztorc.fan",
    channel: "wss://relay.damus.io",
    age: "2m",
    body:
      "Drivechain BIP-300 discussion is heating up. The sidechain slot registry is public — every slot has an owner and a payout address.",
  },
  {
    kind: "dm",
    author: "bitnames_dev",
    channel: "encrypted",
    age: "14m",
    body:
      "Registered a new name on slot 2. The drivechain address derivation is index-based, so each registration lands on the next unused index.",
  },
  {
    kind: "nostr",
    author: "thunder_user",
    channel: "wss://nos.lol",
    age: "1h",
    body:
      "Thunder deposits cleared. Slot 9 shows the balance and the deposit history once the indexer catches up.",
  },
  {
    kind: "dm",
    author: "ecx_alerts",
    channel: "encrypted",
    age: "3h",
    body:
      "Reminder: the L1 fee rate defaults to a flat 2 szats/vB. Adjust it per-transaction on the Send screen.",
  },
];

export function FeedScreen(): React.JSX.Element {
  return (
    <Screen>
      <Eyebrow>Feed</Eyebrow>
      <Title>Feed</Title>
      <Subtitle>
        Public notes and encrypted direct messages, newest first, in one
        continuous scroll.
      </Subtitle>

      <Badge label="Mock data — no relays connected" tone="warning" />

      <View style={styles.list}>
        {SAMPLE_FEED.map((item, index) => (
          <Card
            key={`${item.author}-${item.age}-${index}`}
            tone="surface"
            testID={`feed-item-${index}`}
          >
            <View style={styles.row}>
              <Body style={styles.author}>{item.author}</Body>
              <Badge
                label={item.kind === "nostr" ? "Nostr" : "Encrypted"}
                tone={item.kind === "nostr" ? "neutral" : "active"}
              />
            </View>

            <Muted style={styles.meta}>
              {item.channel} · {item.age}
            </Muted>

            <Body style={styles.body}>{item.body}</Body>
          </Card>
        ))}
      </View>

      <Card tone="inset">
        <Eyebrow>Planned</Eyebrow>
        <Body>
          This is a mock. The real screen will connect to Nostr relays and the
          direct-comms transports, then merge both streams into this scroll.
        </Body>
        <Mono style={styles.planned}>No network client is wired yet.</Mono>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 16,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  author: {
    fontWeight: "700",
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: GRAY[500],
  },
  body: {
    marginTop: 8,
  },
  planned: {
    marginTop: 8,
  },
});
