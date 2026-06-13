<!-- packages/wallet/src/views/AssetSwapView.vue -->

<script setup lang="ts">
import { computed, ref } from "vue";

const assets = [
  { symbol: "eCash", name: "eCash L1", balance: "0.00000000" },
  { symbol: "THUNDER", name: "Thunder Network", balance: "0.00000000" },
  { symbol: "ZSD", name: "zSide", balance: "0.00000000" },
  { symbol: "BTA", name: "BitAssets", balance: "0.00000000" },
];

const fromAsset = ref("eCash");
const toAsset = ref("THUNDER");
const amount = ref("");
const slippage = ref("0.50");

const parsedAmount = computed(() => {
  const n = Number(amount.value);
  return Number.isFinite(n) && n > 0 ? n : 0;
});

const estimatedReceive = computed(() => {
  if (!parsedAmount.value) return "0.00000000";
  // Placeholder 1:1 route preview until liquidity/router backend exists.
  return parsedAmount.value.toFixed(8);
});

const canPreview = computed(
  () => parsedAmount.value > 0 && fromAsset.value !== toAsset.value,
);

function flipAssets() {
  const currentFrom = fromAsset.value;
  fromAsset.value = toAsset.value;
  toAsset.value = currentFrom;
}
</script>

<template>
  <div class="mx-auto max-w-xl">
    <div class="mb-6">
      <p class="text-xs uppercase tracking-widest text-ecash-500">Asset routing</p>
      <h2 class="mt-1 text-2xl font-bold">Asset Swap</h2>
      <p class="mt-2 text-sm text-gray-400">
        Swap between eCash and supported Drivechain assets. Route assets across the Drivechains Financial Hub with clear quote review,
        slippage controls, and partner-powered liquidity.
      </p>
    </div>

    <div class="rounded-2xl border border-gray-800 bg-gray-900 p-4 shadow-xl shadow-black/20">
      <!-- From -->
      <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
        <div class="mb-3 flex items-center justify-between">
          <label class="text-sm text-gray-400">From</label>
          <span class="text-xs text-gray-600">
            Balance:
            {{ assets.find((a) => a.symbol === fromAsset)?.balance }}
          </span>
        </div>

        <div class="flex gap-3">
          <input
            v-model="amount"
            inputmode="decimal"
            placeholder="0.0"
            class="min-w-0 flex-1 bg-transparent text-3xl font-semibold text-white placeholder-gray-700 focus:outline-none"
          />
          <select
            v-model="fromAsset"
            class="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-semibold text-white focus:border-ecash-500 focus:outline-none"
          >
            <option v-for="asset in assets" :key="asset.symbol" :value="asset.symbol">
              {{ asset.symbol }}
            </option>
          </select>
        </div>
      </div>

      <div class="flex justify-center py-3">
        <button
          type="button"
          class="rounded-full border border-gray-700 bg-gray-950 p-2 text-gray-300 transition-colors hover:border-ecash-500 hover:text-white"
          aria-label="Flip swap direction"
          @click="flipAssets"
        >
          ⇅
        </button>
      </div>

      <!-- To -->
      <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
        <div class="mb-3 flex items-center justify-between">
          <label class="text-sm text-gray-400">To</label>
          <span class="text-xs text-gray-600">
            Balance:
            {{ assets.find((a) => a.symbol === toAsset)?.balance }}
          </span>
        </div>

        <div class="flex gap-3">
          <output class="min-w-0 flex-1 text-3xl font-semibold text-white">
            {{ estimatedReceive }}
          </output>
          <select
            v-model="toAsset"
            class="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-semibold text-white focus:border-ecash-500 focus:outline-none"
          >
            <option v-for="asset in assets" :key="asset.symbol" :value="asset.symbol">
              {{ asset.symbol }}
            </option>
          </select>
        </div>
      </div>

      <!-- Route details -->
      <div class="mt-4 space-y-2 rounded-xl border border-gray-800 bg-gray-950/70 p-4 text-sm">
        <div class="flex justify-between text-gray-400">
          <span>Route</span>
          <span class="text-gray-200">{{ fromAsset }} → {{ toAsset }}</span>
        </div>
        <div class="flex justify-between text-gray-400">
          <span>Rate</span>
          <span class="text-gray-200">1.00000000</span>
        </div>
        <div class="flex justify-between text-gray-400">
          <span>Slippage tolerance</span>
          <span class="text-gray-200">{{ slippage }}%</span>
        </div>
        <div class="flex justify-between text-gray-400">
          <span>Network fee</span>
          <span class="text-gray-200">Calculated during review</span>
        </div>
      </div>

      <button
        type="button"
        :disabled="!canPreview"
        class="mt-4 w-full rounded-xl bg-ecash-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-ecash-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
      >
        Review swap
      </button>
    </div>

  </div>
</template>
