<!-- packages/explorer/src/views/ChainView.vue -->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import BlocksTable from "../components/BlocksTable.vue";
import SearchBox from "../components/SearchBox.vue";
import StatCard from "../components/StatCard.vue";
import TransactionsTable from "../components/TransactionsTable.vue";
import {
  getExplorerStatus,
  getLatestBlocks,
  getLatestTransactions,
} from "../api";
import { getExplorerChain } from "../explorer/chains";
import {
  formatNumber,
  formatTimestamp,
  truncateMiddle,
} from "../explorer/format";
import type {
  ExplorerBlockSummary,
  ExplorerStatus,
  ExplorerTransactionSummary,
} from "../explorer/types";

const route = useRoute();

const chainId = computed(() => {
  const chain = route.params.chain;
  return typeof chain === "string" ? chain : "";
});

const chain = computed(() => getExplorerChain(chainId.value));

const status = ref<ExplorerStatus | null>(null);
const blocks = ref<ExplorerBlockSummary[]>([]);
const transactions = ref<ExplorerTransactionSummary[]>([]);
const error = ref("");

async function loadChain() {
  if (chain.value == null) {
    error.value = "Unknown explorer chain.";
    status.value = null;
    blocks.value = [];
    transactions.value = [];
    return;
  }

  error.value = "";
  status.value = await getExplorerStatus(chainId.value);
  blocks.value = await getLatestBlocks(chainId.value);
  transactions.value = await getLatestTransactions(chainId.value);
}

onMounted(loadChain);
watch(chainId, loadChain);
</script>

<template>
  <section v-if="chain" class="space-y-6">
    <div class="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
      <p class="text-sm font-black uppercase tracking-[0.22em] text-yellow-300">
        SidΞcoin Explorer
      </p>
      <h1 class="mt-3 text-3xl font-black tracking-tight text-white md:text-5xl">
        {{ chain.displayName }} Explorer
      </h1>
      <p class="mt-3 max-w-2xl text-gray-400">
        {{ chain.description }}
      </p>

      <div class="mt-6">
        <SearchBox
          :chain-id="chain.id"
          :placeholder="`Search ${chain.displayName} by block, transaction, or address`"
        />
      </div>
    </div>

    <div v-if="status" class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Latest Height"
        :value="formatNumber(status.latestHeight)"
        :note="formatTimestamp(status.updatedAt)"
      />
      <StatCard
        label="Latest Block"
        :value="truncateMiddle(status.latestBlockHash, 12, 10)"
        note="Current demo index"
      />
      <StatCard
        label="Indexed Transactions"
        :value="formatNumber(status.indexedTransactions)"
        note="Demo-backed scaffold"
      />
      <StatCard
        label="Mempool Transactions"
        :value="formatNumber(status.mempoolTransactions)"
        note="Pending transactions"
      />
    </div>

    <div class="grid gap-6 xl:grid-cols-2">
      <BlocksTable :chain-id="chain.id" :blocks="blocks" />
      <TransactionsTable :chain-id="chain.id" :transactions="transactions" />
    </div>
  </section>

  <section v-else class="rounded-2xl border border-red-900/70 bg-red-950/30 p-6">
    <h1 class="text-2xl font-black text-red-200">Unknown chain</h1>
    <p class="mt-2 text-red-100">
      {{ error || "This explorer chain is not configured." }}
    </p>
  </section>
</template>
