<!-- packages/wallet/src/views/PlatformDetailView.vue -->

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useRoute } from "vue-router";
import { getPlatformById } from "../data/platforms";
import type { PlatformFeatureTab } from "../data/platforms";
import { canAccessPlatform, isProPlatform } from "../entitlements";
import ProBadge from "../components/pro/ProBadge.vue";
import ProGate from "../components/pro/ProGate.vue";
import BitMessagesPreview from "../components/bitnames/BitMessagesPreview.vue";

interface PlatformTab extends PlatformFeatureTab {
  kind?: "overview" | "workflow" | "thunder-payments" | "thunder-channels" | "thunder-liquidity" | "contacts" | "messages" | "parent-chain" | "activity";
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

const route = useRoute();
const selectedTabId = ref("");
const selectedBitNamesContact = ref("alice.bit");

const thunderPaymentRows: ThunderPaymentRow[] = [
  {
    time: "14:40",
    type: "Payment",
    amount: "0.75000000",
    status: "Settled",
    paymentId: "thunder-pay-7f4a",
  },
  {
    time: "14:12",
    type: "Invoice",
    amount: "0.12500000",
    status: "Paid",
    paymentId: "thunder-inv-52ac",
  },
  {
    time: "13:58",
    type: "Route probe",
    amount: "0.00000000",
    status: "Complete",
    paymentId: "thunder-route-91bd",
  },
];

const thunderChannelRows: ThunderChannelRow[] = [
  {
    peer: "routing-peer-01",
    capacity: "3.00000000",
    inbound: "1.20000000",
    outbound: "1.80000000",
    status: "Open",
    health: "98%",
  },
  {
    peer: "merchant-hub",
    capacity: "2.50000000",
    inbound: "0.90000000",
    outbound: "1.60000000",
    status: "Open",
    health: "94%",
  },
  {
    peer: "backup-route",
    capacity: "1.25000000",
    inbound: "0.85000000",
    outbound: "0.40000000",
    status: "Watch",
    health: "81%",
  },
];

const thunderLiquidityRecommendations: ThunderLiquidityRecommendation[] = [
  {
    title: "Add inbound capacity",
    body: "Receiving capacity is healthy, but another inbound path would improve invoice reliability.",
    priority: "Medium",
  },
  {
    title: "Rebalance merchant-hub",
    body: "Merchant routing has strong outbound capacity and could support more balanced two-way flow.",
    priority: "Low",
  },
  {
    title: "Keep backup route online",
    body: "The backup route improves resilience for small payments and fallback routing.",
    priority: "Low",
  },
];

const bitNamesContacts: BitNamesContact[] = [
  {
    name: "alice.bit",
    displayName: "Alice",
    useCase: "Payments and messages",
    status: "Resolved",
    lastSeen: "2 min ago",
    paymentHint: "Thunder invoice contact",
  },
  {
    name: "merchant.bit",
    displayName: "Merchant",
    useCase: "Invoices and receipts",
    status: "Resolved",
    lastSeen: "Today",
    paymentHint: "Preferred payment endpoint",
  },
  {
    name: "support.bit",
    displayName: "Support",
    useCase: "Product support",
    status: "Preview",
    lastSeen: "Demo",
    paymentHint: "Messaging preview",
  },
];

const bitNamesMessages: BitNamesMessage[] = [
  {
    contact: "alice.bit",
    side: "received",
    time: "14:42",
    body: "Payment received. Thanks!",
  },
  {
    contact: "alice.bit",
    side: "sent",
    time: "14:43",
    body: "Great — I’ll send the next invoice over Thunder.",
  },
  {
    contact: "alice.bit",
    side: "received",
    time: "14:44",
    body: "Perfect. BitNames makes this much easier than copying addresses.",
  },
  {
    contact: "merchant.bit",
    side: "received",
    time: "13:30",
    body: "Your order is ready. Send the payment to the resolved Thunder endpoint.",
  },
  {
    contact: "merchant.bit",
    side: "sent",
    time: "13:31",
    body: "Confirmed. I’ll review the invoice before broadcasting.",
  },
  {
    contact: "support.bit",
    side: "received",
    time: "12:05",
    body: "Welcome to the BitNames messaging preview.",
  },
];

const platform = computed(() => {
  const id = String(route.params.platformId ?? "");
  return getPlatformById(id);
});

const locked = computed(() => {
  return platform.value ? !canAccessPlatform(platform.value.id) : false;
});

const platformTabs = computed<PlatformTab[]>(() => {
  if (!platform.value) return [];

  return [
    {
      id: "overview",
      label: "Overview",
      title: `${platform.value.displayName} overview`,
      body: `${platform.value.displayName} platform summary, balances, actions, and recent activity.`,
      bullets: ["Platform balance", "Wallet actions", "Recent activity", "Parent chain status"],
      kind: "overview",
    },
    ...platform.value.featureTabs.map((tab): PlatformTab => ({
      ...tab,
      kind:
        platform.value?.id === "thunder" && tab.id === "payments"
          ? "thunder-payments"
          : platform.value?.id === "thunder" && tab.id === "channels"
            ? "thunder-channels"
            : platform.value?.id === "thunder" && tab.id === "liquidity"
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
      bullets: ["Deposit address", "Deposit amount", "Withdrawal destination", "Recent transfer status"],
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
});

watchEffect(() => {
  const tabs = platformTabs.value;
  if (!tabs.length) {
    selectedTabId.value = "";
    return;
  }

  if (!tabs.some((tab) => tab.id === selectedTabId.value)) {
    selectedTabId.value = tabs[0].id;
  }
});

const selectedTab = computed(() => {
  return platformTabs.value.find((tab) => tab.id === selectedTabId.value);
});

const selectedContact = computed(() => {
  return bitNamesContacts.find((contact) => contact.name === selectedBitNamesContact.value) ?? bitNamesContacts[0];
});

const proBenefits = computed(() => [
  `Unlock ${platform.value?.displayName ?? "this platform"} workflows`,
  "Historical analysis across platforms",
  "Hardware signing workflows",
  "Early access to proposed platforms like RISCy",
]);

const metricCards = computed<MetricCard[]>(() => {
  const id = platform.value?.id;

  if (id === "thunder") {
    return [
      { label: "Platform Balance", value: "8.25000000", caption: "eCash routed through Thunder" },
      { label: "Payments", value: "12", caption: "recent payment events" },
      { label: "Channels", value: "3", caption: "active liquidity paths" },
      { label: "Liquidity", value: "94%", caption: "available route coverage" },
    ];
  }

  if (id === "bitnames") {
    return [
      { label: "Registered Names", value: "3", caption: "wallet identities" },
      { label: "Records", value: "9", caption: "profile and address records" },
      { label: "Contacts", value: "24", caption: "resolved identities" },
      { label: "Messages", value: "6", caption: "demo conversation events" },
    ];
  }

  if (id === "zside") {
    return [
      { label: "Transparent Balance", value: "2.25000000", caption: "ready to shield" },
      { label: "Shielded Balance", value: "—", caption: "PRO analytics" },
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
    { label: "Early Access", value: "PRO", caption: "proposed platform preview" },
    { label: "Apps", value: "—", caption: "application launcher" },
    { label: "Contracts", value: "—", caption: "interaction review" },
    { label: "Developer", value: "—", caption: "simulation tools" },
  ];
});

const activityRows = computed<ActivityRow[]>(() => {
  const id = platform.value?.id;

  if (id === "thunder") {
    return [
      { time: "2026-06-13 14:40", type: "Payment", amount: "0.75000000", status: "Settled", txid: "thunder-pay-7f4a" },
      { time: "2026-06-13 14:12", type: "Invoice", amount: "0.12500000", status: "Paid", txid: "thunder-inv-52ac" },
      { time: "2026-06-13 13:58", type: "Channel", amount: "1.00000000", status: "Open", txid: "thunder-chan-91bd" },
    ];
  }

  if (id === "bitnames") {
    return [
      { time: "2026-06-13 13:20", type: "Register", amount: "1 name", status: "Confirmed", txid: "bitnames-reg-alice" },
      { time: "2026-06-13 12:50", type: "Record", amount: "3 records", status: "Updated", txid: "bitnames-rec-44de" },
      { time: "2026-06-13 12:15", type: "Resolve", amount: "contact", status: "Resolved", txid: "bitnames-res-09fa" },
    ];
  }

  return [
    { time: "2026-06-13 12:00", type: "Deposit", amount: "—", status: "PRO", txid: "unlock-history" },
    { time: "2026-06-13 11:30", type: "Workflow", amount: "—", status: "PRO", txid: "unlock-workflows" },
    { time: "2026-06-13 11:00", type: "Analytics", amount: "—", status: "PRO", txid: "unlock-analytics" },
  ];
});

function actionLabel(): string {
  const id = platform.value?.id;

  if (id === "thunder") return "Create invoice";
  if (id === "bitnames") return "Search name";
  if (id === "zside") return "Review shield";
  if (id === "bitassets") return "Review asset";
  if (id === "photon") return "Review migration";
  if (id === "truthcoin") return "Browse markets";
  if (id === "coinshift") return "Review route";
  return "Open preview";
}

function primaryFieldLabel(): string {
  const id = platform.value?.id;

  if (id === "thunder") return "Recipient or invoice";
  if (id === "bitnames") return "BitName";
  if (id === "zside") return "Shield destination";
  if (id === "bitassets") return "Asset ticker";
  if (id === "photon") return "Photon address";
  if (id === "truthcoin") return "Market search";
  if (id === "coinshift") return "Destination platform";
  return "Contract address";
}

function primaryFieldPlaceholder(): string {
  const id = platform.value?.id;

  if (id === "thunder") return "invoice, contact, or Thunder address";
  if (id === "bitnames") return "alice";
  if (id === "zside") return "shielded address";
  if (id === "bitassets") return "TOKEN";
  if (id === "photon") return "photon receive address";
  if (id === "truthcoin") return "Search markets...";
  if (id === "coinshift") return "Choose destination platform";
  return "contract or app identifier";
}

function secondaryFieldLabel(): string {
  const id = platform.value?.id;

  if (id === "bitnames") return "Record value";
  if (id === "truthcoin") return "Category";
  if (id === "coinshift") return "Route amount";
  return "Amount";
}

function secondaryFieldPlaceholder(): string {
  const id = platform.value?.id;

  if (id === "bitnames") return "profile, address, or service record";
  if (id === "truthcoin") return "Popular, newest, most active, or liquidity";
  if (id === "coinshift") return "0.00000000";
  return "0.00000000";
}

function openBitNamesMessages(contactName: string) {
  selectedBitNamesContact.value = contactName;
  selectedTabId.value = "messages";
}
</script>

<template>
  <div v-if="!platform" class="mx-auto max-w-2xl">
    <router-link to="/platforms" class="text-sm text-ecash-400 hover:text-ecash-300">
      ← Back to Platforms
    </router-link>

    <div class="mt-6 rounded-xl border border-red-800 bg-red-950/30 p-6">
      <h2 class="text-2xl font-bold text-red-300">Platform not found</h2>
      <p class="mt-2 text-sm text-red-200/80">
        This platform route does not exist.
      </p>
    </div>
  </div>

  <div v-else>
    <router-link to="/platforms" class="text-sm text-ecash-400 hover:text-ecash-300">
      ← Back to Platforms
    </router-link>

    <section class="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="text-xs uppercase tracking-widest text-ecash-500">
            Platform · Slot {{ platform.slot }}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <h2 class="text-3xl font-extrabold text-white">
              {{ platform.displayName }}
            </h2>
            <ProBadge v-if="isProPlatform(platform.id)" />
          </div>
          <p class="mt-2 max-w-2xl text-gray-400">
            {{ platform.tagline }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold"
            :class="platform.status === 'active' ? 'bg-ecash-900 text-ecash-400' : 'bg-gray-800 text-gray-400'"
          >
            {{ platform.status === "active" ? "Active" : "Proposed" }}
          </span>
          <span class="rounded-full bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300">
            {{ platform.primaryUseCase }}
          </span>
        </div>
      </div>

      <p class="mt-6 max-w-3xl text-sm leading-6 text-gray-300">
        {{ platform.description }}
      </p>
    </section>

    <section class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="card in metricCards"
        :key="card.label"
        class="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <p class="text-xs uppercase tracking-widest text-gray-500">{{ card.label }}</p>
        <p
          class="mt-3 text-2xl font-black"
          :class="card.value === 'PRO' || card.value === '—' ? 'text-amber-400' : 'text-ecash-400'"
        >
          {{ card.value }}
        </p>
        <p class="mt-1 text-xs text-gray-500">{{ card.caption }}</p>
      </div>
    </section>

    <ProGate
      v-if="locked"
      class="mt-6"
      :title="`Unlock ${platform.displayName} with Sidecoin PRO`"
      :description="`${platform.displayName} is part of the complete Drivechains Financial Hub. Upgrade to access premium platform workflows, analytics, and early platform features.`"
      :benefits="proBenefits"
      cta="Unlock with PRO"
    />

    <section
      v-if="!locked"
      class="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4"
    >
      <div class="overflow-x-auto">
        <div class="flex min-w-max gap-2 border-b border-gray-800 pb-3">
          <button
            v-for="tab in platformTabs"
            :key="tab.id"
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            :class="selectedTabId === tab.id ? 'bg-ecash-600 text-white' : 'bg-gray-950 text-gray-400 hover:bg-gray-800 hover:text-white'"
            @click="selectedTabId = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div v-if="selectedTab?.kind === 'overview'" class="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div>
          <h3 class="text-xl font-bold text-white">{{ selectedTab.title }}</h3>
          <p class="mt-3 text-sm leading-6 text-gray-400">
            {{ selectedTab.body }}
          </p>

          <div
            v-if="platform.id === 'thunder'"
            class="mt-6 grid gap-3 sm:grid-cols-2"
          >
            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Create invoice</p>
              <p class="mt-2 font-semibold text-white">Request a Thunder payment</p>
              <button
                class="mt-4 rounded-lg bg-ecash-600 px-4 py-2 text-sm font-bold text-white hover:bg-ecash-500"
                @click="selectedTabId = 'payments'"
              >
                Open Payments
              </button>
            </div>

            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Send payment</p>
              <p class="mt-2 font-semibold text-white">Review recipient, route, and fee</p>
              <button
                class="mt-4 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
                @click="selectedTabId = 'payments'"
              >
                Review payment
              </button>
            </div>

            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Channel liquidity</p>
              <p class="mt-2 font-semibold text-white">3 open paths · 94% route coverage</p>
              <button
                class="mt-4 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
                @click="selectedTabId = 'channels'"
              >
                View Channels
              </button>
            </div>

            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Liquidity planner</p>
              <p class="mt-2 font-semibold text-white">Available send/receive capacity</p>
              <button
                class="mt-4 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
                @click="selectedTabId = 'liquidity'"
              >
                Open Planner
              </button>
            </div>
          </div>

          <div
            v-else
            class="mt-6 grid gap-3 sm:grid-cols-2"
          >
            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Primary action</p>
              <p class="mt-2 font-semibold text-white">{{ actionLabel() }}</p>
              <button class="mt-4 rounded-lg bg-ecash-600 px-4 py-2 text-sm font-bold text-white hover:bg-ecash-500">
                Start workflow
              </button>
            </div>

            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Parent chain</p>
              <p class="mt-2 font-semibold text-white">Deposits and withdrawals</p>
              <button
                class="mt-4 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
                @click="selectedTabId = 'parent-chain'"
              >
                Open transfer tools
              </button>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p class="mb-3 text-xs uppercase tracking-widest text-gray-500">
            Recent activity
          </p>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="text-gray-500">
                <tr>
                  <th class="border-b border-gray-800 py-2 font-semibold">Time</th>
                  <th class="border-b border-gray-800 py-2 font-semibold">Type</th>
                  <th class="border-b border-gray-800 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody class="text-gray-300">
                <tr v-for="row in activityRows.slice(0, 3)" :key="row.txid">
                  <td class="border-b border-gray-900 py-2">{{ row.time }}</td>
                  <td class="border-b border-gray-900 py-2">{{ row.type }}</td>
                  <td class="border-b border-gray-900 py-2">{{ row.status }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-else-if="selectedTab?.kind === 'thunder-payments'" class="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div class="space-y-6">
          <div>
            <h3 class="text-xl font-bold text-white">Thunder Payments</h3>
            <p class="mt-3 text-sm leading-6 text-gray-400">
              Preview fast Thunder payment flows for sending payments, creating
              invoices, and reviewing route status before settlement.
            </p>
          </div>

          <div class="grid gap-4 lg:grid-cols-2">
            <div class="rounded-xl border border-gray-800 bg-gray-950 p-5">
              <p class="text-xs uppercase tracking-widest text-gray-500">Send Payment</p>
              <h4 class="mt-2 text-lg font-black text-white">Review outgoing payment</h4>

              <label class="mt-5 block">
                <span class="text-xs uppercase tracking-widest text-gray-500">Recipient or invoice</span>
                <input
                  disabled
                  placeholder="invoice, contact, or Thunder address"
                  class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
                />
              </label>

              <label class="mt-4 block">
                <span class="text-xs uppercase tracking-widest text-gray-500">Amount</span>
                <input
                  disabled
                  placeholder="0.00000000"
                  class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
                />
              </label>

              <label class="mt-4 block">
                <span class="text-xs uppercase tracking-widest text-gray-500">Memo</span>
                <input
                  disabled
                  placeholder="Coffee, invoice #1024, or payment note"
                  class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
                />
              </label>

              <button
                disabled
                class="mt-5 rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-gray-600"
              >
                Review payment
              </button>
            </div>

            <div class="rounded-xl border border-gray-800 bg-gray-950 p-5">
              <p class="text-xs uppercase tracking-widest text-gray-500">Create Invoice</p>
              <h4 class="mt-2 text-lg font-black text-white">Request a payment</h4>

              <label class="mt-5 block">
                <span class="text-xs uppercase tracking-widest text-gray-500">Invoice amount</span>
                <input
                  disabled
                  placeholder="0.00000000"
                  class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
                />
              </label>

              <label class="mt-4 block">
                <span class="text-xs uppercase tracking-widest text-gray-500">Label</span>
                <input
                  disabled
                  placeholder="Payment request label"
                  class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
                />
              </label>

              <label class="mt-4 block">
                <span class="text-xs uppercase tracking-widest text-gray-500">Expiry</span>
                <input
                  disabled
                  placeholder="30 minutes"
                  class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
                />
              </label>

              <button
                disabled
                class="mt-5 rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-gray-600"
              >
                Create invoice
              </button>
            </div>
          </div>

          <div class="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950">
            <table class="w-full min-w-[760px] text-left text-sm">
              <thead class="text-xs uppercase tracking-widest text-gray-500">
                <tr>
                  <th class="border-b border-gray-800 px-4 py-3">Time</th>
                  <th class="border-b border-gray-800 px-4 py-3">Type</th>
                  <th class="border-b border-gray-800 px-4 py-3">Amount</th>
                  <th class="border-b border-gray-800 px-4 py-3">Status</th>
                  <th class="border-b border-gray-800 px-4 py-3">Payment ID</th>
                </tr>
              </thead>
              <tbody class="text-gray-300">
                <tr v-for="row in thunderPaymentRows" :key="row.paymentId">
                  <td class="border-b border-gray-900 px-4 py-3">{{ row.time }}</td>
                  <td class="border-b border-gray-900 px-4 py-3">{{ row.type }}</td>
                  <td class="border-b border-gray-900 px-4 py-3 font-mono text-ecash-400">{{ row.amount }}</td>
                  <td class="border-b border-gray-900 px-4 py-3">{{ row.status }}</td>
                  <td class="border-b border-gray-900 px-4 py-3 font-mono text-xs text-gray-500">{{ row.paymentId }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside class="space-y-4">
          <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Route estimate
            </p>
            <h3 class="mt-2 text-xl font-black text-white">
              Preview route quality
            </h3>
            <dl class="mt-5 space-y-3 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Route coverage</dt>
                <dd class="font-mono text-ecash-400">94%</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Estimated fee</dt>
                <dd class="font-mono text-gray-300">0.00000120</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Expected settlement</dt>
                <dd class="font-mono text-gray-300">Instant preview</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">Fallback routes</dt>
                <dd class="font-mono text-gray-300">2</dd>
              </div>
            </dl>
          </div>

          <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Payment safety
            </p>
            <h3 class="mt-2 text-xl font-black text-white">
              Review before sending
            </h3>
            <ul class="mt-5 space-y-3 text-sm text-gray-300">
              <li class="flex gap-2">
                <span class="text-ecash-400">✓</span>
                <span>Invoices and routes are preview-only in this scaffold.</span>
              </li>
              <li class="flex gap-2">
                <span class="text-ecash-400">✓</span>
                <span>No Thunder payment is broadcast from this screen.</span>
              </li>
              <li class="flex gap-2">
                <span class="text-ecash-400">✓</span>
                <span>Live settlement will require explicit review.</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <div v-else-if="selectedTab?.kind === 'thunder-channels'" class="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div class="space-y-6">
          <div>
            <h3 class="text-xl font-bold text-white">Thunder Channels</h3>
            <p class="mt-3 text-sm leading-6 text-gray-400">
              Monitor channel capacity, inbound/outbound liquidity, route
              health, and future channel actions from one wallet view.
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Open channels</p>
              <p class="mt-3 text-2xl font-black text-ecash-400">3</p>
              <p class="mt-1 text-xs text-gray-500">active liquidity paths</p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Inbound liquidity</p>
              <p class="mt-3 text-2xl font-black text-ecash-400">2.95000000</p>
              <p class="mt-1 text-xs text-gray-500">available to receive</p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Outbound liquidity</p>
              <p class="mt-3 text-2xl font-black text-ecash-400">3.80000000</p>
              <p class="mt-1 text-xs text-gray-500">available to send</p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Average health</p>
              <p class="mt-3 text-2xl font-black text-ecash-400">91%</p>
              <p class="mt-1 text-xs text-gray-500">weighted route score</p>
            </div>
          </div>

          <div class="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950">
            <table class="w-full min-w-[820px] text-left text-sm">
              <thead class="text-xs uppercase tracking-widest text-gray-500">
                <tr>
                  <th class="border-b border-gray-800 px-4 py-3">Peer</th>
                  <th class="border-b border-gray-800 px-4 py-3">Capacity</th>
                  <th class="border-b border-gray-800 px-4 py-3">Inbound</th>
                  <th class="border-b border-gray-800 px-4 py-3">Outbound</th>
                  <th class="border-b border-gray-800 px-4 py-3">Status</th>
                  <th class="border-b border-gray-800 px-4 py-3">Health</th>
                </tr>
              </thead>
              <tbody class="text-gray-300">
                <tr v-for="row in thunderChannelRows" :key="row.peer">
                  <td class="border-b border-gray-900 px-4 py-3 font-semibold text-white">{{ row.peer }}</td>
                  <td class="border-b border-gray-900 px-4 py-3 font-mono text-ecash-400">{{ row.capacity }}</td>
                  <td class="border-b border-gray-900 px-4 py-3 font-mono text-gray-300">{{ row.inbound }}</td>
                  <td class="border-b border-gray-900 px-4 py-3 font-mono text-gray-300">{{ row.outbound }}</td>
                  <td class="border-b border-gray-900 px-4 py-3">{{ row.status }}</td>
                  <td class="border-b border-gray-900 px-4 py-3 font-mono text-gray-300">{{ row.health }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <button
              disabled
              class="rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-gray-600"
            >
              Open Channel
            </button>
            <button
              disabled
              class="rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-gray-600"
            >
              Close selected
            </button>
            <button
              disabled
              class="rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-gray-600"
            >
              Rebalance
            </button>
          </div>
        </div>

        <aside class="space-y-4">
          <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Channel Summary
            </p>
            <h3 class="mt-2 text-xl font-black text-white">
              Balanced liquidity
            </h3>
            <p class="mt-3 text-sm leading-6 text-gray-400">
              Thunder’s preview channel set has more outbound than inbound
              capacity, which is useful for paying but should be monitored for
              receiving reliability.
            </p>
          </div>

          <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Preview-only controls
            </p>
            <h3 class="mt-2 text-xl font-black text-white">
              No channel operations yet
            </h3>
            <p class="mt-3 text-sm leading-6 text-gray-400">
              Channel opening, closing, and rebalancing controls are disabled
              until live Thunder channel operations are connected.
            </p>
          </div>
        </aside>
      </div>

      <div v-else-if="selectedTab?.kind === 'thunder-liquidity'" class="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div class="space-y-6">
          <div>
            <h3 class="text-xl font-bold text-white">Liquidity Planner</h3>
            <p class="mt-3 text-sm leading-6 text-gray-400">
              Plan Thunder send/receive capacity, inspect route coverage, and
              review suggested liquidity actions before moving funds.
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Available to send</p>
              <p class="mt-3 text-2xl font-black text-ecash-400">3.80000000</p>
              <p class="mt-1 text-xs text-gray-500">outbound capacity</p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Available to receive</p>
              <p class="mt-3 text-2xl font-black text-ecash-400">2.95000000</p>
              <p class="mt-1 text-xs text-gray-500">inbound capacity</p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Route coverage</p>
              <p class="mt-3 text-2xl font-black text-ecash-400">94%</p>
              <p class="mt-1 text-xs text-gray-500">payment reachability</p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Suggested action</p>
              <p class="mt-3 text-2xl font-black text-amber-400">Inbound</p>
              <p class="mt-1 text-xs text-gray-500">add receive capacity</p>
            </div>
          </div>

          <div class="rounded-xl border border-gray-800 bg-gray-950 p-5">
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Recommendations
            </p>
            <div class="mt-4 space-y-3">
              <div
                v-for="item in thunderLiquidityRecommendations"
                :key="item.title"
                class="rounded-xl border border-gray-800 bg-gray-900 p-4"
              >
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 class="font-bold text-white">{{ item.title }}</h4>
                    <p class="mt-2 text-sm leading-6 text-gray-400">{{ item.body }}</p>
                  </div>
                  <span class="w-fit rounded-full bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300">
                    {{ item.priority }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950">
            <table class="w-full min-w-[720px] text-left text-sm">
              <thead class="text-xs uppercase tracking-widest text-gray-500">
                <tr>
                  <th class="border-b border-gray-800 px-4 py-3">Diagnostic</th>
                  <th class="border-b border-gray-800 px-4 py-3">Value</th>
                  <th class="border-b border-gray-800 px-4 py-3">Status</th>
                  <th class="border-b border-gray-800 px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody class="text-gray-300">
                <tr>
                  <td class="border-b border-gray-900 px-4 py-3">Outbound ratio</td>
                  <td class="border-b border-gray-900 px-4 py-3 font-mono text-ecash-400">56%</td>
                  <td class="border-b border-gray-900 px-4 py-3">Healthy</td>
                  <td class="border-b border-gray-900 px-4 py-3 text-gray-500">Good payment capacity</td>
                </tr>
                <tr>
                  <td class="border-b border-gray-900 px-4 py-3">Inbound ratio</td>
                  <td class="border-b border-gray-900 px-4 py-3 font-mono text-ecash-400">44%</td>
                  <td class="border-b border-gray-900 px-4 py-3">Watch</td>
                  <td class="border-b border-gray-900 px-4 py-3 text-gray-500">Add capacity for invoices</td>
                </tr>
                <tr>
                  <td class="border-b border-gray-900 px-4 py-3">Fallback routes</td>
                  <td class="border-b border-gray-900 px-4 py-3 font-mono text-ecash-400">2</td>
                  <td class="border-b border-gray-900 px-4 py-3">Ready</td>
                  <td class="border-b border-gray-900 px-4 py-3 text-gray-500">Improves reliability</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside class="space-y-4">
          <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Planner scope
            </p>
            <h3 class="mt-2 text-xl font-black text-white">
              Display-only liquidity view
            </h3>
            <p class="mt-3 text-sm leading-6 text-gray-400">
              This planner does not open channels, rebalance funds, or move
              value. It previews the wallet-native layout for Thunder liquidity
              management.
            </p>
          </div>

          <div class="rounded-xl border border-amber-500/40 bg-amber-950/10 p-6">
            <p class="text-xs font-black uppercase tracking-[0.25em] text-amber-400">
              Coming next
            </p>
            <h3 class="mt-2 text-xl font-black text-white">
              Live Thunder operations
            </h3>
            <ul class="mt-5 space-y-3 text-sm text-gray-300">
              <li class="flex gap-2">
                <span class="text-amber-400">✓</span>
                <span>Route quote before payment review.</span>
              </li>
              <li class="flex gap-2">
                <span class="text-amber-400">✓</span>
                <span>Channel open and close workflows.</span>
              </li>
              <li class="flex gap-2">
                <span class="text-amber-400">✓</span>
                <span>Liquidity-aware invoice creation.</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <div v-else-if="selectedTab?.kind === 'parent-chain'" class="mt-6 grid gap-6 xl:grid-cols-2">
        <div class="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <h3 class="text-xl font-bold text-white">Deposit</h3>
          <p class="mt-2 text-sm text-gray-500">
            Move L1 value into {{ platform.displayName }}.
          </p>

          <label class="mt-5 block">
            <span class="text-xs uppercase tracking-widest text-gray-500">Platform deposit address</span>
            <input
              disabled
              value="s0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 font-mono text-xs text-gray-400"
            />
          </label>

          <label class="mt-4 block">
            <span class="text-xs uppercase tracking-widest text-gray-500">Deposit amount</span>
            <input
              disabled
              placeholder="0.00000000"
              class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
            />
          </label>

          <button class="mt-5 rounded-lg bg-ecash-600 px-4 py-2 text-sm font-bold text-white hover:bg-ecash-500">
            Review deposit
          </button>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <h3 class="text-xl font-bold text-white">Withdraw</h3>
          <p class="mt-2 text-sm text-gray-500">
            Return value from {{ platform.displayName }} to L1.
          </p>

          <label class="mt-5 block">
            <span class="text-xs uppercase tracking-widest text-gray-500">L1 return address</span>
            <input
              disabled
              placeholder="mainchain address"
              class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
            />
          </label>

          <label class="mt-4 block">
            <span class="text-xs uppercase tracking-widest text-gray-500">Withdrawal amount</span>
            <input
              disabled
              placeholder="0.00000000"
              class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
            />
          </label>

          <button class="mt-5 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800">
            Review withdrawal
          </button>
        </div>
      </div>

      <div v-else-if="selectedTab?.kind === 'activity'" class="mt-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 class="text-xl font-bold text-white">{{ selectedTab.title }}</h3>
            <p class="mt-2 text-sm text-gray-500">{{ selectedTab.body }}</p>
          </div>
          <button class="w-fit rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800">
            Export CSV
          </button>
        </div>

        <input
          disabled
          placeholder="Search by txid, address, amount, or label"
          class="mt-5 w-full rounded border border-gray-800 bg-gray-950 px-3 py-3 text-sm text-gray-400 placeholder-gray-600"
        />

        <div class="mt-5 overflow-x-auto rounded-xl border border-gray-800 bg-gray-950">
          <table class="w-full min-w-[760px] text-left text-sm">
            <thead class="text-xs uppercase tracking-widest text-gray-500">
              <tr>
                <th class="border-b border-gray-800 px-4 py-3">Time</th>
                <th class="border-b border-gray-800 px-4 py-3">Type</th>
                <th class="border-b border-gray-800 px-4 py-3">Amount</th>
                <th class="border-b border-gray-800 px-4 py-3">Status</th>
                <th class="border-b border-gray-800 px-4 py-3">TxID</th>
              </tr>
            </thead>
            <tbody class="text-gray-300">
              <tr v-for="row in activityRows" :key="row.txid">
                <td class="border-b border-gray-900 px-4 py-3">{{ row.time }}</td>
                <td class="border-b border-gray-900 px-4 py-3">{{ row.type }}</td>
                <td class="border-b border-gray-900 px-4 py-3 font-mono text-ecash-400">{{ row.amount }}</td>
                <td class="border-b border-gray-900 px-4 py-3">{{ row.status }}</td>
                <td class="border-b border-gray-900 px-4 py-3 font-mono text-xs text-gray-500">{{ row.txid }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="selectedTab?.kind === 'contacts'" class="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div>
          <h3 class="text-xl font-bold text-white">{{ selectedTab.title }}</h3>
          <p class="mt-3 text-sm leading-6 text-gray-400">
            {{ selectedTab.body }}
          </p>

          <div class="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-5">
            <div class="flex flex-col gap-3 md:flex-row md:items-end">
              <label class="flex-1">
                <span class="text-xs uppercase tracking-widest text-gray-500">Search or add BitName</span>
                <input
                  disabled
                  placeholder="alice.bit"
                  class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
                />
              </label>

              <button
                disabled
                type="button"
                class="rounded-lg border border-gray-800 px-4 py-2 text-sm font-semibold text-gray-600"
              >
                Add Contact
              </button>
            </div>

            <div class="mt-5 overflow-x-auto rounded-xl border border-gray-800 bg-gray-950">
              <table class="w-full min-w-[760px] text-left text-sm">
                <thead class="text-xs uppercase tracking-widest text-gray-500">
                  <tr>
                    <th class="border-b border-gray-800 px-4 py-3">BitName</th>
                    <th class="border-b border-gray-800 px-4 py-3">Use case</th>
                    <th class="border-b border-gray-800 px-4 py-3">Status</th>
                    <th class="border-b border-gray-800 px-4 py-3">Last seen</th>
                    <th class="border-b border-gray-800 px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody class="text-gray-300">
                  <tr v-for="contact in bitNamesContacts" :key="contact.name">
                    <td class="border-b border-gray-900 px-4 py-3">
                      <p class="font-semibold text-white">{{ contact.name }}</p>
                      <p class="mt-1 text-xs text-gray-500">{{ contact.displayName }}</p>
                    </td>
                    <td class="border-b border-gray-900 px-4 py-3">{{ contact.useCase }}</td>
                    <td class="border-b border-gray-900 px-4 py-3">{{ contact.status }}</td>
                    <td class="border-b border-gray-900 px-4 py-3">{{ contact.lastSeen }}</td>
                    <td class="border-b border-gray-900 px-4 py-3">
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          class="rounded border border-ecash-700 px-3 py-1 text-xs font-bold text-ecash-400 hover:bg-ecash-950/40"
                          @click="openBitNamesMessages(contact.name)"
                        >
                          Message
                        </button>
                        <button
                          type="button"
                          class="rounded border border-gray-700 px-3 py-1 text-xs font-semibold text-gray-300 hover:bg-gray-800"
                          @click="selectedTabId = 'resolve'"
                        >
                          Resolve
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p class="mb-3 text-xs uppercase tracking-widest text-gray-500">
            Contact profile preview
          </p>

          <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p class="text-lg font-black text-white">{{ selectedContact.name }}</p>
            <p class="mt-1 text-sm text-gray-400">{{ selectedContact.displayName }}</p>
            <dl class="mt-4 space-y-3 text-sm">
              <div>
                <dt class="text-xs uppercase tracking-widest text-gray-500">Status</dt>
                <dd class="mt-1 text-gray-300">{{ selectedContact.status }}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-widest text-gray-500">Payment hint</dt>
                <dd class="mt-1 text-gray-300">{{ selectedContact.paymentHint }}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-widest text-gray-500">Preview scope</dt>
                <dd class="mt-1 text-gray-300">Display-only contact and messaging UI.</dd>
              </div>
            </dl>
          </div>

          <button
            type="button"
            class="mt-4 w-full rounded-lg bg-ecash-600 px-4 py-2 text-sm font-bold text-white hover:bg-ecash-500"
            @click="openBitNamesMessages(selectedContact.name)"
          >
            Open Messages Preview
          </button>
        </div>
      </div>

      <BitMessagesPreview
        v-else-if="selectedTab?.kind === 'messages'"
        v-model:selected-contact-name="selectedBitNamesContact"
        :contacts="bitNamesContacts"
        :messages="bitNamesMessages"
      />

      <div v-else-if="selectedTab" class="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div>
          <h3 class="text-xl font-bold text-white">{{ selectedTab.title }}</h3>
          <p class="mt-3 text-sm leading-6 text-gray-400">
            {{ selectedTab.body }}
          </p>

          <div class="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-5">
            <label class="block">
              <span class="text-xs uppercase tracking-widest text-gray-500">{{ primaryFieldLabel() }}</span>
              <input
                disabled
                :placeholder="primaryFieldPlaceholder()"
                class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
              />
            </label>

            <label class="mt-4 block">
              <span class="text-xs uppercase tracking-widest text-gray-500">{{ secondaryFieldLabel() }}</span>
              <input
                disabled
                :placeholder="secondaryFieldPlaceholder()"
                class="mt-2 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400 placeholder-gray-600"
              />
            </label>

            <button class="mt-5 rounded-lg bg-ecash-600 px-4 py-2 text-sm font-bold text-white hover:bg-ecash-500">
              {{ actionLabel() }}
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p class="mb-3 text-xs uppercase tracking-widest text-gray-500">
            Features
          </p>
          <ul class="space-y-2">
            <li
              v-for="item in selectedTab.bullets"
              :key="item"
              class="flex gap-2 text-sm text-gray-300"
            >
              <span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-ecash-500"></span>
              <span>{{ item }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section
      v-else
      class="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4"
    >
      <div class="overflow-x-auto">
        <div class="flex min-w-max gap-2 border-b border-gray-800 pb-3">
          <button
            v-for="tab in platformTabs"
            :key="tab.id"
            type="button"
            disabled
            class="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-gray-600"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div class="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div>
          <h3 class="text-xl font-bold text-white">Platform wallet preview</h3>
          <p class="mt-3 text-sm leading-6 text-gray-400">
            Sidecoin PRO unlocks the full {{ platform.displayName }} wallet
            experience, including platform-native workflows, parent-chain
            transfer tools, activity history, and premium analytics.
          </p>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p class="mb-3 text-xs uppercase tracking-widest text-gray-500">
            Included with PRO
          </p>
          <ul class="space-y-2">
            <li
              v-for="item in proBenefits"
              :key="item"
              class="flex gap-2 text-sm text-gray-300"
            >
              <span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500"></span>
              <span>{{ item }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
