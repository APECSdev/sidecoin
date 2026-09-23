// apps/mobile/src/screens/FeedScreen.tsx
//
// The "Feed" bottom tab.
//
// The feed is ONE interleaved timeline, not a set of sections:
//
//   • REAL  — individual Coin News posts, fetched from the same
//             SupaQt-backed endpoints the dashboard uses
//             (getCoinNewsPosts for the US Weekly and Japan Weekly feeds).
//   • MOCK  — the Nostr / direct-comms stream. There is NO relay client, NO key
//             management, and NO transport; it renders static sample data.
//
// The real news posts and the mock entries are shuffled together so the feed
// reads like a stream. Because the two sources are interleaved, each item is
// badged on its own (`Live` for a real Coin News post, `Mock` for the sample
// entries) — a section-level banner would be ambiguous once the rows are
// mixed. A short legend at the top states the same thing in words.
//
// The previous revision mounted <CoinNewsPreview> as a single block above a
// mock section. That made Coin News an entire section rather than part of the
// stream, which is what this revision changes.

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  getCoinNewsPosts,
  type CoinNewsPost,
} from "../api";

/** A single timeline entry — a real news post, a Nostr note, or a DM. */
interface FeedItem {
  /** Source discriminator. `news` entries are real; the others are mock. */
  kind: "news" | "nostr" | "dm";
  /** Display name of the author. */
  author: string;
  /** Relay, transport, or feed the entry arrived over. */
  channel: string;
  /** Short, human-readable age. */
  age: string;
  /** Message body (for news entries, the post title). */
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

/** Turn a real Coin News post into a timeline entry. */
function newsToFeedItem(post: CoinNewsPost, feedLabel: string): FeedItem {
  return {
    kind: "news",
    author: post.author ?? feedLabel,
    channel: `Coin News · ${feedLabel}`,
    age: formatAge(post.created_at),
    body: post.title,
  };
}

/** Human-readable age from a Unix-seconds timestamp. */
function formatAge(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "—";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Fisher–Yates shuffle over a copy, seeded by `seed`. A seed keeps the order
 * stable for a given mount while still mixing the two sources randomly, so a
 * re-render does not reshuffle the list under the user's thumb.
 */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  let state = seed || 1;
  const next = () => {
    // Deterministic LCG (numerical recipes) mapped to [0, 1).
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function FeedScreen(): React.JSX.Element {
  const [newsItems, setNewsItems] = useState<FeedItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);
  // One seed per mount, so the interleave order is stable while the screen is
  // open but differs between visits.
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));

  const loadNews = useCallback(async () => {
    setNewsLoading(true);
    setNewsError(null);
    try {
      const [us, japan] = await Promise.all([
        getCoinNewsPosts("us-weekly", { limit: 10 }),
        getCoinNewsPosts("japan-weekly", { limit: 10 }),
      ]);
      setNewsItems([
        ...us.posts.map((post) => newsToFeedItem(post, "US Weekly")),
        ...japan.posts.map((post) => newsToFeedItem(post, "Japan Weekly")),
      ]);
    } catch (e) {
      console.error("[FeedScreen] Failed to load Coin News posts:", e);
      setNewsItems([]);
      setNewsError("Live Coin News posts are unavailable.");
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  // Real news + mock entries, shuffled into one stream.
  const timeline = useMemo(
    () => shuffle([...newsItems, ...SAMPLE_FEED], seed),
    [newsItems, seed],
  );

  return (
    <Screen>
      <Eyebrow>Feed</Eyebrow>
      <Title>Feed</Title>
      <Subtitle>
        Live Coin News posts mixed with public notes and encrypted direct
        messages, newest first, in one continuous scroll.
      </Subtitle>

      {/*
       * Legend. Once the rows are interleaved a single section banner cannot
       * say which item is which, so each row carries its own badge and this
       * line explains the two badges.
       */}
      <Muted style={styles.legend}>
        Mock data (Nostr notes and encrypted messages) is labelled "Mock"; no
        relays are connected. "Live" items are real Coin News posts fetched
        from the SupaQt feed index.
      </Muted>

      {newsLoading ? (
        <Muted style={styles.loadingText}>Loading live Coin News posts…</Muted>
      ) : newsError ? (
        <Muted style={styles.warningText}>{newsError}</Muted>
      ) : null}

      <View style={styles.list}>
        {timeline.map((item, index) => (
          <Card
            key={`${item.channel}-${item.body.slice(0, 24)}-${index}`}
            tone="surface"
            testID={`feed-item-${index}`}
          >
            <View style={styles.row}>
              <Body style={styles.author}>{item.author}</Body>
              <Badge
                label={item.kind === "news" ? "Live" : "Mock"}
                tone={item.kind === "news" ? "active" : "warning"}
              />
            </View>

            <View style={styles.tagRow}>
              <Muted style={styles.meta}>
                {item.channel} · {item.age}
              </Muted>
              {item.kind === "dm" ? (
                <Badge label="Encrypted" tone="neutral" />
              ) : item.kind === "nostr" ? (
                <Badge label="Nostr" tone="neutral" />
              ) : null}
            </View>

            <Body style={styles.body}>{item.body}</Body>
          </Card>
        ))}
      </View>

      <Card tone="inset">
        <Eyebrow>Planned</Eyebrow>
        <Body>
          Nostr relay connections are not implemented. The Mock entries above
          are sample data and no relay client is wired yet.
        </Body>
        <Mono style={styles.planned}>No relay client is wired yet.</Mono>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  legend: {
    marginTop: 8,
    fontSize: 12,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 12,
    color: GRAY[500],
  },
  warningText: {
    marginTop: 12,
    fontSize: 12,
    color: GRAY[400],
  },
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
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  meta: {
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
