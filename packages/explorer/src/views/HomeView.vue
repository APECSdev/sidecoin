<!-- packages/explorer/src/views/HomeView.vue -->

<script setup lang="ts">
import { RouterLink } from "vue-router";
import SearchBox from "../components/SearchBox.vue";
import { DEFAULT_CHAIN_ID, EXPLORER_CHAINS } from "../explorer/chains";
import { statusClass } from "../explorer/format";
</script>

<template>
  <section class="space-y-8">
    <div class="rounded-3xl border border-gray-800 bg-gray-900/70 p-6 md:p-8">
      <p class="text-sm font-black uppercase tracking-[0.22em] text-yellow-300">
        SidΞcoin Drivechains Explorer
      </p>
      <h1 class="mt-3 max-w-3xl text-4xl font-black tracking-tight text-white md:text-6xl">
        Search L1 and Drivechain activity.
      </h1>
      <p class="mt-4 max-w-2xl text-lg text-gray-400">
        Explore blocks, transactions, and addresses across the eCash (Signet) L1
        parent chain and supported sidechain surfaces.
      </p>

      <div class="mt-8">
        <SearchBox
          :chain-id="DEFAULT_CHAIN_ID"
          placeholder="Search L1 by block height, transaction hash, or address"
        />
      </div>
    </div>

    <div>
      <div class="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 class="text-2xl font-black text-white">Chains</h2>
          <p class="mt-1 text-sm text-gray-500">
            Open a chain-specific explorer dashboard.
          </p>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RouterLink
          v-for="chain in EXPLORER_CHAINS"
          :key="chain.id"
          :to="{ name: 'chain', params: { chain: chain.id } }"
          class="group rounded-2xl border border-gray-800 bg-gray-900/70 p-5 transition hover:border-yellow-500/70 hover:bg-gray-900"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-black text-white group-hover:text-yellow-200">
                {{ chain.displayName }}
              </h3>
              <p class="mt-1 text-sm text-gray-400">
                {{ chain.description }}
              </p>
            </div>
            <span
              class="rounded-full border px-2 py-1 text-xs font-bold uppercase"
              :class="statusClass(chain.status)"
            >
              {{ chain.status }}
            </span>
          </div>

          <p class="mt-4 text-xs uppercase tracking-[0.18em] text-gray-600">
            {{ chain.kind }}
            <span v-if="chain.slot != null"> · slot {{ chain.slot }}</span>
          </p>
        </RouterLink>
      </div>
    </div>
  </section>
</template>
