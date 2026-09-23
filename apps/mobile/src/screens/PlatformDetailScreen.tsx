// apps/mobile/src/screens/PlatformDetailScreen.tsx
//
// Ported 1:1 from apps/wallet/src/views/PlatformDetailView.vue.
//
// Platform detail surface: hero (slot/status/use-case), the metric grid,
// the PRO gate for locked platforms, and the tabbed body (overview,
// thunder-payments, thunder-channels, thunder-liquidity, parent-chain,
// activity, contacts, messages, and the generic workflow fallback).
//
// The Vue view read its platform id from `route.params.platformId`; the RN
// port takes it from the route params of the `platform-detail` screen. All
// tab-building logic, action/field label helpers, and the empty-state copy
// are carried over unchanged. Every data array in the Vue source is a
// constant `[]` (live platform data is not indexed yet), so the empty
// branches are the ones that render today — but every non-empty branch is
// kept for 1:1 parity.
//
// Platform substitutions, no logic loss:
//   • `<router-link to="/platforms">` -> a Back button that calls goBack().
//   • `watchEffect` tab reconciliation -> a `useEffect` + derived value.
//   • `<input disabled>` -> TextInput with `editable={false}`.
//   • `v-model:selected-contact-name` -> `selectedContactName` + setter.
//   • The `xl` two-column layouts stack, since a phone is always < xl.

import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { getPlatformById } from "../data/platforms";
import type { PlatformFeatureTab } from "../data/platforms";
import { canAccessPlatform, isProPlatform } from "../entitlements";
import { ProBadge } from "../components/pro/ProBadge";
import { ProGate } from "../components/pro/ProGate";
import { BitMessagesPreview } from "../components/bitnames/BitMessagesPreview";
import type { RootStackParamList } from "../navigation/types";
import { ECASH, GRAY } from "../theme/colors";
import { Screen } from "../components/ui";

interface PlatformTab extends PlatformFeatureTab {
  kind?:
    | "overview"
    | "workflow"
    | "thunder-payments"
    | "thunder-channels"
    | "thunder-liquidity"
    | "contacts"
    | "messages"
    | "parent-chain"
    | "activity";
}

interface MetricCard {
  label: string;
  value: string;
  caption: string;
}

interface ActivityRow {
  time: string;
  type: string;
  amount: string;
  status: string;
  txid: string;
}

interface ThunderPaymentRow {
  time: string;
  type: string;
  amount: string;
  status: string;
  paymentId: string;
}

interface ThunderChannelRow {
  peer: string;
  capacity: string;
  inbound: string;
  outbound: string;
  status: string;
  health: string;
}

interface ThunderLiquidityRecommendation {
  title: string;
  body: string;
  priority: string;
}

interface BitNamesContact {
  name: string;
  displayName: string;
  useCase: string;
  status: string;
  lastSeen: string;
  paymentHint: string;
}

interface BitNamesMessage {
  contact: string;
  side: "sent" | "received";
  time: string;
  body: string;
}

const thunderPaymentRows: ThunderPaymentRow[] = [];

const thunderChannelRows: ThunderChannelRow[] = [];

const thunderLiquidityRecommendations: ThunderLiquidityRecommendation[] = [];

const bitNamesContacts: BitNamesContact[] = [];

const bitNamesMessages: BitNamesMessage[] = [];

