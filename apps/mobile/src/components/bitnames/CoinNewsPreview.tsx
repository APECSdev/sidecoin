// apps/mobile/src/components/bitnames/CoinNewsPreview.tsx
//
// Ported from apps/wallet/src/components/bitnames/CoinNewsPreview.vue.
//
// Ported 1:1. Loads the live Coin News feeds + US Weekly posts (and the Japan
// Weekly BitNames feed when showJapanFeed is set), renders the hero stats, the
// US Weekly table, and the optional Japan Weekly table. The "Broadcast News"
// button opens the composer (unless dashboard mode).
//
// Platform substitutions, no logic loss:
//   • `<table>` -> a stack of Row views (RN has no HTML table). The columns
//     (Date / Fee / Title) and row order are preserved exactly.
//   • `onMounted(loadCoinNews)` -> a mount-time useEffect.
//   • The nonce `watch` still guards on `value > 0 && value !== oldValue`,
//     implemented with a ref that tracks the previous nonce.
//   • `scrollIntoView` on the composer host has no RN analogue; the composer
//     is rendered inline right below the hero, matching the Vue layout order.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  getCoinNewsFeeds,
  getCoinNewsPosts,
  satsToBtc,
  type CoinNewsFeed,
  type CoinNewsPost,
} from "../../api";
import { ECASH, GRAY, SC } from "../../theme/colors";
import { Card, Muted, SectionTitle, Title } from "../ui";
import { CoinNewsComposer } from "./CoinNewsComposer";

export interface CoinNewsPreviewProps {
  dashboard?: boolean;
  showHero?: boolean;
  showJapanFeed?: boolean;
  composerOpenNonce?: number;
}

