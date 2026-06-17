<!-- packages/wallet/src/views/MarketsView.vue -->

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getMarketPrice, type MarketPrice } from "../api";

const price = ref<MarketPrice | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

async function loadMarketPrice() {
  loading.value = true;
  error.value = null;

  try {
    price.value = await getMarketPrice("ecash");
  } catch (e) {
    console.error("[MarketsView] Failed to load market price:", e);
    price.value = null;
    error.value = "Live market data is unavailable.";
  } finally {
    loading.value = false;
  }
}

function formatAsOf(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "—";
  }

  return date.toISOString().replace(".000Z", "Z");
}

onMounted(() => {
  loadMarketPrice();
});
</script>

<template>
  <div class="space-y-6">
    <div>
      <p class="text-xs uppercase tracking-widest text-ecash-500">
        Live market data
      </p>
      <h2 class="mt-1 text-3xl font-black">Markets</h2>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
        ECX/eCash market data from SupaQt.
      </p>
    </div>

    <section class="rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="text-sm text-gray-400">ECX / eCash</p>
          <h3 class="mt-2 text-2xl font-black text-white">Market Price</h3>
        </div>

        <button
          type="button"
          class="w-fit rounded-lg border border-gray-700 px-4 py-2 text-sm font-bold text-gray-200 hover:border-ecash-500 hover:bg-gray-800 hover:text-white"
          @click="loadMarketPrice"
        >
          Refresh
        </button>
      </div>

      <div v-if="loading" class="mt-6 text-sm text-gray-400">
        Loading live market price…
      </div>

      <div v-else-if="error" class="mt-6 rounded-xl border border-yellow-800 bg-yellow-950/30 p-4 text-sm text-yellow-400">
        <p>{{ error }}</p>
        <button
          type="button"
          class="mt-3 rounded-lg bg-yellow-900/50 px-3 py-2 text-xs font-bold text-yellow-200 hover:bg-yellow-900"
          @click="loadMarketPrice"
        >
          Retry
        </button>
      </div>

      <div v-else-if="price" class="mt-6 grid gap-4 md:grid-cols-3">
        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p class="text-xs uppercase tracking-widest text-gray-500">Asset</p>
          <p class="mt-2 text-xl font-black text-white">{{ price.asset }}</p>
          <p class="mt-1 text-sm text-gray-500">{{ price.name }}</p>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p class="text-xs uppercase tracking-widest text-gray-500">Price</p>
          <p class="mt-2 text-xl font-black text-ecash-400">
            USD {{ price.price_usd }}
          </p>
          <p class="mt-1 text-sm text-gray-500">{{ price.source }}</p>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p class="text-xs uppercase tracking-widest text-gray-500">As of</p>
          <p class="mt-2 font-mono text-sm font-semibold text-white">
            {{ formatAsOf(price.as_of) }}
          </p>
          <p class="mt-1 text-sm text-gray-500">SupaQt</p>
        </div>
      </div>

      <div v-else class="mt-6 text-sm text-gray-500">
        No live market price is available.
      </div>
    </section>
  </div>
</template>
