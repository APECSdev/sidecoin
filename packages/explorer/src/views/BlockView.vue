<!-- packages/explorer/src/views/BlockView.vue -->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import TransactionsTable from "../components/TransactionsTable.vue";
import { getBlock } from "../api";
import { getExplorerChain } from "../explorer/chains";
import {
  formatBytes,
  formatNumber,
  formatTimestamp,
  truncateMiddle,
} from "../explorer/format";
import type { ExplorerBlockDetail } from "../explorer/types";

const route = useRoute();

const chainId = computed(() => {
  const chain = route.params.chain;
  return typeof chain === "string" ? chain : "";
});

const blockId = computed(() => {
  const id = route.params.id;
  return typeof id === "string" ? id : "";
});

const chain = computed(() => getExplorerChain(chainId.value));
const block = ref<ExplorerBlockDetail | null>(null);
const error = ref("");

async function loadBlock() {
  if (chain.value == null) {
    error.value = "Unknown explorer chain.";
    block.value = null;
    return;
  }

  error.value = "";
  block.value = await getBlock(chainId.value, blockId.value);
}

onMounted(loadBlock);
watch([chainId, blockId], loadBlock);
</script>

<template>
  <section v-if="chain && block" class="space-y-6">
    <div class="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
      <p class="text-sm font-black uppercase tracking-[0.22em] text-yellow-300">
        {{ chain.displayName }} Block
      </p>
      <h1 class="mt-3 break-all font-mono text-3xl font-black text-white">
        {{ formatNumber(block.height) }}
      </h1>
      <p class="mt-3 break-all font-mono text-sm text-gray-400">
        {{ block.hash }}
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Timestamp</p>
        <p class="mt-2 text-white">{{ formatTimestamp(block.timestamp) }}</p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Confirmations</p>
        <p class="mt-2 font-mono text-white">{{ formatNumber(block.confirmations) }}</p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Transactions</p>
        <p class="mt-2 font-mono text-white">{{ formatNumber(block.transactionCount) }}</p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Size</p>
        <p class="mt-2 font-mono text-white">{{ formatBytes(block.size) }}</p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Weight</p>
        <p class="mt-2 font-mono text-white">{{ formatNumber(block.weight) }}</p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Difficulty</p>
        <p class="mt-2 font-mono text-white">{{ block.difficulty }}</p>
      </div>
    </div>

    <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
      <dl class="space-y-4 text-sm">
        <div>
          <dt class="text-xs uppercase tracking-wide text-gray-500">Merkle Root</dt>
          <dd class="mt-1 break-all font-mono text-gray-300">{{ block.merkleRoot }}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-gray-500">Previous Block</dt>
          <dd class="mt-1 font-mono text-gray-300">
            <RouterLink
              v-if="block.previousHash"
              :to="{ name: 'block', params: { chain: chain.id, id: block.previousHash } }"
              class="text-yellow-300 hover:text-yellow-200"
            >
              {{ truncateMiddle(block.previousHash, 16, 16) }}
            </RouterLink>
            <span v-else>None</span>
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-gray-500">Next Block</dt>
          <dd class="mt-1 font-mono text-gray-300">
            <RouterLink
              v-if="block.nextHash"
              :to="{ name: 'block', params: { chain: chain.id, id: block.nextHash } }"
              class="text-yellow-300 hover:text-yellow-200"
            >
              {{ truncateMiddle(block.nextHash, 16, 16) }}
            </RouterLink>
            <span v-else>Tip</span>
          </dd>
        </div>
      </dl>
    </div>

    <TransactionsTable :chain-id="chain.id" :transactions="block.transactions" />
  </section>

  <section v-else class="rounded-2xl border border-red-900/70 bg-red-950/30 p-6">
    <h1 class="text-2xl font-black text-red-200">Block unavailable</h1>
    <p class="mt-2 text-red-100">
      {{ error || "Unable to load this block." }}
    </p>
  </section>
</template>
