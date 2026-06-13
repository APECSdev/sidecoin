<!-- packages/wallet/src/views/PlatformDetailView.vue -->

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useRoute } from "vue-router";
import { getPlatformById } from "../data/platforms";
import type { PlatformFeatureTab } from "../data/platforms";
import { canAccessPlatform, isProPlatform } from "../entitlements";
import ProBadge from "../components/pro/ProBadge.vue";
import ProGate from "../components/pro/ProGate.vue";

interface PlatformTab extends PlatformFeatureTab {
  kind?: "overview" | "workflow" | "parent-chain" | "activity";
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

const route = useRoute();
const selectedTabId = ref("");

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
    ...platform.value.featureTabs.map((tab) => ({
      ...tab,
      kind: "workflow" as const,
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
      { label: "Renewals", value: "2", caption: "upcoming reminders" },
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

          <div class="mt-6 grid gap-3 sm:grid-cols-2">
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