export function CoinNewsPreview({
  dashboard = false,
  showHero = true,
  showJapanFeed = true,
  composerOpenNonce = 0,
}: CoinNewsPreviewProps): React.JSX.Element {
  const [composerOpen, setComposerOpen] = useState(false);
  const [feeds, setFeeds] = useState<CoinNewsFeed[]>([]);
  const [usWeeklyRows, setUsWeeklyRows] = useState<CoinNewsPost[]>([]);
  const [japanWeeklyRows, setJapanWeeklyRows] = useState<CoinNewsPost[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [usWeeklyLoading, setUsWeeklyLoading] = useState(true);
  const [japanWeeklyLoading, setJapanWeeklyLoading] = useState(true);
  const [feedsError, setFeedsError] = useState<string | null>(null);
  const [usWeeklyError, setUsWeeklyError] = useState<string | null>(null);
  const [japanWeeklyError, setJapanWeeklyError] = useState<string | null>(null);

  const feedsRef = useRef<CoinNewsFeed[]>([]);
  feedsRef.current = feeds;

  const enabledFeeds = feeds.filter((feed) => feed.enabled !== false);

  const totalPostCount = (() => {
    const indexedTotal = feeds.reduce((acc, feed) => {
      return acc + (typeof feed.post_count === "number" ? feed.post_count : 0);
    }, 0);

    if (indexedTotal > 0) {
      return indexedTotal;
    }

    return usWeeklyRows.length + japanWeeklyRows.length;
  })();

  const loadFeeds = useCallback(async () => {
    setFeedsLoading(true);
    setFeedsError(null);

    try {
      setFeeds(await getCoinNewsFeeds());
    } catch (e) {
      console.error("[CoinNewsPreview] Failed to load feeds:", e);
      setFeedsError("Live Coin News feeds are unavailable.");
    } finally {
      setFeedsLoading(false);
    }
  }, []);

  const loadFeedPosts = useCallback(
    async (
      feedId: "us-weekly" | "japan-weekly",
      setRows: (rows: CoinNewsPost[]) => void,
      setLoading: (value: boolean) => void,
      setError: (value: string | null) => void,
    ) => {
      setLoading(true);
      setError(null);

      try {
        const page = await getCoinNewsPosts(feedId, {
          limit: dashboard ? 5 : 10,
        });
        setRows(page.posts);
      } catch (e) {
        console.error(`[CoinNewsPreview] Failed to load ${feedId}:`, e);
        setRows([]);
        setError("Live Coin News posts are unavailable.");
      } finally {
        setLoading(false);
      }
    },
    [dashboard],
  );

  const loadCoinNews = useCallback(async () => {
    await Promise.all([
      loadFeeds(),
      loadFeedPosts(
        "us-weekly",
        setUsWeeklyRows,
        setUsWeeklyLoading,
        setUsWeeklyError,
      ),
      showJapanFeed
        ? loadFeedPosts(
            "japan-weekly",
            setJapanWeeklyRows,
            setJapanWeeklyLoading,
            setJapanWeeklyError,
          )
        : Promise.resolve(),
    ]);
  }, [loadFeeds, loadFeedPosts, showJapanFeed]);

  function formatDate(timestamp: number): string {
    if (!Number.isFinite(timestamp)) {
      return "—";
    }

    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    const month = date.toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");

    return `${date.getUTCFullYear()} ${month} ${day} ${hour}:${minute}`;
  }

  function formatFee(feeSats: string): string {
    try {
      return `${satsToBtc(BigInt(feeSats))} BTC`;
    } catch {
      return "—";
    }
  }

  function feedPostCount(feedId: string, rows: CoinNewsPost[]): number {
    const feed = feedsRef.current.find((candidate) => candidate.id === feedId);
    return typeof feed?.post_count === "number" ? feed.post_count : rows.length;
  }

  const openComposer = useCallback(async () => {
    if (dashboard) {
      return;
    }

    setComposerOpen(true);
  }, [dashboard]);

  // Nonce watcher: `value > 0 && value !== oldValue`. The Vue original calls
  // openComposer() on a changed nonce; the dashboard short-circuit is preserved
  // inside openComposer().
  const prevNonce = useRef(composerOpenNonce);
  useEffect(() => {
    const value = composerOpenNonce;
    const oldValue = prevNonce.current;
    if (value > 0 && value !== oldValue) {
      void openComposer();
    }
    prevNonce.current = value;
  }, [composerOpenNonce, openComposer]);

  useEffect(() => {
    void loadCoinNews();
  }, [loadCoinNews]);

  return (
    <View style={styles.root}>
      {showHero ? (
        <Card style={styles.hero}>
          <View>
            <View style={styles.heroTagRow}>
              <Text style={styles.heroEyebrow}>Broadcast feed</Text>
              <BadgePill />
            </View>

            <Title style={styles.heroTitle}>Coin News</Title>
            <Text style={styles.heroBody}>
              Signed news posts, weekly broadcasts, and BitNames-linked messages
              indexed from Signet by SupaQt.
            </Text>
            {feedsError ? (
              <Text style={styles.warningText}>{feedsError}</Text>
            ) : null}
          </View>

          <View style={styles.statsRow}>
            <HeroStat
              value={feedsLoading ? "…" : String(totalPostCount)}
              label="Posts"
            />
            <HeroStat
              value={feedsLoading ? "…" : String(enabledFeeds.length)}
              label="Feeds"
              bordered
            />
            <HeroStat value="Signet" label="Network" />
          </View>
        </Card>
      ) : null}

      {composerOpen && !dashboard ? <CoinNewsComposer /> : null}

      <Card tone="inset" style={styles.feedCard}>
        <View style={styles.feedHeader}>
          <View style={styles.growShrink}>
            <SectionTitle style={styles.feedTitle}>Coin News</SectionTitle>
            <Muted style={styles.feedSubtitle}>US Weekly</Muted>
          </View>

          <View style={styles.feedActions}>
            <View style={styles.disabledSelect}>
              <Text style={styles.disabledSelectText}>US Weekly</Text>
            </View>
            <PressableButton
              label="Broadcast News"
              disabled={dashboard}
              onPress={() => void openComposer()}
            />
          </View>
        </View>

        {usWeeklyLoading ? (
          <Text style={styles.loadingText}>Loading live US Weekly posts…</Text>
        ) : usWeeklyError ? (
          <Text style={styles.warningText}>{usWeeklyError}</Text>
        ) : usWeeklyRows.length === 0 ? (
          <Muted style={styles.emptyText}>
            No live US Weekly posts are indexed yet.
          </Muted>
        ) : (
          <FeedTable
            rows={usWeeklyRows}
            dashboard={dashboard}
            formatDate={formatDate}
            formatFee={formatFee}
          />
        )}

        <Text style={styles.feedFooter}>
          {feedPostCount("us-weekly", usWeeklyRows)} indexed posts
        </Text>
      </Card>

      {showJapanFeed ? (
        <Card tone="inset" style={styles.feedCard}>
          <View style={styles.feedHeader}>
            <View style={styles.growShrink}>
              <SectionTitle style={styles.feedTitle}>BitNames Feed</SectionTitle>
              <Muted style={styles.feedSubtitle}>Japan Weekly</Muted>
            </View>

            <View style={styles.disabledSelect}>
              <Text style={styles.disabledSelectText}>Japan Weekly</Text>
            </View>
          </View>

          {japanWeeklyLoading ? (
            <Text style={styles.loadingText}>
              Loading live Japan Weekly posts…
            </Text>
          ) : japanWeeklyError ? (
            <Text style={styles.warningText}>{japanWeeklyError}</Text>
          ) : japanWeeklyRows.length === 0 ? (
            <Muted style={styles.emptyText}>
              No live Japan Weekly posts are indexed yet.
            </Muted>
          ) : (
            <FeedTable
              rows={japanWeeklyRows}
              dashboard={dashboard}
              formatDate={formatDate}
              formatFee={formatFee}
            />
          )}

          <Text style={styles.feedFooter}>
            {feedPostCount("japan-weekly", japanWeeklyRows)} indexed posts
          </Text>
        </Card>
      ) : null}
    </View>
  );
}

// ──────────────────────────────────────────────────────
// US / Japan Weekly table — RN row stack replacement.
// ──────────────────────────────────────────────────────
function FeedTable({
  rows,
  dashboard,
  formatDate,
  formatFee,
}: {
  rows: CoinNewsPost[];
  dashboard: boolean;
  formatDate: (t: number) => string;
  formatFee: (f: string) => string;
}): React.JSX.Element {
  return (
    <View style={styles.table}>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.colDate]}>Date</Text>
        <Text style={[styles.th, styles.colFee]}>Fee</Text>
        <Text style={[styles.th, styles.colTitle]}>Title</Text>
      </View>
      {rows.map((row) => (
        <View key={row.id} style={styles.tr}>
          <Text
            style={[styles.tdMono, styles.colDate]}
            numberOfLines={1}
          >
            {formatDate(row.created_at)}
          </Text>
          <Text
            style={[styles.tdMono, styles.colFee]}
            numberOfLines={1}
          >
            {formatFee(row.fee_sats)}
          </Text>
          <Text
            style={[styles.tdTitle, styles.colTitle]}
          >
            {row.title}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Hero stat tile — value on top, label below (the Vue "grid grid-cols-3"
// stats block; ui.tsx StatTile renders label-first so it is not a match).
function HeroStat({
  value,
  label,
  bordered = false,
}: {
  value: string;
  label: string;
  bordered?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.heroStat, bordered ? styles.heroStatBordered : null]}>
      <Text style={styles.heroStatValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

// Small local pill + button wrappers so this file stays self-contained without
// pulling the full ui.tsx Badge/Button props (the Vue versions were plain
// spans/buttons with bespoke colours).
function BadgePill(): React.JSX.Element {
  return (
    <View style={styles.livePill}>
      <Text style={styles.livePillText}>Live</Text>
    </View>
  );
}

function PressableButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.broadcastButton, disabled ? styles.broadcastButtonDisabled : null]}
    >
      <Text style={styles.broadcastButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 24,
  },
  hero: {
    padding: 20,
    borderColor: GRAY[800],
    gap: 20,
  },
  heroTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  heroEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 2.5,
    color: ECASH[500],
  },
  livePill: {
    borderWidth: 1,
    borderColor: "#ea580c66",
    backgroundColor: "#43140799",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  livePillText: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: ECASH[300],
  },
  heroTitle: {
    marginTop: 12,
    fontSize: 28,
    fontWeight: "900",
  },
  heroBody: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 22,
    color: GRAY[400],
  },
  warningText: {
    marginTop: 12,
    fontSize: 13,
    color: "#eab308",
  },
  statsRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 16,
    backgroundColor: "#030712b3",
    paddingVertical: 8,
  },
  heroStat: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  heroStatBordered: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: GRAY[800],
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: "900",
    color: ECASH[400],
  },
  heroStatLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: GRAY[500],
  },
  feedCard: {
    padding: 0,
    overflow: "hidden",
  },
  feedHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: GRAY[800],
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  growShrink: {
    flexShrink: 1,
  },
  feedTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  feedSubtitle: {
    marginTop: 4,
  },
  feedActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  disabledSelect: {
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 8,
    backgroundColor: GRAY[900],
    paddingHorizontal: 12,
    paddingVertical: 8,
    opacity: 0.8,
  },
  disabledSelectText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  broadcastButton: {
    borderRadius: 8,
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  broadcastButtonDisabled: {
    opacity: 0.6,
  },
  broadcastButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#ffffff",
  },
  loadingText: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    fontSize: 13,
    color: GRAY[400],
  },
  emptyText: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  table: {
    width: "100%",
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#030712cc",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  th: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: GRAY[500],
  },
  tr: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: GRAY[900],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tdMono: {
    fontSize: 11,
    color: GRAY[300],
    fontFamily: "monospace",
  },
  tdTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  colDate: {
    width: 120,
  },
  colFee: {
    width: 100,
  },
  colTitle: {
    flex: 1,
  },
  feedFooter: {
    borderTopWidth: 1,
    borderTopColor: GRAY[900],
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 11,
    color: GRAY[600],
  },
});
