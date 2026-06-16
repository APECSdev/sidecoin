<!-- packages/wallet/src/views/DashboardView.vue -->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { getSidechains, getDeposits, getL1Balance, satsToBtc } from "../api";
import type { SidechainSummary, ChainBalance } from "../api";
import { deriveReceiveAddress } from "@sidecoin/shared";
import { loadWallet } from "../keystore";
import {
  DEMO_DASHBOARD_ROWS,
  DEMO_L1_ADDRESS,
  DEMO_L1_BALANCE_SATS,
  DEMO_MODE_EVENT,
  isDemoModeEnabled,
} from "../demo";
import { canAccessPlatform, isProPlatform } from "../entitlements";
import { getPlatformById } from "../data/platforms";
import CoinNewsPreview from "../components/bitnames/CoinNewsPreview.vue";

interface ChainRow {
  summary: SidechainSummary;
  provisioned: boolean;
  depositCount: number;
  totalSats: bigint;
}

const rows = ref<ChainRow[]>([]);
const totalSats = ref<bigint>(0n);
const totalDeposits = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);
const demoMode = ref(isDemoModeEnabled());

// L1 wallet balance — independent of the platform inflow fan-out below.
// Derived from the same BIP-84 receive address ReceiveView shows
// (m/84'/1'/0'/0/0 on signet); queried via the chainId-addressed indexed
// balance route.
const l1Address = ref("");
const l1Balance = ref<ChainBalance | null>(null);
const l1Loading = ref(true);
const l1Error = ref<string | null>(null);

const platformCountLabel = computed(() => {
  return rows.value.length === 1 ? "platform" : "platforms";
});

const eventCountLabel = computed(() => {
  return totalDeposits.value === 1 ? "event" : "events";
});

function applyDemoDashboard() {
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

  rows.value = built;
  totalSats.value = built.reduce((acc, row) => acc + row.totalSats, 0n);
  totalDeposits.value = built.reduce((acc, row) => acc + row.depositCount, 0);
  loading.value = false;
  error.value = null;
}

function applyDemoL1Balance() {
  l1Address.value = DEMO_L1_ADDRESS;
  l1Balance.value = {
    chainId: "signet",
    address: DEMO_L1_ADDRESS,
    source: "indexed",
    totalSats: DEMO_L1_BALANCE_SATS,
    seen: true,
    updatedAtHeight: 210123,
    note: "Demo Mode sample balance",
  };
  l1Loading.value = false;
  l1Error.value = null;
}

async function load() {
  demoMode.value = isDemoModeEnabled();

  if (demoMode.value) {
    applyDemoDashboard();
    return;
  }

  loading.value = true;
  error.value = null;
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

    rows.value = built;
    totalSats.value = built.reduce((acc, r) => acc + r.totalSats, 0n);
    totalDeposits.value = built.reduce((acc, r) => acc + r.depositCount, 0);
  } catch (e) {
    // Keep the real error (ApiError code, message, stack) for developers.
    console.error("[DashboardView] Failed to load data:", e);
    // Show users a friendly, actionable message instead of a raw stack string.
    error.value =
      "We couldn't load your dashboard. Please check your connection and try again.";
  } finally {
    loading.value = false;
  }
}

async function loadL1Balance() {
  demoMode.value = isDemoModeEnabled();

  if (demoMode.value) {
    applyDemoL1Balance();
    return;
  }

  l1Loading.value = true;
  l1Error.value = null;

  const wallet = loadWallet();
  if (!wallet) {
    // No key yet — the L1 balance card shows a setup-required state,
    // mirroring ReceiveView's pending state.
    l1Address.value = "";
    l1Balance.value = null;
    l1Loading.value = false;
    return;
  }

  try {
    const address = deriveReceiveAddress(wallet.mnemonic, wallet.network, 0);
    l1Address.value = address;
    // Indexed balance for ANY chain incl. signet. An unseen address is not
    // an error: it comes back totalSats 0n with seen=false.
    l1Balance.value = await getL1Balance(address);
  } catch (e) {
    // Keep the real error for developers; show users a friendly message.
    console.error("[DashboardView] Failed to load L1 balance:", e);
    l1Error.value =
      "We couldn't load your L1 balance. Please try again.";
  } finally {
    l1Loading.value = false;
  }
}

