<!-- packages/explorer/src/components/ExplorerHeader.vue -->

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { EXPLORER_CHAINS } from "../explorer/chains";

const route = useRoute();

const activeChain = computed(() => {
  const chain = route.params.chain;
  return typeof chain === "string" ? chain : "";
});
</script>

<template>
  <header class="border-b border-gray-800 bg-gray-950/80 backdrop-blur">
    <div class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:px-6">
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <RouterLink to="/" class="group inline-flex items-center gap-3">
          <div
            class="grid h-10 w-10 place-items-center rounded-xl border border-yellow-500/70 bg-yellow-500/10 p-1 shadow-lg shadow-yellow-500/10"
            aria-hidden="true"
          >
            <img
              src="/favicon-48x48.png"
              alt=""
              class="h-8 w-8 rounded-lg"
            />
          </div>
          <div>
            <p class="text-lg font-black tracking-tight text-white">
              SidΞcoin Explorer
            </p>
            <p class="text-xs uppercase tracking-[0.22em] text-gray-500">
              L1 + Drivechains
            </p>
          </div>
        </RouterLink>

        <nav class="flex flex-wrap items-center gap-2 text-sm" aria-label="Main">
          <a
            href="https://sidecoin.app"
            class="rounded-lg border border-gray-800 px-3 py-2 text-gray-300 hover:border-yellow-500/70 hover:text-white"
          >
            sidecoin.app
          </a>
          <a
            href="https://wallet.sidecoin.app"
            class="rounded-lg border border-gray-800 px-3 py-2 text-gray-300 hover:border-yellow-500/70 hover:text-white"
          >
            Wallet
          </a>
        </nav>
      </div>

      <nav class="flex gap-2 overflow-x-auto pb-1" aria-label="Explorer chains">
        <RouterLink
          v-for="chain in EXPLORER_CHAINS"
          :key="chain.id"
          :to="{ name: 'chain', params: { chain: chain.id } }"
          class="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition"
          :class="
            activeChain === chain.id
              ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300'
              : 'border-gray-800 bg-gray-900/70 text-gray-400 hover:border-gray-700 hover:text-white'
          "
        >
          {{ chain.shortName }}
        </RouterLink>
      </nav>
    </div>
  </header>
</template>
