// apps/mobile/src/screens/DashboardScreen.tsx
//
// Ported from apps/wallet/src/views/DashboardView.vue.
//
// Ported 1:1. The live platform inflow fan-out (getSidechains +
// getDeposits), the L1 wallet balance card (deriveReceiveAddress +
// getL1Balance), the ECX projected market price (eCash Farm), the Demo Mode
// dashboard banner + sample data, the per-platform portfolio grid with the
// Basic/PRO treatment, the fork countdown banner, and the Coin News preview
// are all carried over with their exact copy.
//
// Platform substitutions, no logic loss:
//   • loadWallet()/the API are always async in the RN port, so onMount awaits.
//   • `window.addEventListener(WALLET_NETWORK_EVENT, ...)` -> the equivalent
//     is a useFocusEffect that re-reads the wallet + re-fetches the L1 balance
//     whenever the Dashboard tab regains focus (e.g. after a Settings toggle).
//   • `window.addEventListener(DEMO_MODE_EVENT, ...)` -> subscribeDemoMode()
//     from ../demo (the in-memory listener set that replaces the CustomEvent).
//   • `<a href>` router links -> navigation.navigate to the matching route;
//     the eCash Farm external link -> Linking.openURL.
//   • The `<table>`-style Coin News preview is its own component
//     (../components/bitnames/CoinNewsPreview); `dashboard` +
//     showJapanFeed={false} match the Vue call site exactly.

