<!-- packages/explorer/src/views/ChainView.vue -->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import BlocksTable from "../components/BlocksTable.vue";
import ComingSoonCta from "../components/ComingSoonCta.vue";
import ErrorState from "../components/ErrorState.vue";
import LoadingState from "../components/LoadingState.vue";
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
const isIndexedChain = computed(() => chain.value?.status === "active");

const latestHeightValue = computed(() =>
  isIndexedChain.value && status.value ? formatNumber(status.value.latestHeight) : "—",
);

const latestBlockValue = computed(() =>
  isIndexedChain.value && status.value?.latestBlockHash
    ? truncateMiddle(status.value.latestBlockHash, 12, 10)
    : "—",
);

const indexedTransactionsValue = computed(() =>
  isIndexedChain.value && status.value
    ? formatNumber(status.value.indexedTransactions)
    : "—",
);

const mempoolTransactionsValue = computed(() =>
  isIndexedChain.value && status.value
    ? formatNumber(status.value.mempoolTransactions)
    : "—",
);

const latestBlockNote = computed(() =>
  isIndexedChain.value ? "Live API index" : "Not indexed yet",
);

const indexedTransactionsNote = computed(() =>
  isIndexedChain.value ? "Latest block transaction count" : "No live rows shown",
);

const mempoolTransactionsNote = computed(() =>
  isIndexedChain.value ? "Confirmed-only index" : "No mempool index yet",
);

const status = ref<ExplorerStatus | null>(null);
const blocks = ref<ExplorerBlockSummary[]>([]);
const transactions = ref<ExplorerTransactionSummary[]>([]);
const loading = ref(true);
const error = ref("");

async function loadChain() {
  if (chain.value == null) {
    error.value = "This explorer chain is not configured.";
    status.value = null;
    blocks.value = [];
    transactions.value = [];
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    status.value = await getExplorerStatus(chainId.value);
    blocks.value = await getLatestBlocks(chainId.value);
    transactions.value = await getLatestTransactions(chainId.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unable to load chain data.";
    status.value = null;
    blocks.value = [];
    transactions.value = [];
  } finally {
    loading.value = false;
  }
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

    <LoadingState
      v-if="loading"
      title="Loading chain dashboard"
      :message="`Fetching ${chain.displayName} explorer data.`"
    />

    <ErrorState
      v-else-if="error"
      title="Chain dashboard unavailable"
      :message="error"
    />

    <template v-else>
      <ComingSoonCta v-if="!isIndexedChain" :chain-name="chain.displayName" />

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Latest Height"
          :value="latestHeightValue"
          :note="isIndexedChain && status ? formatTimestamp(status.updatedAt) : 'Not indexed yet'"
        />
        <StatCard
          label="Latest Block"
          :value="latestBlockValue"
          :note="latestBlockNote"
        />
        <StatCard
          label="Indexed Transactions"
          :value="indexedTransactionsValue"
          :note="indexedTransactionsNote"
        />
        <StatCard
          label="Mempool Transactions"
          :value="mempoolTransactionsValue"
          :note="mempoolTransactionsNote"
        />
      </div>

      <div class="grid gap-6 xl:grid-cols-2">
        <BlocksTable :chain-id="chain.id" :blocks="blocks" />
        <TransactionsTable :chain-id="chain.id" :transactions="transactions" />
      </div>
    </template>
  </section>

  <ErrorState
    v-else
    title="Unknown chain"
    :message="error || 'This explorer chain is not configured.'"
  />
</template>
