<!-- packages/explorer/src/views/BlockView.vue -->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import CopyButton from "../components/CopyButton.vue";
import ErrorState from "../components/ErrorState.vue";
import HashLink from "../components/HashLink.vue";
import LoadingState from "../components/LoadingState.vue";
import TransactionsTable from "../components/TransactionsTable.vue";
import { getBlock } from "../api";
import { getExplorerChain } from "../explorer/chains";
import {
  formatBytes,
  formatNumber,
  formatTimestamp,
} from "../explorer/format";
import type { ExplorerBlockDetail } from "../explorer/types";

const OFFICIAL_L1_EXPLORER_BASE = "https://explorer.signet.drivechain.info";

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
const officialL1BlockUrl = computed(() =>
  chainId.value === "l1" && block.value?.hash
    ? `${OFFICIAL_L1_EXPLORER_BASE}/block/${block.value.hash}`
    : "",
);
const loading = ref(true);
const error = ref("");

async function loadBlock() {
  if (chain.value == null) {
    error.value = "This explorer chain is not configured.";
    block.value = null;
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    block.value = await getBlock(chainId.value, blockId.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unable to load this block.";
    block.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadBlock);
watch([chainId, blockId], loadBlock);
</script>

<template>
  <LoadingState
    v-if="loading && chain"
    title="Loading block"
    :message="`Fetching block ${blockId} on ${chain.displayName}.`"
  />

  <section v-else-if="chain && block" class="space-y-6">
    <div class="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
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

        <div class="flex flex-wrap items-center gap-2">
          <a
            v-if="officialL1BlockUrl"
            :href="officialL1BlockUrl"
            target="_blank"
            rel="noreferrer"
            class="rounded-xl border border-gray-700 px-4 py-2 text-sm font-bold text-gray-200 transition hover:border-yellow-300 hover:text-yellow-200"
          >
            Official L1 Explorer
          </a>
          <CopyButton :value="block.hash" label="Copy hash" />
        </div>
      </div>
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
          <div class="flex flex-wrap items-center justify-between gap-3">
            <dt class="text-xs uppercase tracking-wide text-gray-500">Merkle Root</dt>
            <CopyButton :value="block.merkleRoot" label="Copy root" />
          </div>
          <dd class="mt-1 break-all font-mono text-gray-300">{{ block.merkleRoot }}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-gray-500">Previous Block</dt>
          <dd class="mt-1 font-mono text-gray-300">
            <HashLink
              v-if="block.previousHash"
              :value="block.previousHash"
              :chain-id="chain.id"
              route-name="block"
              param-name="id"
              :head="16"
              :tail="16"
            />
            <span v-else>None</span>
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-gray-500">Next Block</dt>
          <dd class="mt-1 font-mono text-gray-300">
            <HashLink
              v-if="block.nextHash"
              :value="block.nextHash"
              :chain-id="chain.id"
              route-name="block"
              param-name="id"
              :head="16"
              :tail="16"
            />
            <span v-else>Tip</span>
          </dd>
        </div>
      </dl>
    </div>

    <TransactionsTable :chain-id="chain.id" :transactions="block.transactions" />
  </section>

  <ErrorState
    v-else
    title="Block unavailable"
    :message="error || 'Unable to load this block.'"
  />
</template>