import React, { useCallback, useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

import {
  getSidechains,
  getDeposits,
  getL1Balance,
  getMarketPrice,
  satsToBtc,
  type SidechainSummary,
  type ChainBalance,
  type MarketPrice,
} from "../api";
import { deriveReceiveAddress } from "@sidecoin/shared";
import { loadWallet } from "../keystore";
import {
  DEMO_DASHBOARD_ROWS,
  DEMO_L1_ADDRESS,
  DEMO_L1_BALANCE_SATS,
  isDemoModeEnabled,
  subscribeDemoMode,
} from "../demo";
import { canAccessPlatform, isProPlatform } from "../entitlements";
import { getPlatformById } from "../data/platforms";
import { CoinNewsPreview } from "../components/bitnames/CoinNewsPreview";
import { ECASH, GRAY } from "../theme/colors";
import { Badge, Button, Card, Eyebrow, Muted, Skeleton, Title } from "../components/ui";
import type { RootStackParamList, TabParamList } from "../navigation/types";

interface ChainRow {
  summary: SidechainSummary;
  provisioned: boolean;
  depositCount: number;
  totalSats: bigint;
}

function formatSats(sats: bigint): string {
  const neg = sats < 0n;
  const abs = neg ? -sats : sats;
  const whole = abs / 100000000n;
  const frac = (abs % 100000000n).toString().padStart(8, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** Format an ISO timestamp as a human-readable local time string. */
function formatLocalTime(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function DashboardScreen(): React.JSX.Element {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [rows, setRows] = useState<ChainRow[]>([]);
  const [totalSats, setTotalSats] = useState<bigint>(0n);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  // L1 wallet balance — independent of the platform inflow fan-out below.
  // Derived from the same BIP-84 receive address ReceiveView shows
  // (m/84'/1'/0'/0/0 on signet); queried via the chainId-addressed indexed
  // balance route.
  const [l1Address, setL1Address] = useState("");
  const [l1Balance, setL1Balance] = useState<ChainBalance | null>(null);
  const [l1Loading, setL1Loading] = useState(true);
  const [l1Error, setL1Error] = useState<string | null>(null);

  // The wallet's persisted L1 network (signet or betanet). Reactive so a
  // Settings toggle re-derives the address + re-fetches the balance live.
  const [walletNetwork, setWalletNetworkState] = useState<"signet" | "betanet">("betanet");

  const networkLabel =
    walletNetwork === "betanet"
      ? "Betanet"
      : "Signet";

  const [marketPrice, setMarketPrice] = useState<MarketPrice | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  const platformCountLabel = rows.length === 1 ? "platform" : "platforms";
  const eventCountLabel = totalDeposits === 1 ? "event" : "events";

  const applyDemoDashboard = useCallback(() => {
    const built: ChainRow[] = DEMO_DASHBOARD_ROWS.map((row) => ({
      summary: {
        slot: row.slot,
        id: row.id,
        displayName: row.displayName,
        description: row.description,
        status: row.status,
      },
      provisioned: row.provisioned,
      depositCount: row.depositCount,
      totalSats: row.totalSats,
    }));

    setRows(built);
    setTotalSats(built.reduce((acc, row) => acc + row.totalSats, 0n));
    setTotalDeposits(built.reduce((acc, row) => acc + row.depositCount, 0));
    setLoading(false);
    setError(null);
  }, []);

  const applyDemoL1Balance = useCallback(() => {
    setL1Address(DEMO_L1_ADDRESS);
    setL1Balance({
      chainId: "signet",
      address: DEMO_L1_ADDRESS,
      source: "indexed",
      totalSats: DEMO_L1_BALANCE_SATS,
      seen: true,
      updatedAtHeight: 210123,
      note: "Demo Mode sample balance",
    });
    setL1Loading(false);
    setL1Error(null);
  }, []);

  const load = useCallback(async () => {
    const enabled = await isDemoModeEnabled();
    setDemoMode(enabled);

    if (enabled) {
      applyDemoDashboard();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const sidechains = await getSidechains();

      // Fan out across all known slots in parallel.
      const pages = await Promise.all(
        sidechains.map((sc) => getDeposits(sc.slot)),
      );

      const built: ChainRow[] = sidechains.map((summary, i) => {
        const page = pages[i];
        const sum = page.deposits.reduce((acc, d) => acc + d.valueSats, 0n);
        return {
          summary,
          provisioned: page.provisioned,
          depositCount: page.deposits.length,
          totalSats: sum,
        };
      });

      setRows(built);
      setTotalSats(built.reduce((acc, r) => acc + r.totalSats, 0n));
      setTotalDeposits(built.reduce((acc, r) => acc + r.depositCount, 0));
    } catch (e) {
      // Keep the real error (ApiError code, message, stack) for developers.
      console.error("[DashboardScreen] Failed to load data:", e);
      // Show users a friendly, actionable message instead of a raw stack string.
      setError(
        "We couldn't load your dashboard. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyDemoDashboard]);

  const loadL1Balance = useCallback(async () => {
    const enabled = await isDemoModeEnabled();
    setDemoMode(enabled);

    if (enabled) {
      applyDemoL1Balance();
      return;
    }

    setL1Loading(true);
    setL1Error(null);

    const wallet = await loadWallet({ authenticate: false });
    if (!wallet) {
      // No key yet — the L1 balance card shows a setup-required state,
      // mirroring ReceiveView's pending state. A biometric-gated wallet that
      // has not been unlocked this session ALSO lands here; the card's
      // setup-required copy and the session-unlock affordance in Settings
      // both direct the user to authenticate.
      setL1Address("");
      setL1Balance(null);
      setL1Loading(false);
      return;
    }

    try {
      const address = deriveReceiveAddress(wallet.mnemonic, wallet.network, 0);
      setL1Address(address);
      setWalletNetworkState(wallet.network);
      // Indexed balance for the wallet's current L1 network (signet or
      // betanet). Reads from the public Esplora endpoint so balances work
      // even while the sidecoin.app/v1 adapter is offline. An unseen address
      // is not an error: it comes back totalSats 0n with seen=false.
      setL1Balance(await getL1Balance(address, wallet.network));
    } catch (e) {
      // Keep the real error for developers; show users a friendly message.
      console.error("[DashboardScreen] Failed to load L1 balance:", e);
      setL1Error("We couldn't load your L1 balance. Please try again.");
    } finally {
      setL1Loading(false);
    }
  }, [applyDemoL1Balance]);

  const loadMarketPrice = useCallback(async () => {
    setMarketLoading(true);
    setMarketError(null);

    try {
      setMarketPrice(await getMarketPrice("ecash"));
    } catch (e) {
      console.error("[DashboardScreen] Failed to load market price:", e);
      setMarketPrice(null);
      setMarketError(
        "We couldn't load the live ECX market price. Please try again.",
      );
    } finally {
      setMarketLoading(false);
    }
  }, []);

  // Mount: kick off the platform + market fetches. Demo Mode changes are
  // delivered by the shared subscribeDemoMode listener set (the replacement
  // for the Vue `window` CustomEvent). The L1 balance is handled by the focus
  // effect below, which fires on first mount too — so it matches the Vue
  // onMounted fetch exactly once, and refetches when the tab regains focus
  // (e.g. after a Settings network toggle) instead of a window event.
  React.useEffect(() => {
    void load();
    void loadMarketPrice();

    const unsubscribeDemo = subscribeDemoMode((enabled) => {
      setDemoMode(enabled);
      void load();
      void loadL1Balance();
    });

    return unsubscribeDemo;
  }, [load, loadL1Balance, loadMarketPrice]);

  // React to a persisted network change from Settings, and to first landing:
  // re-derive the L1 address + re-fetch the balance for the current network.
  // useFocusEffect fires on mount and again whenever the screen refocuses, so
  // this replaces the Vue onMounted fetch + WALLET_NETWORK_EVENT listener.
  useFocusEffect(
    useCallback(() => {
      void loadL1Balance();
    }, [loadL1Balance]),
  );

  function isDashboardPlatformLocked(platformId: string): boolean {
    return isProPlatform(platformId) && !canAccessPlatform(platformId);
  }

  function platformTagline(platformId: string): string {
    return getPlatformById(platformId)?.tagline ?? "Platform analytics";
  }

  function platformUseCase(platformId: string): string {
    return getPlatformById(platformId)?.primaryUseCase ?? "Platform";
  }

  function openSettings(): void {
    navigation.navigate("settings");
  }

  function openPlatforms(): void {
    navigation.navigate("main", { screen: "platforms" });
  }

  function openPlatform(platformId: string): void {
    navigation.navigate("platform-detail", { platformId });
  }

  function openPro(): void {
    navigation.navigate("pro");
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <View style={styles.heading}>
        <Eyebrow style={styles.eyebrow}>Drivechains Financial Hub</Eyebrow>
        <Title style={styles.title}>Dashboard</Title>
      </View>

      {demoMode ? (
        <Card tone="accent" style={styles.demoBanner} testID="demo-mode-dashboard-banner">
          <View style={styles.demoBannerInner}>
            <View style={styles.growShrink}>
              <Badge label="Demo Mode" tone="active" />
              <Text style={styles.demoBannerTitle}>
                Sample financial hub activity is enabled
              </Text>
              <Text style={styles.demoBannerBody}>
                You are viewing sample balances and platform activity across the
                Drivechains Financial Hub.
              </Text>
            </View>

            <Button
              label="Manage demo"
              variant="secondary"
              onPress={openSettings}
            />
          </View>
        </Card>
      ) : null}

      {/* Dashboard summary and Coin News preview */}
      <View style={styles.summaryGrid} testID="dashboard-summary-grid">
        <View style={styles.summaryValues} testID="dashboard-summary-values">
          {/* L1 wallet balance — always shown, independent of the platform
              inflow fan-out below. */}
          <Card style={styles.balanceCard}>
            <View style={styles.balanceHeader}>
              <Text style={styles.smallLabel}>L1 Wallet Balance</Text>
              <View style={styles.chainPill}>
                <Text style={styles.chainPillText}>{networkLabel}</Text>
              </View>
            </View>

            {l1Loading ? (
              // Skeleton rather than text: the card's real content is a large
              // balance line plus an address, so reserving that space stops
              // the card from resizing when the balance lands.
              <View testID="dashboard-balance-skeleton" style={styles.l1Skeleton}>
                <Skeleton width="55%" height={30} radius={10} />
                <Skeleton width="85%" height={12} />
              </View>
            ) : l1Error ? (
              <View style={styles.errorBlockRed}>
                <Text style={styles.errorTextRed}>{l1Error}</Text>
                <Button
                  label="Retry"
                  size="sm"
                  style={styles.retryRed}
                  onPress={() => void loadL1Balance()}
                />
              </View>
            ) : !l1Address ? (
              <Text style={styles.setupText}>
                Wallet setup required — your L1 balance appears once key setup is
                complete.
              </Text>
            ) : (
              <>
                <Text style={styles.balanceValue}>
                  {satsToBtc(l1Balance ? l1Balance.totalSats : 0n)}{" "}
                  <Text style={styles.balanceUnit}>eCash</Text>
                </Text>
                {l1Balance && !l1Balance.seen ? (
                  <Text style={styles.unseenText}>
                    Address not yet seen on-chain. New deposits appear after they
                    confirm and are indexed.
                  </Text>
                ) : (
                  <Text style={styles.addressText}>{l1Address}</Text>
                )}
              </>
            )}
          </Card>

          <Card style={styles.balanceCard}>
            <View style={styles.balanceHeader}>
              <Text style={styles.smallLabel}>
                ECX (Projected) Market Price
              </Text>
              <Pressable
                accessibilityRole="link"
                testID="market-price-source"
                onPress={() => void Linking.openURL("https://ecashfarm.com")}
                style={styles.sourcePill}
              >
                <Text style={styles.sourcePillText}>eCash Farm ↗</Text>
              </Pressable>
            </View>

            {marketLoading ? (
              <View testID="dashboard-market-skeleton" style={styles.l1Skeleton}>
                <Skeleton width="50%" height={30} radius={10} />
                <Skeleton width="40%" height={12} />
              </View>
            ) : marketError ? (
              <View style={styles.errorBlockYellow}>
                <Text style={styles.errorTextYellow}>{marketError}</Text>
                <Button
                  label="Retry"
                  size="sm"
                  style={styles.retryYellow}
                  onPress={() => void loadMarketPrice()}
                />
              </View>
            ) : marketPrice ? (
              <>
                <Text style={styles.balanceValue}>
                  USD {marketPrice.price_usd}
                </Text>
                <Text style={styles.marketTime}>
                  {formatLocalTime(marketPrice.as_of)}
                </Text>
              </>
            ) : (
              <Muted style={styles.emptyMarket}>
                No live market price is available.
              </Muted>
            )}
          </Card>

          {/* Loading state — platform activity is a card of numbers, so the
              skeleton mirrors that shape instead of a bare text line. */}
          {loading ? (
            <Card testID="dashboard-activity-skeleton" style={styles.balanceCard}>
              <Skeleton width="45%" height={12} />
              <View style={styles.l1Skeleton}>
                <Skeleton width="60%" height={30} radius={10} />
                <Skeleton width="70%" height={12} />
              </View>
            </Card>
          ) : error ? (
            <View style={styles.errorBlockRed}>
              <Text style={styles.errorTitle}>Error loading dashboard</Text>
              <Text style={styles.errorTextRed}>{error}</Text>
              <Button
                label="Retry"
                style={styles.retryRed}
                onPress={() => void load()}
              />
            </View>
          ) : (
            <Card style={styles.balanceCard}>
              <Text style={styles.smallLabel}>Platform Activity</Text>
              <Text style={styles.balanceValue}>
                {formatSats(totalSats)}{" "}
                <Text style={styles.balanceUnit}>eCash</Text>
              </Text>
              <Muted style={styles.activitySub}>
                {totalDeposits} {eventCountLabel} across {rows.length}{" "}
                {platformCountLabel}
              </Muted>
              <Text style={styles.activityNote}>
                Track balances, deposits, and platform activity across the
                Drivechains Financial Hub.
              </Text>
            </Card>
          )}
        </View>

        <CoinNewsPreview dashboard showHero showJapanFeed={false} />
      </View>

      {/* Loaded state */}
      {!loading && !error ? (
        <View style={styles.loaded}>
          {/* Per-platform breakdown */}
          <View>
            <View style={styles.portfolioHeader}>
              <Text style={styles.portfolioTitle}>Platform Portfolio</Text>
              <Pressable accessibilityRole="link" onPress={openPlatforms}>
                <Text style={styles.linkText}>Explore platforms →</Text>
              </Pressable>
            </View>

            <View style={styles.grid}>
              {rows.map((row) => {
                const locked = isDashboardPlatformLocked(row.summary.id);
                const isActive = row.summary.status === "active";
                return (
                  <Card key={row.summary.slot} style={styles.platformCard}>
                    <View style={styles.platformHead}>
                      <View style={styles.growShrink}>
                        <Text style={styles.platformName}>
                          {row.summary.displayName}
                        </Text>
                        <Muted style={styles.platformTagline}>
                          {platformTagline(row.summary.id)}
                        </Muted>
                      </View>

                      <View style={styles.platformBadges}>
                        {locked ? <Badge label="PRO" tone="proposed" /> : null}
                        <Badge
                          label={isActive ? "Active" : "Proposed"}
                          tone={isActive ? "active" : "neutral"}
                        />
                      </View>
                    </View>

                    {locked ? (
                      <>
                        <Muted style={styles.lockedText}>
                          Unlock platform analytics with Sidecoin PRO.
                        </Muted>
                        <Button
                          label="Unlock analytics"
                          variant="pro"
                          size="sm"
                          style={styles.lockedButton}
                          onPress={openPro}
                        />
                      </>
                    ) : (
                      <>
                        <Text style={styles.platformSats}>
                          {formatSats(row.totalSats)}
                        </Text>
                        <View style={styles.platformMeta}>
                          <Muted style={styles.platformMetaText}>
                            {row.depositCount}{" "}
                            {row.depositCount === 1 ? "event" : "events"} · slot{" "}
                            {row.summary.slot}
                          </Muted>
                          <View style={styles.useCasePill}>
                            <Text style={styles.useCasePillText}>
                              {platformUseCase(row.summary.id)}
                            </Text>
                          </View>
                        </View>
                        <Button
                          label="Open platform"
                          variant="secondary"
                          size="sm"
                          style={styles.openButton}
                          onPress={() => openPlatform(row.summary.id)}
                        />
                      </>
                    )}
                  </Card>
                );
              })}
            </View>
          </View>

          {/* Fork countdown banner */}
          <View style={styles.forkBanner}>
            <Text style={styles.forkBannerTitle}>
              eCash Hard Fork — 2026-10-31 15:00Z — Block ~973,728
            </Text>
            <Text style={styles.forkBannerSub}>
              BIP-300 / BIP-301 Drivechains · 7 platforms at launch
            </Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: GRAY[950],
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 24,
  },
  heading: {
    marginBottom: 8,
  },
  eyebrow: {
    color: ECASH[500],
    letterSpacing: 2.5,
  },
  title: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: "900",
  },
  demoBanner: {
    padding: 20,
  },
  demoBannerInner: {
    gap: 16,
  },
  growShrink: {
    flexShrink: 1,
  },
  demoBannerTitle: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff",
  },
  demoBannerBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 22,
    color: GRAY[300],
  },
  summaryGrid: {
    gap: 24,
  },
  summaryValues: {
    gap: 24,
  },
  balanceCard: {
    padding: 24,
  },
  balanceHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  smallLabel: {
    fontSize: 13,
    color: GRAY[400],
  },
  chainPill: {
    backgroundColor: GRAY[800],
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chainPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: GRAY[400],
  },
  loadingText: {
    marginTop: 8,
    color: GRAY[400],
  },
  // Stacked skeleton lines inside a card. `marginTop` matches the spacing the
  // real value used so the card height does not jump on load.
  l1Skeleton: {
    marginTop: 8,
    gap: 10,
  },
  errorBlockRed: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: "#7f1d1d4d",
    padding: 16,
  },
  errorBlockYellow: {
    marginTop: 8,
  },
  errorTitle: {
    fontWeight: "600",
    color: "#f87171",
  },
  errorTextRed: {
    marginTop: 4,
    fontSize: 13,
    color: "#f87171",
  },
  errorTextYellow: {
    fontSize: 13,
    color: "#eab308",
  },
  retryRed: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#7f1d1d66",
  },
  retryYellow: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  setupText: {
    marginTop: 8,
    fontSize: 13,
    color: "#eab308",
  },
  balanceValue: {
    marginTop: 8,
    fontSize: 34,
    fontWeight: "700",
    color: ECASH[400],
  },
  balanceUnit: {
    fontSize: 18,
    color: GRAY[500],
  },
  unseenText: {
    marginTop: 8,
    fontSize: 11,
    color: "#ca8a04",
  },
  addressText: {
    marginTop: 8,
    fontSize: 11,
    color: GRAY[600],
    fontFamily: "monospace",
  },
  sourcePill: {
    backgroundColor: GRAY[800],
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sourcePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: GRAY[400],
  },
  marketTime: {
    marginTop: 8,
    fontSize: 11,
    color: GRAY[600],
    fontFamily: "monospace",
  },
  emptyMarket: {
    marginTop: 8,
  },
  activitySub: {
    marginTop: 8,
    fontSize: 13,
  },
  activityNote: {
    marginTop: 4,
    fontSize: 11,
    color: GRAY[600],
  },
  loaded: {
    gap: 24,
  },
  portfolioHeader: {
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  portfolioTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#ffffff",
  },
  linkText: {
    fontSize: 13,
    fontWeight: "600",
    color: ECASH[400],
  },
  grid: {
    gap: 16,
  },
  platformCard: {
    borderRadius: 12,
    padding: 16,
  },
  platformHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  platformName: {
    fontWeight: "600",
    color: "#ffffff",
  },
  platformTagline: {
    marginTop: 4,
    fontSize: 11,
  },
  platformBadges: {
    alignItems: "flex-end",
    gap: 8,
  },
  lockedText: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 22,
  },
  lockedButton: {
    marginTop: 16,
    alignSelf: "flex-start",
  },
  platformSats: {
    marginTop: 16,
    fontSize: 13,
    fontFamily: "monospace",
    color: ECASH[400],
  },
  platformMeta: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  platformMetaText: {
    fontSize: 11,
  },
  useCasePill: {
    backgroundColor: GRAY[800],
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  useCasePillText: {
    fontSize: 11,
    color: GRAY[400],
  },
  openButton: {
    marginTop: 16,
    alignSelf: "flex-start",
  },
  forkBanner: {
    borderWidth: 1,
    borderColor: ECASH[800],
    borderRadius: 8,
    backgroundColor: ECASH[950] ?? "#431407",
    padding: 16,
  },
  forkBannerTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: ECASH[400],
  },
  forkBannerSub: {
    marginTop: 4,
    fontSize: 11,
    color: ECASH[600] ?? ECASH[500],
  },
});
