<!-- packages/wallet/src/views/AssetSwapView.vue -->

<script setup lang="ts">
import { computed, ref } from "vue";

const assets = [
  {
    symbol: "eCash",
    name: "eCash L1",
    chain: "L1",
    balance: "1.32257244",
  },
  {
    symbol: "THUNDER",
    name: "Thunder Network",
    chain: "Thunder",
    balance: "3.02700000",
  },
  {
    symbol: "ZSD",
    name: "zSide",
    chain: "zSide",
    balance: "0.70000000",
  },
  {
    symbol: "BTA",
    name: "BitAssets",
    chain: "BitAssets",
    balance: "0.00000000",
  },
];

const marketRows = [
  {
    pair: "eCash / THUNDER",
    route: "L1 → Thunder",
    rate: "1.00000000",
    liquidity: "94%",
  },
  {
    pair: "THUNDER / ZSD",
    route: "Thunder → zSide",
    rate: "0.99750000",
    liquidity: "81%",
  },
  {
    pair: "eCash / BTA",
    route: "L1 → BitAssets",
    rate: "1.00000000",
    liquidity: "Preview",
  },
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
  return parsedAmount.value.toFixed(8);
});

const canPreview = computed(
  () => parsedAmount.value > 0 && fromAsset.value !== toAsset.value,
);

const routeStatus = computed(() => {
  if (fromAsset.value === toAsset.value) return "Choose another asset";
  if (!parsedAmount.value) return "Enter an amount";
  return "Route ready";
});

function flipAssets() {
  const currentFrom = fromAsset.value;
  fromAsset.value = toAsset.value;
  toAsset.value = currentFrom;
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <div class="rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 p-6 shadow-xl shadow-black/20">
      <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs uppercase tracking-widest text-ecash-500">Asset routing</p>
            <span class="rounded-full border border-ecash-500/40 bg-ecash-950/60 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-ecash-300">
              Preview mode
            </span>
          </div>

          <h2 class="mt-3 text-4xl font-black text-white">Asset Swap</h2>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            Swap between eCash and Drivechain assets on Signet. Preview routes,
            quotes, fees, and settlement paths from one wallet-native trading
            surface.
          </p>
        </div>

        <div class="grid grid-cols-3 gap-3 rounded-2xl border border-gray-800 bg-gray-950/70 p-3 text-center">
          <div class="px-3 py-2">
            <p class="text-lg font-black text-ecash-400">8</p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Assets</p>
          </div>
          <div class="border-x border-gray-800 px-3 py-2">
            <p class="text-lg font-black text-ecash-400">12</p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Routes</p>
          </div>
          <div class="px-3 py-2">
            <p class="text-lg font-black text-ecash-400">Signet</p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Network</p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
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
            <span class="text-right text-gray-200">1.00000000</span>
          </div>
          <div class="flex justify-between gap-4 text-gray-400">
            <span>Slippage tolerance</span>
            <span class="text-right text-gray-200">{{ slippage }}%</span>
          </div>
          <div class="flex justify-between gap-4 text-gray-400">
            <span>Estimated fee</span>
            <span class="text-right text-gray-200">0.00001000 BTC</span>
          </div>
          <div class="flex justify-between gap-4 text-gray-400">
            <span>Settlement path</span>
            <span class="text-right text-gray-200">Signet route preview</span>
          </div>
          <div class="flex justify-between gap-4 text-gray-400">
            <span>Status</span>
            <span class="text-right text-ecash-300">{{ routeStatus }}</span>
          </div>
        </div>

        <button
          type="button"
          :disabled="!canPreview"
          class="mt-4 w-full rounded-xl bg-ecash-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-ecash-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
        >
          Preview quote
        </button>
      </div>

      <aside class="space-y-4">
        <section class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
          <div class="border-b border-gray-800 px-5 py-4">
            <h3 class="text-lg font-black text-white">Route Market</h3>
            <p class="mt-1 text-sm text-gray-500">Signet liquidity preview</p>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-800 text-sm">
              <thead class="bg-gray-950/60 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th class="px-4 py-3">Pair</th>
                  <th class="px-4 py-3">Route</th>
                  <th class="px-4 py-3">Rate</th>
                  <th class="px-4 py-3">Liquidity</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-800">
                <tr v-for="row in marketRows" :key="row.pair">
                  <td class="px-4 py-3 font-semibold text-white">{{ row.pair }}</td>
                  <td class="px-4 py-3 text-gray-400">{{ row.route }}</td>
                  <td class="px-4 py-3 font-mono text-ecash-300">{{ row.rate }}</td>
                  <td class="px-4 py-3 text-gray-300">{{ row.liquidity }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h3 class="text-lg font-black text-white">Swap Flow</h3>
          <div class="mt-4 grid gap-3">
            <div class="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Step 1</p>
              <p class="mt-1 font-semibold text-white">Choose route</p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Step 2</p>
              <p class="mt-1 font-semibold text-white">Preview quote</p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Step 3</p>
              <p class="mt-1 font-semibold text-white">Settle on Signet</p>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-ecash-800 bg-ecash-950/40 p-5">
          <h3 class="text-lg font-black text-ecash-400">Drivechain Routing</h3>
          <p class="mt-2 text-sm leading-6 text-gray-400">
            Move value between L1, Thunder, zSide, BitAssets, and future
            Drivechain markets from one Sidecoin wallet.
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>
