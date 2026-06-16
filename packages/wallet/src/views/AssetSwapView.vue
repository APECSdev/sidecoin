<!-- packages/wallet/src/views/AssetSwapView.vue -->

<script setup lang="ts">
import { computed, ref } from "vue";

const assets = [
  {
    symbol: "eCash",
    name: "eCash L1",
    chain: "L1",
    balance: "0.00000000",
  },
  {
    symbol: "THUNDER",
    name: "Thunder Network",
    chain: "Thunder",
    balance: "0.00000000",
  },
  {
    symbol: "ZSD",
    name: "zSide",
    chain: "zSide",
    balance: "0.00000000",
  },
  {
    symbol: "BTA",
    name: "BitAssets",
    chain: "BitAssets",
    balance: "0.00000000",
  },
];

const integrationSteps = [
  "Route and asset discovery",
  "Quote expiration and fee model",
  "Wallet-signable transaction build",
  "Signed transaction broadcast",
  "Swap status and settlement tracking",
];

const safetyNotes = [
  "Quotes can expire before signing.",
  "Fees and route availability can change.",
  "Settlement may take multiple confirmations.",
  "Refund paths must be verified before live launch.",
];

const fromAsset = ref("eCash");
const toAsset = ref("THUNDER");
const amount = ref("");
const slippage = ref("0.50");

const selectedFromAsset = computed(() => {
  return assets.find((asset) => asset.symbol === fromAsset.value) ?? assets[0];
});

const selectedToAsset = computed(() => {
  return assets.find((asset) => asset.symbol === toAsset.value) ?? assets[1];
});

const parsedAmount = computed(() => {
  const n = Number(amount.value);
  return Number.isFinite(n) && n > 0 ? n : 0;
});

const estimatedReceive = computed(() => {
  if (!parsedAmount.value) return "0.00000000";
  // Preview-only 1:1 route display until liquidity/router backend exists.
  return parsedAmount.value.toFixed(8);
});

const routeStatus = computed(() => {
  if (fromAsset.value === toAsset.value) return "Choose two different assets";
  if (!parsedAmount.value) return "Enter an amount to preview the route";
  return "Preview only — SupaQt quote endpoint pending";
});

function flipAssets() {
  const currentFrom = fromAsset.value;
  fromAsset.value = toAsset.value;
  toAsset.value = currentFrom;
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div class="rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 p-6 shadow-xl shadow-black/20">
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs uppercase tracking-widest text-ecash-500">Asset routing</p>
            <span class="rounded-full border border-amber-500/40 bg-amber-950/40 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-amber-300">
              Preview mode
            </span>
          </div>

          <h2 class="mt-3 text-3xl font-black text-white">Asset Swap</h2>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            Preview cross-chain swaps between eCash and supported Drivechain
            assets. Live quote, build, broadcast, and settlement tracking are
            waiting on SupaQt swap backend support.
          </p>
        </div>

        <div class="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm">
          <p class="font-black text-amber-300">Backend integration pending</p>
          <p class="mt-2 max-w-sm leading-6 text-gray-400">
            This page does not sign, broadcast, or execute swaps. It is a
            wallet-native preview for the upcoming live swap flow.
          </p>
        </div>
      </div>
    </div>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <div class="rounded-2xl border border-gray-800 bg-gray-900 p-4 shadow-xl shadow-black/20">
        <!-- From -->
        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <label class="text-sm text-gray-400">From</label>
              <p class="mt-1 text-xs text-gray-600">{{ selectedFromAsset.name }}</p>
            </div>
            <span class="text-xs text-gray-600">
              Balance:
              {{ selectedFromAsset.balance }}
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
            <div>
              <label class="text-sm text-gray-400">To</label>
              <p class="mt-1 text-xs text-gray-600">{{ selectedToAsset.name }}</p>
            </div>
            <span class="text-xs text-gray-600">
              Balance:
              {{ selectedToAsset.balance }}
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
          <div class="flex justify-between gap-4 text-gray-400">
            <span>Route</span>
            <span class="text-right text-gray-200">
              {{ selectedFromAsset.chain }} → {{ selectedToAsset.chain }}
            </span>
          </div>
          <div class="flex justify-between gap-4 text-gray-400">
            <span>Rate</span>
            <span class="text-right text-gray-200">Preview 1.00000000</span>
          </div>
          <div class="flex justify-between gap-4 text-gray-400">
            <span>Slippage tolerance</span>
            <span class="text-right text-gray-200">{{ slippage }}%</span>
          </div>
          <div class="flex justify-between gap-4 text-gray-400">
            <span>Network fee</span>
            <span class="text-right text-gray-200">Requires live quote API</span>
          </div>
          <div class="flex justify-between gap-4 text-gray-400">
            <span>Status</span>
            <span class="text-right text-amber-300">{{ routeStatus }}</span>
          </div>
        </div>

        <button
          type="button"
          disabled
          class="mt-4 w-full cursor-not-allowed rounded-xl bg-gray-800 px-4 py-3 text-sm font-bold text-gray-500"
        >
          Swaps are preview-only
        </button>
      </div>

      <aside class="space-y-4">
        <section class="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h3 class="text-lg font-black text-white">Live swap requirements</h3>
          <p class="mt-2 text-sm leading-6 text-gray-400">
            SupaQt support is required before Sidecoin can enable live quote,
            signing, broadcast, and settlement flows.
          </p>

          <ul class="mt-4 space-y-2 text-sm text-gray-300">
            <li
              v-for="step in integrationSteps"
              :key="step"
              class="flex gap-2 rounded-xl border border-gray-800 bg-gray-950/60 p-3"
            >
              <span class="text-amber-300">•</span>
              <span>{{ step }}</span>
            </li>
          </ul>
        </section>

        <section class="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h3 class="text-lg font-black text-white">Swap safety preview</h3>
          <p class="mt-2 text-sm leading-6 text-gray-400">
            These warnings will be shown before users sign any future live swap.
          </p>

          <ul class="mt-4 space-y-2 text-sm text-gray-300">
            <li
              v-for="note in safetyNotes"
              :key="note"
              class="flex gap-2"
            >
              <span class="text-ecash-400">✓</span>
              <span>{{ note }}</span>
            </li>
          </ul>
        </section>

        <section class="rounded-2xl border border-ecash-800 bg-ecash-950/40 p-5">
          <h3 class="text-lg font-black text-ecash-400">Sidecoin API adapter</h3>
          <p class="mt-2 text-sm leading-6 text-gray-400">
            The planned production path is SupaQt API → Sidecoin API adapter →
            Wallet UI, so frontends consume a stable Sidecoin-shaped contract.
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>