type PlatformDetailRoute = RouteProp<RootStackParamList, "platform-detail">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PlatformDetailScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<PlatformDetailRoute>();
  const [selectedTabId, setSelectedTabId] = useState("");
  const [selectedBitNamesContact, setSelectedBitNamesContact] = useState("");

  const platform = useMemo(() => {
    const id = String(route.params?.platformId ?? "");
    return getPlatformById(id);
  }, [route.params]);

  const locked = platform ? !canAccessPlatform(platform.id) : false;

  const platformSlotLabel = useMemo(() => {
    return platform?.slot == null ? "Slot TBD" : `Slot ${platform.slot}`;
  }, [platform]);

  const platformStatusLabel = useMemo(() => {
    if (platform?.status === "active") return "Active";
    if (platform?.status === "coming soon") return "Coming Soon";
    return "Proposed";
  }, [platform]);

  const platformTabs = useMemo<PlatformTab[]>(() => {
    if (!platform) return [];

    return [
      {
        id: "overview",
        label: "Overview",
        title: `${platform.displayName} overview`,
        body: `${platform.displayName} platform summary, balances, actions, and recent activity.`,
        bullets: [
          "Platform balance",
          "Wallet actions",
          "Recent activity",
          "Parent chain status",
        ],
        kind: "overview",
      },
      ...platform.featureTabs.map((tab): PlatformTab => ({
        ...tab,
        kind:
          platform.id === "thunder" && tab.id === "payments"
            ? "thunder-payments"
            : platform.id === "thunder" && tab.id === "channels"
              ? "thunder-channels"
              : platform.id === "thunder" && tab.id === "liquidity"
                ? "thunder-liquidity"
                : tab.id === "contacts"
                  ? "contacts"
                  : tab.id === "messages"
                    ? "messages"
                    : "workflow",
      })),
      {
        id: "parent-chain",
        label: "Parent Chain",
        title: "Deposit and withdraw",
        body: "Move value between L1 and this platform with explicit deposit and withdrawal review.",
        bullets: [
          "Deposit address",
          "Deposit amount",
          "Withdrawal destination",
          "Recent transfer status",
        ],
        kind: "parent-chain",
      },
      {
        id: "activity",
        label: "Activity",
        title: "Platform activity",
        body: "Search and review platform transactions, deposits, withdrawals, and wallet actions.",
        bullets: ["Search", "Filters", "CSV export", "Status review"],
        kind: "activity",
      },
    ];
  }, [platform]);

  useEffect(() => {
    const tabs = platformTabs;
    if (!tabs.length) {
      setSelectedTabId("");
      return;
    }

    setSelectedTabId((current) => {
      if (!tabs.some((tab) => tab.id === current)) {
        return tabs[0].id;
      }
      return current;
    });
  }, [platformTabs]);

  const selectedTab = useMemo(() => {
    return platformTabs.find((tab) => tab.id === selectedTabId);
  }, [platformTabs, selectedTabId]);

  const selectedContact = useMemo(() => {
    return bitNamesContacts.find(
      (contact) => contact.name === selectedBitNamesContact,
    );
  }, [selectedBitNamesContact]);

  const proBenefits = useMemo(
    () => [
      `Unlock ${platform?.displayName ?? "this platform"} workflows`,
      "Historical analysis across platforms",
      "Hardware signing workflows",
      "Early access to proposed platforms like RISCy",
    ],
    [platform],
  );

  const metricCards = useMemo<MetricCard[]>(() => {
    const id = platform?.id;

    if (id === "thunder") {
      return [
        {
          label: "Platform Balance",
          value: "—",
          caption: "Live balance data not indexed yet",
        },
        {
          label: "Payments",
          value: "—",
          caption: "Live payment data not indexed yet",
        },
        {
          label: "Channels",
          value: "—",
          caption: "Live channel data not indexed yet",
        },
        {
          label: "Liquidity",
          value: "—",
          caption: "Live liquidity data not indexed yet",
        },
      ];
    }

    if (id === "bitnames") {
      return [
        {
          label: "Registered Names",
          value: "—",
          caption: "Live name data not indexed yet",
        },
        {
          label: "Records",
          value: "—",
          caption: "Live record data not indexed yet",
        },
        {
          label: "Contacts",
          value: "—",
          caption: "Live contact data not indexed yet",
        },
        {
          label: "Messages",
          value: "—",
          caption: "Live message data not indexed yet",
        },
      ];
    }

    if (id === "zside") {
      return [
        {
          label: "Transparent Balance",
          value: "2.25000000",
          caption: "ready to shield",
        },
        {
          label: "Shielded Balance",
          value: "—",
          caption: "PRO analytics",
        },
        { label: "Privacy Set", value: "—", caption: "PRO review" },
        { label: "Private Activity", value: "—", caption: "PRO history" },
      ];
    }

    if (id === "bitassets") {
      return [
        { label: "Asset Portfolio", value: "—", caption: "PRO analytics" },
        { label: "Issued Assets", value: "—", caption: "issuer tools" },
        { label: "Transfers", value: "—", caption: "activity history" },
        { label: "Metadata", value: "—", caption: "asset records" },
      ];
    }

    if (id === "photon") {
      return [
        { label: "Photon Balance", value: "—", caption: "PRO analytics" },
        { label: "Address Types", value: "—", caption: "security review" },
        { label: "Migration", value: "—", caption: "guided workflow" },
        { label: "Security", value: "—", caption: "post-quantum posture" },
      ];
    }

    if (id === "truthcoin") {
      return [
        { label: "Markets", value: "—", caption: "market discovery" },
        { label: "Positions", value: "—", caption: "PnL and exposure" },
        { label: "Decisions", value: "—", caption: "oracle outcomes" },
        { label: "Claims", value: "—", caption: "settlement flow" },
      ];
    }

    if (id === "coinshift") {
      return [
        { label: "Routes", value: "—", caption: "partner liquidity" },
        { label: "Open Orders", value: "—", caption: "settlement tracking" },
        { label: "Volume", value: "—", caption: "route history" },
        { label: "Refunds", value: "—", caption: "safety review" },
      ];
    }

    return [
      {
        label: "Early Access",
        value: "PRO",
        caption: "proposed platform preview",
      },
      { label: "Apps", value: "—", caption: "application launcher" },
      { label: "Contracts", value: "—", caption: "interaction review" },
      { label: "Developer", value: "—", caption: "simulation tools" },
    ];
  }, [platform]);

  const activityRows: ActivityRow[] = [];

  const actionLabel = (): string => {
    const id = platform?.id;

    if (id === "thunder") return "Create invoice";
    if (id === "bitnames") return "Search name";
    if (id === "zside") return "Review shield";
    if (id === "bitassets") return "Review asset";
    if (id === "photon") return "Review migration";
    if (id === "truthcoin") return "Browse markets";
    if (id === "coinshift") return "Review route";
    return "Open workflow";
  };

  const primaryFieldLabel = (): string => {
    const id = platform?.id;

    if (id === "thunder") return "Recipient or invoice";
    if (id === "bitnames") return "BitName";
    if (id === "zside") return "Shield destination";
    if (id === "bitassets") return "Asset ticker";
    if (id === "photon") return "Photon address";
    if (id === "truthcoin") return "Market search";
    if (id === "coinshift") return "Destination platform";
    return "Contract address";
  };

  const primaryFieldPlaceholder = (): string => {
    const id = platform?.id;

    if (id === "thunder") return "invoice, contact, or Thunder address";
    if (id === "bitnames") return "name.bit";
    if (id === "zside") return "shielded address";
    if (id === "bitassets") return "TOKEN";
    if (id === "photon") return "photon receive address";
    if (id === "truthcoin") return "Search markets...";
    if (id === "coinshift") return "Choose destination platform";
    return "contract or app identifier";
  };

  const secondaryFieldLabel = (): string => {
    const id = platform?.id;

    if (id === "bitnames") return "Record value";
    if (id === "truthcoin") return "Category";
    if (id === "coinshift") return "Route amount";
    return "Amount";
  };

  const secondaryFieldPlaceholder = (): string => {
    const id = platform?.id;

    if (id === "bitnames") return "profile, address, or service record";
    if (id === "truthcoin")
      return "Popular, newest, most active, or liquidity";
    if (id === "coinshift") return "0.00000000";
    return "0.00000000";
  };

  const openBitNamesMessages = (contactName: string) => {
    setSelectedBitNamesContact(contactName);
    setSelectedTabId("messages");
  };

  if (!platform) {
    return (
      <Screen>
        <View style={styles.notFoundWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backLink}>← Back to Platforms</Text>
          </Pressable>

          <View style={styles.notFoundCard}>
            <Text style={styles.notFoundTitle}>Platform not found</Text>
            <Text style={styles.notFoundBody}>
              This platform route does not exist.
            </Text>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backLink}>← Back to Platforms</Text>
      </Pressable>

      <View style={styles.heroCard}>
        <View>
          <Text style={styles.eyebrow}>
            Platform · {platformSlotLabel}
          </Text>
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle}>{platform.displayName}</Text>
            {isProPlatform(platform.id) ? <ProBadge /> : null}
          </View>
          <Text style={styles.heroTagline}>{platform.tagline}</Text>
        </View>

        <View style={styles.heroPills}>
          <View
            style={[
              styles.statusPill,
              platform.status === "active"
                ? styles.statusPillActive
                : styles.statusPillInactive,
            ]}
          >
            <Text
              style={[
                styles.statusPillText,
                platform.status === "active"
                  ? styles.statusPillTextActive
                  : styles.statusPillTextInactive,
              ]}
            >
              {platformStatusLabel}
            </Text>
          </View>
          <View style={styles.useCasePill}>
            <Text style={styles.useCasePillText}>
              {platform.primaryUseCase}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.heroDescription}>{platform.description}</Text>

      <View style={styles.metricGrid}>
        {metricCards.map((card) => (
          <View key={card.label} style={styles.metricCard}>
            <Text style={styles.eyebrow}>{card.label}</Text>
            <Text
              style={[
                styles.metricValue,
                card.value === "PRO" || card.value === "—"
                  ? styles.metricValueAmber
                  : styles.metricValueEcash,
              ]}
            >
              {card.value}
            </Text>
            <Text style={styles.metricCaption}>{card.caption}</Text>
          </View>
        ))}
      </View>

      {locked ? (
        <View style={styles.gateWrap}>
          <ProGate
            title={`Unlock ${platform.displayName} with Sidecoin PRO`}
            description={`${platform.displayName} is part of the complete Drivechains Financial Hub. Upgrade to access premium platform workflows, analytics, and early platform features.`}
            benefits={proBenefits}
            cta="Unlock with PRO"
          />
        </View>
      ) : (
        <>
          <View style={styles.tabsCard}>
            <View style={styles.tabRow}>
              {platformTabs.map((tab) => (
                <Pressable
                  key={tab.id}
                  testID={`platform-tab-${tab.id}`}
                  accessibilityRole="button"
                  onPress={() => setSelectedTabId(tab.id)}
                  style={[
                    styles.tabButton,
                    selectedTabId === tab.id
                      ? styles.tabButtonActive
                      : styles.tabButtonInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabButtonText,
                      selectedTabId === tab.id
                        ? styles.tabButtonTextActive
                        : styles.tabButtonTextInactive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {selectedTab?.kind === "overview" ? (
              <View style={styles.sectionColumn}>
                <View>
                  <Text style={styles.sectionHeading}>{selectedTab.title}</Text>
                  <Text style={styles.sectionBody}>{selectedTab.body}</Text>

                  {platform.id === "thunder" ? (
                    <View style={styles.overviewGrid}>
                      <View style={styles.insetCard}>
                        <Text style={styles.eyebrow}>Create invoice</Text>
                        <Text style={styles.insetTitle}>
                          Request a Thunder payment
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setSelectedTabId("payments")}
                          style={styles.solidButton}
                        >
                          <Text style={styles.solidButtonText}>
                            Open Payments
                          </Text>
                        </Pressable>
                      </View>

                      <View style={styles.insetCard}>
                        <Text style={styles.eyebrow}>Send payment</Text>
                        <Text style={styles.insetTitle}>
                          Review recipient, route, and fee
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setSelectedTabId("payments")}
                          style={styles.outlineButton}
                        >
                          <Text style={styles.outlineButtonText}>
                            Review payment
                          </Text>
                        </Pressable>
                      </View>

                      <View style={styles.insetCard}>
                        <Text style={styles.eyebrow}>Channel liquidity</Text>
                        <Text style={styles.insetTitle}>
                          Live channel data is not indexed yet
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setSelectedTabId("channels")}
                          style={styles.outlineButton}
                        >
                          <Text style={styles.outlineButtonText}>
                            View Channels
                          </Text>
                        </Pressable>
                      </View>

                      <View style={styles.insetCard}>
                        <Text style={styles.eyebrow}>Liquidity planner</Text>
                        <Text style={styles.insetTitle}>
                          Available send/receive capacity
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setSelectedTabId("liquidity")}
                          style={styles.outlineButton}
                        >
                          <Text style={styles.outlineButtonText}>
                            Open Planner
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.overviewGrid}>
                      <View style={styles.insetCard}>
                        <Text style={styles.eyebrow}>Primary action</Text>
                        <Text style={styles.insetTitle}>{actionLabel()}</Text>
                        <Pressable
                          accessibilityRole="button"
                          style={styles.solidButton}
                        >
                          <Text style={styles.solidButtonText}>
                            Start workflow
                          </Text>
                        </Pressable>
                      </View>

                      <View style={styles.insetCard}>
                        <Text style={styles.eyebrow}>Parent chain</Text>
                        <Text style={styles.insetTitle}>
                          Deposits and withdrawals
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setSelectedTabId("parent-chain")}
                          style={styles.outlineButton}
                        >
                          <Text style={styles.outlineButtonText}>
                            Open transfer tools
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>

                <View style={styles.asideCard}>
                  <Text style={styles.eyebrowMuted}>Recent activity</Text>

                  {activityRows.length === 0 ? (
                    <View style={styles.emptyMini}>
                      <Text style={styles.emptyMiniText}>
                        Live platform activity is not indexed yet.
                      </Text>
                    </View>
                  ) : (
                    <View>
                      {activityRows.slice(0, 3).map((row) => (
                        <View key={row.txid} style={styles.tableRow}>
                          <Text style={styles.tableCell}>{row.time}</Text>
                          <Text style={styles.tableCell}>{row.type}</Text>
                          <Text style={styles.tableCell}>{row.status}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            ) : null}

            {selectedTab?.kind === "thunder-payments" ? (
              <View style={styles.sectionColumn}>
                <View style={styles.stack}>
                  <View>
                    <Text style={styles.sectionHeading}>
                      Thunder Payments
                    </Text>
                    <Text style={styles.sectionBody}>
                      Prepare Thunder payment flows for sending payments,
                      creating invoices, and reviewing route status before
                      settlement.
                    </Text>
                  </View>

                  <View style={styles.thunderGrid}>
                    <View style={styles.formCard}>
                      <Text style={styles.eyebrow}>Send Payment</Text>
                      <Text style={styles.formTitle}>
                        Review outgoing payment
                      </Text>

                      <DisabledField
                        label="Recipient or invoice"
                        placeholder="invoice, contact, or Thunder address"
                      />
                      <DisabledField
                        label="Amount"
                        placeholder="0.00000000"
                      />
                      <DisabledField
                        label="Memo"
                        placeholder="Coffee, invoice #1024, or payment note"
                      />

                      <View style={styles.disabledButton}>
                        <Text style={styles.disabledButtonText}>
                          Review payment
                        </Text>
                      </View>
                    </View>

                    <View style={styles.formCard}>
                      <Text style={styles.eyebrow}>Create Invoice</Text>
                      <Text style={styles.formTitle}>
                        Request a payment
                      </Text>

                      <DisabledField
                        label="Invoice amount"
                        placeholder="0.00000000"
                      />
                      <DisabledField
                        label="Label"
                        placeholder="Payment request label"
                      />
                      <DisabledField
                        label="Expiry"
                        placeholder="30 minutes"
                      />

                      <View style={styles.disabledButton}>
                        <Text style={styles.disabledButtonText}>
                          Create invoice
                        </Text>
                      </View>
                    </View>
                  </View>

                  {thunderPaymentRows.length === 0 ? (
                    <View style={styles.emptyPanel}>
                      <Text style={styles.emptyPanelText}>
                        No live Thunder payments are indexed yet.
                      </Text>
                    </View>
                  ) : (
                    <StubTable
                      headers={[
                        "Time",
                        "Type",
                        "Amount",
                        "Status",
                        "Payment ID",
                      ]}
                      rows={thunderPaymentRows.map((row) => [
                        row.time,
                        row.type,
                        row.amount,
                        row.status,
                        row.paymentId,
                      ])}
                    />
                  )}
                </View>

                <View style={styles.asideStack}>
                  <View style={styles.asideCard}>
                    <Text style={styles.eyebrowMuted}>Route estimate</Text>
                    <Text style={styles.asideTitle}>Live route quality</Text>
                    <View style={styles.emptyMini}>
                      <Text style={styles.emptyMiniText}>
                        Live Thunder route estimates are not indexed yet.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.asideCard}>
                    <Text style={styles.eyebrowMuted}>Payment safety</Text>
                    <Text style={styles.asideTitle}>
                      Review before sending
                    </Text>
                    <View style={styles.bulletList}>
                      <SafetyBullet text="Payment submission stays disabled until live route data is connected." />
                      <SafetyBullet text="No Thunder payment is broadcast from this screen." />
                      <SafetyBullet text="Live settlement will require explicit review." />
                    </View>
                  </View>
                </View>
              </View>
            ) : null}

            {selectedTab?.kind === "thunder-channels" ? (
              <View style={styles.sectionColumn}>
                <View style={styles.stack}>
                  <View>
                    <Text style={styles.sectionHeading}>
                      Thunder Channels
                    </Text>
                    <Text style={styles.sectionBody}>
                      Monitor channel capacity, inbound/outbound liquidity,
                      route health, and future channel actions from one wallet
                      view.
                    </Text>
                  </View>

                  <View style={styles.overviewGrid}>
                    <ChannelStat label="Open channels" />
                    <ChannelStat label="Inbound liquidity" />
                    <ChannelStat label="Outbound liquidity" />
                    <ChannelStat label="Average health" />
                  </View>

                  {thunderChannelRows.length === 0 ? (
                    <View style={styles.emptyPanel}>
                      <Text style={styles.emptyPanelText}>
                        No live Thunder channels are indexed yet.
                      </Text>
                    </View>
                  ) : (
                    <StubTable
                      headers={[
                        "Peer",
                        "Capacity",
                        "Inbound",
                        "Outbound",
                        "Status",
                        "Health",
                      ]}
                      rows={thunderChannelRows.map((row) => [
                        row.peer,
                        row.capacity,
                        row.inbound,
                        row.outbound,
                        row.status,
                        row.health,
                      ])}
                    />
                  )}

                  <View style={styles.channelActions}>
                    <View style={styles.disabledButton}>
                      <Text style={styles.disabledButtonText}>
                        Open Channel
                      </Text>
                    </View>
                    <View style={styles.disabledButton}>
                      <Text style={styles.disabledButtonText}>
                        Close selected
                      </Text>
                    </View>
                    <View style={styles.disabledButton}>
                      <Text style={styles.disabledButtonText}>Rebalance</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.asideStack}>
                  <View style={styles.asideCard}>
                    <Text style={styles.eyebrowMuted}>Channel Summary</Text>
                    <Text style={styles.asideTitle}>
                      Live channel data pending
                    </Text>
                    <Text style={styles.asideBody}>
                      Live Thunder channel capacity, inbound liquidity,
                      outbound liquidity, and health data are not indexed yet.
                    </Text>
                  </View>

                  <View style={styles.asideCard}>
                    <Text style={styles.eyebrowMuted}>
                      Preview-only controls
                    </Text>
                    <Text style={styles.asideTitle}>
                      No channel operations yet
                    </Text>
                    <Text style={styles.asideBody}>
                      Channel opening, closing, and rebalancing controls are
                      disabled until live Thunder channel operations are
                      connected.
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {selectedTab?.kind === "thunder-liquidity" ? (
              <View style={styles.sectionColumn}>
                <View style={styles.stack}>
                  <View>
                    <Text style={styles.sectionHeading}>
                      Liquidity Planner
                    </Text>
                    <Text style={styles.sectionBody}>
                      Plan Thunder send/receive capacity, inspect route
                      coverage, and review suggested liquidity actions before
                      moving funds.
                    </Text>
                  </View>

                  <View style={styles.overviewGrid}>
                    <ChannelStat label="Available to send" />
                    <ChannelStat label="Available to receive" />
                    <ChannelStat label="Route coverage" />
                    <ChannelStat label="Suggested action" amber />
                  </View>

                  <View style={styles.panelCard}>
                    <Text style={styles.eyebrowMuted}>Recommendations</Text>
                    <View style={styles.recommendations}>
                      {thunderLiquidityRecommendations.length === 0 ? (
                        <View style={styles.emptyMini}>
                          <Text style={styles.emptyMiniText}>
                            No live Thunder liquidity recommendations are
                            indexed yet.
                          </Text>
                        </View>
                      ) : (
                        thunderLiquidityRecommendations.map((item) => (
                          <View key={item.title} style={styles.emptyMini}>
                            <View style={styles.recommendationHeader}>
                              <View style={styles.recommendationText}>
                                <Text style={styles.recommendationTitle}>
                                  {item.title}
                                </Text>
                                <Text style={styles.recommendationBody}>
                                  {item.body}
                                </Text>
                              </View>
                              <View style={styles.priorityPill}>
                                <Text style={styles.priorityPillText}>
                                  {item.priority}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  </View>

                  <View style={styles.diagnosticsTable}>
                    <View style={styles.diagnosticsRow}>
                      <Text style={styles.diagnosticsCell}>
                        No live Thunder liquidity diagnostics are indexed yet.
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.asideStack}>
                  <View style={styles.asideCard}>
                    <Text style={styles.eyebrowMuted}>Planner scope</Text>
                    <Text style={styles.asideTitle}>
                      Live liquidity data pending
                    </Text>
                    <Text style={styles.asideBody}>
                      This planner does not open channels, rebalance funds, or
                      move value. Live Thunder liquidity data is not indexed
                      yet.
                    </Text>
                  </View>

                  <View style={styles.amberCard}>
                    <Text style={styles.amberEyebrow}>Coming next</Text>
                    <Text style={styles.asideTitle}>
                      Live Thunder operations
                    </Text>
                    <View style={styles.bulletList}>
                      <AmberBullet text="Route quote before payment review." />
                      <AmberBullet text="Channel open and close workflows." />
                      <AmberBullet text="Liquidity-aware invoice creation." />
                    </View>
                  </View>
                </View>
              </View>
            ) : null}

            {selectedTab?.kind === "parent-chain" ? (
              <View style={styles.parentChainGrid}>
                <View style={styles.formCard}>
                  <Text style={styles.sectionHeading}>Deposit</Text>
                  <Text style={styles.sectionCaption}>
                    Move L1 value into {platform.displayName}.
                  </Text>

                  <DisabledField
                    label="Platform deposit address"
                    placeholder="Live deposit address not indexed"
                    mono
                  />
                  <DisabledField
                    label="Deposit amount"
                    placeholder="0.00000000"
                  />

                  <Pressable
                    accessibilityRole="button"
                    style={styles.solidButton}
                  >
                    <Text style={styles.solidButtonText}>
                      Review deposit
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.formCard}>
                  <Text style={styles.sectionHeading}>Withdraw</Text>
                  <Text style={styles.sectionCaption}>
                    Return value from {platform.displayName} to L1.
                  </Text>

                  <DisabledField
                    label="L1 return address"
                    placeholder="mainchain address"
                  />
                  <DisabledField
                    label="Withdrawal amount"
                    placeholder="0.00000000"
                  />

                  <Pressable
                    accessibilityRole="button"
                    style={styles.outlineButton}
                  >
                    <Text style={styles.outlineButtonText}>
                      Review withdrawal
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {selectedTab?.kind === "activity" ? (
              <View style={styles.activityWrap}>
                <View style={styles.activityHeader}>
                  <View style={styles.activityHeaderText}>
                    <Text style={styles.sectionHeading}>
                      {selectedTab.title}
                    </Text>
                    <Text style={styles.sectionCaption}>
                      {selectedTab.body}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.outlineButton}
                  >
                    <Text style={styles.outlineButtonText}>Export CSV</Text>
                  </Pressable>
                </View>

                <TextInput
                  editable={false}
                  placeholder="Search by txid, address, amount, or label"
                  placeholderTextColor={GRAY[600]}
                  style={[styles.disabledInput, styles.searchInput]}
                />

                {activityRows.length === 0 ? (
                  <View style={styles.emptyPanel}>
                    <Text style={styles.emptyPanelText}>
                      Live platform activity is not indexed yet.
                    </Text>
                  </View>
                ) : (
                  <StubTable
                    headers={[
                      "Time",
                      "Type",
                      "Amount",
                      "Status",
                      "TxID",
                    ]}
                    rows={activityRows.map((row) => [
                      row.time,
                      row.type,
                      row.amount,
                      row.status,
                      row.txid,
                    ])}
                  />
                )}
              </View>
            ) : null}

            {selectedTab?.kind === "contacts" ? (
              <View style={styles.sectionColumn}>
                <View>
                  <Text style={styles.sectionHeading}>
                    {selectedTab.title}
                  </Text>
                  <Text style={styles.sectionBody}>{selectedTab.body}</Text>

                  <View style={styles.contactsCard}>
                    <View style={styles.contactsSearchRow}>
                      <View style={styles.contactsSearchField}>
                        <Text style={styles.eyebrow}>
                          Search or add BitName
                        </Text>
                        <TextInput
                          editable={false}
                          placeholder="name.bit"
                          placeholderTextColor={GRAY[600]}
                          style={styles.disabledInput}
                        />
                      </View>

                      <View style={styles.disabledButton}>
                        <Text style={styles.disabledButtonText}>
                          Add Contact
                        </Text>
                      </View>
                    </View>

                    {bitNamesContacts.length === 0 ? (
                      <View style={styles.emptyPanelFlush}>
                        <Text style={styles.emptyPanelText}>
                          No live BitNames contacts are indexed yet.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.contactsTable}>
                        {bitNamesContacts.map((contact) => (
                          <View key={contact.name} style={styles.tableRow}>
                            <View style={styles.tableCellGrow}>
                              <Text style={styles.contactName}>
                                {contact.name}
                              </Text>
                              <Text style={styles.contactMeta}>
                                {contact.displayName}
                              </Text>
                            </View>
                            <Text style={styles.tableCell}>{contact.useCase}</Text>
                            <Text style={styles.tableCell}>{contact.status}</Text>
                            <Text style={styles.tableCell}>{contact.lastSeen}</Text>
                            <View style={styles.contactActions}>
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => openBitNamesMessages(contact.name)}
                                style={styles.contactActionButton}
                              >
                                <Text style={styles.contactActionText}>Message</Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => setSelectedTabId("resolve")}
                                style={styles.contactActionButtonNeutral}
                              >
                                <Text style={styles.contactActionTextNeutral}>
                                  Resolve
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.asideCard}>
                  <Text style={styles.eyebrowMuted}>Contact profile</Text>

                  {selectedContact ? (
                    <View style={styles.contactProfile}>
                      <Text style={styles.contactProfileName}>
                        {selectedContact.name}
                      </Text>
                      <Text style={styles.contactProfileDisplay}>
                        {selectedContact.displayName}
                      </Text>
                      <View style={styles.contactProfileDetails}>
                        <View>
                          <Text style={styles.eyebrow}>Status</Text>
                          <Text style={styles.contactProfileValue}>
                            {selectedContact.status}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.eyebrow}>Payment hint</Text>
                          <Text style={styles.contactProfileValue}>
                            {selectedContact.paymentHint}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.emptyMini}>
                      <Text style={styles.emptyMiniText}>
                        No live BitNames contact is selected.
                      </Text>
                    </View>
                  )}

                  {selectedContact ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openBitNamesMessages(selectedContact.name)}
                      style={styles.fullWidthButton}
                    >
                      <Text style={styles.solidButtonText}>Open Messages</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {selectedTab?.kind === "messages" ? (
              <BitMessagesPreview
                contacts={bitNamesContacts}
                messages={bitNamesMessages}
                selectedContactName={selectedBitNamesContact}
                onSelectContact={setSelectedBitNamesContact}
              />
            ) : null}

            {selectedTab &&
            selectedTab?.kind !== "overview" &&
            selectedTab?.kind !== "thunder-payments" &&
            selectedTab?.kind !== "thunder-channels" &&
            selectedTab?.kind !== "thunder-liquidity" &&
            selectedTab?.kind !== "parent-chain" &&
            selectedTab?.kind !== "activity" &&
            selectedTab?.kind !== "contacts" &&
            selectedTab?.kind !== "messages" ? (
              <View style={styles.sectionColumn}>
                <View>
                  <Text style={styles.sectionHeading}>
                    {selectedTab.title}
                  </Text>
                  <Text style={styles.sectionBody}>{selectedTab.body}</Text>

                  <View style={styles.formCard}>
                    <DisabledField
                      label={primaryFieldLabel()}
                      placeholder={primaryFieldPlaceholder()}
                    />
                    <DisabledField
                      label={secondaryFieldLabel()}
                      placeholder={secondaryFieldPlaceholder()}
                    />

                    <Pressable
                      accessibilityRole="button"
                      style={styles.solidButton}
                    >
                      <Text style={styles.solidButtonText}>{actionLabel()}</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.asideCard}>
                  <Text style={styles.eyebrowMuted}>Features</Text>
                  <View style={styles.featureList}>
                    {selectedTab.bullets.map((item) => (
                      <View key={item} style={styles.featureItem}>
                        <View style={styles.featureDot} />
                        <Text style={styles.featureText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}

// ──────────────────────────────────────────────────────
// Small local presentational helpers.
// ──────────────────────────────────────────────────────

function DisabledField({
  label,
  placeholder,
  mono = false,
}: {
  label: string;
  placeholder: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.eyebrow}>{label}</Text>
      <TextInput
        editable={false}
        placeholder={placeholder}
        placeholderTextColor={GRAY[600]}
        style={[styles.disabledInput, mono ? styles.disabledInputMono : null]}
      />
    </View>
  );
}

function SafetyBullet({ text }: { text: string }): React.JSX.Element {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.checkEcash}>✓</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function AmberBullet({ text }: { text: string }): React.JSX.Element {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.checkAmber}>✓</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function ChannelStat({
  label,
  amber = false,
}: {
  label: string;
  amber?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.channelStatCard}>
      <Text style={styles.eyebrow}>{label}</Text>
      <Text style={amber ? styles.metricValueAmber : styles.metricValueEcash}>
        —
      </Text>
      <Text style={styles.metricCaption}>live data not indexed yet</Text>
    </View>
  );
}

function StubTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}): React.JSX.Element {
  return (
    <View style={styles.stubTable}>
      <View style={styles.tableRow}>
        {headers.map((header) => (
          <Text key={header} style={styles.tableHeader}>
            {header}
          </Text>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.tableRow}>
          {row.map((cell, cellIndex) => (
            <Text key={cellIndex} style={styles.tableCell}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  notFoundWrap: {
    gap: 24,
  },
  notFoundCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#991b1b",
    backgroundColor: "rgba(69,10,10,0.3)",
    padding: 24,
  },
  notFoundTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fca5a5",
  },
  notFoundBody: {
    marginTop: 8,
    fontSize: 14,
    color: "rgba(254,202,202,0.8)",
  },
  backLink: {
    fontSize: 14,
    color: ECASH[400],
  },
  heroCard: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    padding: 24,
    gap: 16,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: GRAY[500],
  },
  eyebrowMuted: {
    marginBottom: 12,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: GRAY[500],
  },
  heroTitleRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#ffffff",
  },
  heroTagline: {
    marginTop: 8,
    fontSize: 16,
    color: GRAY[400],
  },
  heroPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusPillActive: {
    backgroundColor: ECASH[900],
  },
  statusPillInactive: {
    backgroundColor: GRAY[800],
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusPillTextActive: {
    color: ECASH[400],
  },
  statusPillTextInactive: {
    color: GRAY[400],
  },
  useCasePill: {
    borderRadius: 999,
    backgroundColor: GRAY[800],
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  useCasePillText: {
    fontSize: 12,
    fontWeight: "600",
    color: GRAY[300],
  },
  heroDescription: {
    marginTop: 24,
    fontSize: 14,
    lineHeight: 24,
    color: GRAY[300],
  },
  metricGrid: {
    marginTop: 24,
    gap: 16,
  },
  metricCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    padding: 16,
  },
  metricValue: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: "900",
  },
  metricValueEcash: {
    color: ECASH[400],
  },
  metricValueAmber: {
    color: "#fbbf24",
  },
  metricCaption: {
    marginTop: 4,
    fontSize: 12,
    color: GRAY[500],
  },
  gateWrap: {
    marginTop: 24,
  },
  tabsCard: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    padding: 16,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: GRAY[800],
    paddingBottom: 12,
  },
  tabButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabButtonActive: {
    backgroundColor: ECASH[600],
  },
  tabButtonInactive: {
    backgroundColor: GRAY[950],
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  tabButtonTextActive: {
    color: "#ffffff",
  },
  tabButtonTextInactive: {
    color: GRAY[400],
  },
  sectionColumn: {
    marginTop: 24,
    gap: 24,
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
  },
  sectionBody: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 24,
    color: GRAY[400],
  },
  sectionCaption: {
    marginTop: 8,
    fontSize: 14,
    color: GRAY[500],
  },
  overviewGrid: {
    marginTop: 24,
    gap: 12,
  },
  insetCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 16,
  },
  insetTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  solidButton: {
    marginTop: 16,
    borderRadius: 8,
    backgroundColor: ECASH[600],
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  solidButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  outlineButton: {
    marginTop: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GRAY[700],
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  outlineButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: GRAY[200],
  },
  asideCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 16,
  },
  emptyMini: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    padding: 16,
  },
  emptyMiniText: {
    fontSize: 14,
    color: GRAY[500],
  },
  tableRow: {
    flexDirection: "row",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: GRAY[900],
    paddingVertical: 8,
  },
  tableHeader: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: GRAY[500],
  },
  tableCell: {
    flex: 1,
    fontSize: 12,
    color: GRAY[300],
  },
  tableCellGrow: {
    flex: 1,
  },
  stack: {
    gap: 24,
  },
  thunderGrid: {
    gap: 16,
  },
  formCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 20,
    gap: 4,
  },
  formTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "900",
    color: "#ffffff",
  },
  field: {
    marginTop: 16,
  },
  disabledInput: {
    marginTop: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: GRAY[400],
  },
  disabledInputMono: {
    fontFamily: "monospace",
    fontSize: 12,
  },
  searchInput: {
    backgroundColor: GRAY[950],
    paddingVertical: 12,
  },
  disabledButton: {
    marginTop: 20,
    borderRadius: 8,
    backgroundColor: GRAY[800],
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  disabledButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: GRAY[600],
  },
  emptyPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 20,
  },
  emptyPanelFlush: {
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 20,
  },
  emptyPanelText: {
    fontSize: 14,
    color: GRAY[500],
  },
  stubTable: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 16,
  },
  asideStack: {
    gap: 16,
  },
  asideTitle: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff",
  },
  asideBody: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 24,
    color: GRAY[400],
  },
  bulletList: {
    marginTop: 20,
    gap: 12,
  },
  featureItem: {
    flexDirection: "row",
    gap: 8,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: GRAY[300],
  },
  checkEcash: {
    color: ECASH[400],
  },
  checkAmber: {
    color: "#fbbf24",
  },
  channelStatCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 16,
  },
  channelActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  panelCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 20,
  },
  recommendations: {
    marginTop: 16,
    gap: 12,
  },
  recommendationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  recommendationText: {
    flex: 1,
  },
  recommendationTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  recommendationBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 24,
    color: GRAY[400],
  },
  priorityPill: {
    borderRadius: 999,
    backgroundColor: GRAY[800],
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  priorityPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: GRAY[300],
  },
  diagnosticsTable: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 16,
  },
  diagnosticsRow: {
    paddingVertical: 24,
  },
  diagnosticsCell: {
    fontSize: 14,
    color: GRAY[500],
  },
  amberCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
    backgroundColor: "rgba(69,26,3,0.1)",
    padding: 24,
  },
  amberEyebrow: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 4,
    color: "#fbbf24",
  },
  parentChainGrid: {
    marginTop: 24,
    gap: 24,
  },
  activityWrap: {
    marginTop: 24,
    gap: 8,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  activityHeaderText: {
    flex: 1,
  },
  contactsCard: {
    marginTop: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[950],
    padding: 20,
  },
  contactsSearchRow: {
    gap: 12,
  },
  contactsSearchField: {
    flex: 1,
  },
  contactsTable: {
    marginTop: 20,
  },
  contactName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  contactMeta: {
    marginTop: 4,
    fontSize: 12,
    color: GRAY[500],
  },
  contactActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  contactActionButton: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: ECASH[700],
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  contactActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: ECASH[400],
  },
  contactActionButtonNeutral: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: GRAY[700],
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  contactActionTextNeutral: {
    fontSize: 12,
    fontWeight: "600",
    color: GRAY[300],
  },
  contactProfile: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    padding: 16,
  },
  contactProfileName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#ffffff",
  },
  contactProfileDisplay: {
    marginTop: 4,
    fontSize: 14,
    color: GRAY[400],
  },
  contactProfileDetails: {
    marginTop: 16,
    gap: 12,
  },
  contactProfileValue: {
    marginTop: 4,
    color: GRAY[300],
  },
  fullWidthButton: {
    marginTop: 16,
    borderRadius: 8,
    backgroundColor: ECASH[600],
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
  },
  featureList: {
    gap: 8,
  },
  featureDot: {
    marginTop: 6,
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: ECASH[500],
  },
});
