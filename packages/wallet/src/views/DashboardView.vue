<!-- packages/wallet/src/views/DashboardView.vue -->

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getSidechains, getDeposits } from "../api";
import type { SidechainSummary } from "../api";

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

async function load() {
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

onMounted(load);

function formatSats(sats: bigint): string {
  const neg = sats < 0n;
  const abs = neg ? -sats : sats;
  const whole = abs / 100000000n;
  const frac = (abs % 100000000n).toString().padStart(8, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}
</script>

<template>
  <div>
    <h2 class="mb-6 text-2xl font-bold">Dashboard</h2>

    <!-- Loading state -->
    <div v-if="loading" class="text-gray-400">Loading sidechain activity…</div>

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
      <!-- Aggregate inflow card -->
      <div class="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <p class="text-sm text-gray-400">Total Deposit Inflow (all chains)</p>
        <p class="mt-2 text-4xl font-bold text-ecash-400">
          {{ formatSats(totalSats) }}
          <span class="text-lg text-gray-500">eCash</span>
        </p>
        <p class="mt-2 text-sm text-gray-500">
          {{ totalDeposits }} deposits across {{ rows.length }} sidechains
        </p>
        <p class="mt-1 text-xs text-gray-600">
          Derived inflow, not spendable balance. Wallet balance arrives with key setup.
        </p>
      </div>

      <!-- Per-chain breakdown -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="row in rows"
          :key="row.summary.slot"
          class="rounded-lg border border-gray-800 bg-gray-900 p-4"
        >
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-white">{{ row.summary.displayName }}</h3>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-medium"
              :class="row.provisioned ? 'bg-ecash-900 text-ecash-400' : 'bg-gray-800 text-gray-500'"
            >
              {{ row.provisioned ? "Provisioned" : "Pending" }}
            </span>
          </div>
          <p class="mt-2 font-mono text-sm text-ecash-400">
            {{ formatSats(row.totalSats) }}
          </p>
          <p class="mt-1 text-xs text-gray-500">
            {{ row.depositCount }} deposits · slot {{ row.summary.slot }}
          </p>
        </div>
      </div>

      <!-- Fork countdown banner -->
      <div class="rounded-lg border border-ecash-800 bg-ecash-950 p-4">
        <p class="text-sm font-semibold text-ecash-400">
          eCash Hard Fork — 2026-08-21 15:00Z — Block ~964,000
        </p>
        <p class="mt-1 text-xs text-ecash-600">
          BIP-300 / BIP-301 Drivechains · 7 sidechains at launch
        </p>
      </div>
    </div>
  </div>
</template>
