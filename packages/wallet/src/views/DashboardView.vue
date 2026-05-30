<!-- packages/wallet/src/views/DashboardView.vue -->

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getBalance, getLatestBlock, isMockMode } from "../api";
import type { WalletBalance, BlockInfo } from "../api";

const balance = ref<WalletBalance>({ confirmed: 0, unconfirmed: 0, total: 0 });
const block = ref<BlockInfo>({ height: 0, hash: "", timestamp: 0 });
const loading = ref(true);
const error = ref<string | null>(null);
const mockMode = ref(false);

onMounted(async () => {
  try {
    mockMode.value = isMockMode();
    balance.value = await getBalance();
    block.value = await getLatestBlock();
  } catch (e) {
    error.value = String(e);
    console.error("[DashboardView] Failed to load data:", e);
  } finally {
    loading.value = false;
  }
});

function formatSats(sats: number): string {
  return (sats / 1e8).toFixed(8);
}
</script>

<template>
  <div>
    <h2 class="mb-6 text-2xl font-bold">Dashboard</h2>

    <!-- Mock mode banner -->
    <div v-if="mockMode && !loading" class="mb-4 rounded border border-yellow-800 bg-yellow-950/30 p-3 text-sm text-yellow-400">
      <p class="font-semibold">Demo Mode</p>
      <p class="mt-1 text-xs text-yellow-600">
        No backend configured. Showing mock data. Connect a node in Settings.
      </p>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="text-gray-400">Loading wallet data…</div>

    <!-- Error state -->
    <div v-else-if="error" class="rounded bg-red-900/30 p-4 text-red-400">
      <p class="font-semibold">Error loading wallet data</p>
      <p class="mt-1 text-sm">{{ error }}</p>
    </div>

    <!-- Loaded state -->
    <div v-else class="space-y-6">
      <!-- Balance card -->
      <div class="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <p class="text-sm text-gray-400">Total Balance</p>
        <p class="mt-2 text-4xl font-bold text-ecash-400">
          {{ formatSats(balance.total) }}
          <span class="text-lg text-gray-500">eCash</span>
        </p>
        <div class="mt-4 flex gap-8 text-sm text-gray-400">
          <div>
            <span class="text-gray-500">Confirmed:</span>
            {{ formatSats(balance.confirmed) }}
          </div>
          <div>
            <span class="text-gray-500">Unconfirmed:</span>
            {{ formatSats(balance.unconfirmed) }}
          </div>
        </div>
      </div>

      <!-- Block info card -->
      <div class="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <p class="text-sm text-gray-400">Latest Block</p>
        <div class="mt-2 space-y-1 font-mono text-sm">
          <p>
            <span class="text-gray-500">Height:</span>
            <span class="text-white">{{ block.height.toLocaleString() }}</span>
          </p>
          <p>
            <span class="text-gray-500">Hash:</span>
            <span class="break-all text-gray-300">{{ block.hash }}</span>
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
