<!-- packages/wallet/src/views/DashboardView.vue -->

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getSidechains, getDeposits, getL1Balance, satsToBtc } from "../api";
import type { SidechainSummary, ChainBalance } from "../api";
import { deriveReceiveAddress } from "@sidecoin/shared";
import { loadWallet } from "../keystore";

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

// L1 (signet) spendable balance — independent of the sidechain inflow
// fan-out below. Derived from the same BIP-84 receive address ReceiveView
// shows (m/84'/1'/0'/0/0 on signet); queried via the chainId-addressed
// indexed balance route (signet has no sidechain slot).
const l1Address = ref("");
const l1Balance = ref<ChainBalance | null>(null);
const l1Loading = ref(true);
const l1Error = ref<string | null>(null);

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

async function loadL1Balance() {
  l1Loading.value = true;
  l1Error.value = null;

  const wallet = loadWallet();
  if (!wallet) {
    // No key yet — the signet balance card shows a setup-required state,
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
      "We couldn't load your signet balance. Please try again.";
  } finally {
    l1Loading.value = false;
  }
}

onMounted(() => {
  load();
  loadL1Balance();
});

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

    <!-- L1 (signet) wallet balance — always shown, independent of the
         sidechain inflow fan-out below. -->
    <div class="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-6">
      <p class="text-sm text-gray-400">Wallet Balance (signet)</p>

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
        Wallet setup required — your signet balance appears once key setup is
        complete.
      </div>

      <template v-else>
        <p class="mt-2 text-4xl font-bold text-ecash-400">
          {{ satsToBtc(l1Balance ? l1Balance.totalSats : 0n) }}
          <span class="text-lg text-gray-500">signet BTC</span>
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