function handleDemoModeChanged() {
  demoMode.value = isDemoModeEnabled();
  load();
  loadL1Balance();
}

onMounted(() => {
  window.addEventListener(DEMO_MODE_EVENT, handleDemoModeChanged);
  load();
  loadL1Balance();
});

onBeforeUnmount(() => {
  window.removeEventListener(DEMO_MODE_EVENT, handleDemoModeChanged);
});

function formatSats(sats: bigint): string {
  const neg = sats < 0n;
  const abs = neg ? -sats : sats;
  const whole = abs / 100000000n;
  const frac = (abs % 100000000n).toString().padStart(8, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

function isDashboardPlatformLocked(platformId: string): boolean {
  return isProPlatform(platformId) && !canAccessPlatform(platformId);
}

function platformTagline(platformId: string): string {
  return getPlatformById(platformId)?.tagline ?? "Platform analytics";
}

function platformUseCase(platformId: string): string {
  return getPlatformById(platformId)?.primaryUseCase ?? "Platform";
}

function platformHref(platformId: string): string {
  return `#/platforms/${platformId}`;
}
</script>

<template>
  <div>
    <div class="mb-6">
      <div>
        <p class="text-xs uppercase tracking-widest text-ecash-500">
          Drivechains Financial Hub
        </p>
        <h2 class="mt-1 text-3xl font-black">Dashboard</h2>
      </div>
    </div>

    <section
      v-if="demoMode"
      class="mb-6 rounded-2xl border border-ecash-700 bg-gradient-to-br from-ecash-950/60 via-gray-900 to-gray-950 p-5"
      data-test="demo-mode-dashboard-banner"
    >
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <span class="inline-flex rounded-full bg-ecash-500 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-gray-950">
            Demo Mode
          </span>
          <h3 class="mt-3 text-xl font-black text-white">Sample financial hub activity is enabled</h3>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            You are viewing sample balances and platform activity across the
            Drivechains Financial Hub.
          </p>
        </div>

        <div class="flex flex-wrap gap-3">
          <a
            href="#/settings"
            class="rounded-lg border border-ecash-700 px-4 py-2 text-sm font-bold text-ecash-400 hover:bg-ecash-900/40"
          >
            Manage demo
          </a>
        </div>
      </div>
    </section>

    <!-- L1 wallet balance — always shown, independent of the platform inflow
         fan-out below. -->
    <div class="mb-6 rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <div class="flex flex-wrap items-center gap-3">
        <p class="text-sm text-gray-400">L1 Wallet Balance</p>
        <span class="rounded-full bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-400">
          Signet
        </span>
      </div>

      <div v-if="l1Loading" class="mt-2 text-gray-400">Loading balance…</div>

      <div v-else-if="l1Error" class="mt-2 text-sm text-red-400">
        <p>{{ l1Error }}</p>
        <button
          class="mt-2 rounded-lg bg-red-800/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-800/60"
          @click="loadL1Balance"
        >
          Retry
        </button>
      </div>

      <div v-else-if="!l1Address" class="mt-2 text-sm text-yellow-500">
        Wallet setup required — your L1 balance appears once key setup is
        complete.
      </div>

      <template v-else>
        <p class="mt-2 text-4xl font-bold text-ecash-400">
          {{ satsToBtc(l1Balance ? l1Balance.totalSats : 0n) }}
          <span class="text-lg text-gray-500">BTC</span>
        </p>
        <p
          v-if="l1Balance && !l1Balance.seen"
          class="mt-2 text-xs text-yellow-600"
        >
          Address not yet seen on-chain. New deposits appear after they confirm
          and are indexed.
        </p>
        <p v-else class="mt-2 break-all font-mono text-xs text-gray-600">
          {{ l1Address }}
        </p>
      </template>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="text-gray-400">Loading platform activity…</div>

    <!-- Error state -->
    <div v-else-if="error" class="rounded bg-red-900/30 p-4 text-red-400">
      <p class="font-semibold">Error loading dashboard</p>
      <p class="mt-1 text-sm">{{ error }}</p>
      <button
        class="mt-3 rounded-lg bg-red-800/40 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-800/60"
        @click="load"
      >
        Retry
      </button>
    </div>

    <!-- Loaded state -->
    <div v-else class="space-y-6">
      <!-- Aggregate platform activity card -->
      <div class="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <p class="text-sm text-gray-400">Platform Activity</p>
        <p class="mt-2 text-4xl font-bold text-ecash-400">
          {{ formatSats(totalSats) }}
          <span class="text-lg text-gray-500">eCash</span>
        </p>
        <p class="mt-2 text-sm text-gray-500">
          {{ totalDeposits }} {{ eventCountLabel }} across {{ rows.length }} {{ platformCountLabel }}
        </p>
        <p class="mt-1 max-w-2xl text-xs text-gray-600">
          Track balances, deposits, and platform activity across the
          Drivechains Financial Hub.
        </p>
      </div>

      <!-- Coin News preview -->
      <CoinNewsPreview />

      <!-- Per-platform breakdown -->
      <section>
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-black text-white">Platform Portfolio</h3>
          <a href="#/platforms" class="text-sm font-semibold text-ecash-400 hover:text-ecash-300">
            Explore platforms →
          </a>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="row in rows"
            :key="row.summary.slot"
            class="rounded-xl border border-gray-800 bg-gray-900 p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <h4 class="font-semibold text-white">{{ row.summary.displayName }}</h4>
                <p class="mt-1 text-xs text-gray-500">{{ platformTagline(row.summary.id) }}</p>
              </div>

              <div class="flex shrink-0 flex-col items-end gap-2">
                <span
                  v-if="isDashboardPlatformLocked(row.summary.id)"
                  class="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-black text-gray-950"
                >
                  PRO
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="row.summary.status === 'active' ? 'bg-ecash-900 text-ecash-400' : 'bg-gray-800 text-gray-500'"
                >
                  {{ row.summary.status === "active" ? "Active" : "Proposed" }}
                </span>
              </div>
            </div>

            <template v-if="isDashboardPlatformLocked(row.summary.id)">
              <p class="mt-4 text-sm leading-6 text-gray-400">
                Unlock platform analytics with Sidecoin PRO.
              </p>
              <a
                href="#/pro"
                class="mt-4 inline-flex rounded-lg border border-amber-500/60 px-3 py-2 text-xs font-black text-amber-400 hover:bg-amber-500 hover:text-gray-950"
              >
                Unlock analytics
              </a>
            </template>

            <template v-else>
              <p class="mt-4 font-mono text-sm text-ecash-400">
                {{ formatSats(row.totalSats) }}
              </p>
              <div class="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500">
                <span>{{ row.depositCount }} {{ row.depositCount === 1 ? "event" : "events" }} · slot {{ row.summary.slot }}</span>
                <span class="rounded-full bg-gray-800 px-2 py-0.5 text-gray-400">
                  {{ platformUseCase(row.summary.id) }}
                </span>
              </div>
              <a
                :href="platformHref(row.summary.id)"
                class="mt-4 inline-flex rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-ecash-500 hover:bg-gray-800 hover:text-white"
              >
                Open platform
              </a>
            </template>
          </div>
        </div>
      </section>

      <!-- Fork countdown banner -->
      <div class="rounded-lg border border-ecash-800 bg-ecash-950 p-4">
        <p class="text-sm font-semibold text-ecash-400">
          eCash Hard Fork — 2026-08-21 15:00Z — Block ~964,000
        </p>
        <p class="mt-1 text-xs text-ecash-600">
          BIP-300 / BIP-301 Drivechains · 7 platforms at launch
        </p>
      </div>
    </div>
  </div>
</template>
