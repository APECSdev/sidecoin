<!-- packages/explorer/src/views/TransactionView.vue -->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { getTransaction } from "../api";
import { getExplorerChain } from "../explorer/chains";
import {
  formatBytes,
  formatNumber,
  formatTimestamp,
  statusClass,
  truncateMiddle,
} from "../explorer/format";
import type { ExplorerTransactionDetail } from "../explorer/types";

const route = useRoute();

const chainId = computed(() => {
  const chain = route.params.chain;
  return typeof chain === "string" ? chain : "";
});

const txid = computed(() => {
  const value = route.params.txid;
  return typeof value === "string" ? value : "";
});

const chain = computed(() => getExplorerChain(chainId.value));
const transaction = ref<ExplorerTransactionDetail | null>(null);
const error = ref("");

async function loadTransaction() {
  if (chain.value == null) {
    error.value = "Unknown explorer chain.";
    transaction.value = null;
    return;
  }

  error.value = "";
  transaction.value = await getTransaction(chainId.value, txid.value);
}

onMounted(loadTransaction);
watch([chainId, txid], loadTransaction);
</script>

<template>
  <section v-if="chain && transaction" class="space-y-6">
    <div class="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p class="text-sm font-black uppercase tracking-[0.22em] text-cyan-300">
            {{ chain.displayName }} Transaction
          </p>
          <h1 class="mt-3 break-all font-mono text-xl font-black text-white md:text-3xl">
            {{ transaction.txid }}
          </h1>
        </div>
        <span
          class="w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase"
          :class="statusClass(transaction.status)"
        >
          {{ transaction.status }}
        </span>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Block Height</p>
        <p class="mt-2 font-mono text-white">
          <RouterLink
            v-if="transaction.blockHeight != null"
            :to="{
              name: 'block',
              params: { chain: chain.id, id: String(transaction.blockHeight) },
            }"
            class="text-yellow-300 hover:text-yellow-200"
          >
            {{ formatNumber(transaction.blockHeight) }}
          </RouterLink>
          <span v-else>Pending</span>
        </p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Confirmations</p>
        <p class="mt-2 font-mono text-white">{{ formatNumber(transaction.confirmations) }}</p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Fee</p>
        <p class="mt-2 font-mono text-white">{{ transaction.fee }}</p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Fee Rate</p>
        <p class="mt-2 font-mono text-white">{{ transaction.feeRate }}</p>
      </div>
    </div>

    <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
      <dl class="grid gap-4 text-sm md:grid-cols-2">
        <div>
          <dt class="text-xs uppercase tracking-wide text-gray-500">Timestamp</dt>
          <dd class="mt-1 text-gray-300">{{ formatTimestamp(transaction.timestamp) }}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-gray-500">Block Hash</dt>
          <dd class="mt-1 break-all font-mono text-gray-300">
            {{ transaction.blockHash ? truncateMiddle(transaction.blockHash, 16, 16) : "Pending" }}
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-gray-500">Size</dt>
          <dd class="mt-1 font-mono text-gray-300">{{ formatBytes(transaction.size) }}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-gray-500">Virtual Size</dt>
          <dd class="mt-1 font-mono text-gray-300">{{ formatNumber(transaction.vsize) }} vB</dd>
        </div>
      </dl>
    </div>

    <div class="grid gap-6 xl:grid-cols-2">
      <div class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
        <div class="border-b border-gray-800 px-4 py-3">
          <h2 class="font-black text-white">Inputs</h2>
        </div>
        <div class="divide-y divide-gray-800">
          <div
            v-for="input in transaction.inputs"
            :key="`${input.previousTxid}:${input.vout}`"
            class="space-y-2 p-4 text-sm"
          >
            <p class="break-all font-mono text-cyan-300">
              {{ truncateMiddle(input.previousTxid, 16, 16) }}:{{ input.vout }}
            </p>
            <p class="break-all font-mono text-gray-400">{{ input.address }}</p>
            <p class="font-mono text-white">{{ input.amount }}</p>
          </div>
        </div>
      </div>

      <div class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
        <div class="border-b border-gray-800 px-4 py-3">
          <h2 class="font-black text-white">Outputs</h2>
        </div>
        <div class="divide-y divide-gray-800">
          <div
            v-for="output in transaction.outputs"
            :key="output.index"
            class="space-y-2 p-4 text-sm"
          >
            <p class="font-mono text-gray-500">Output {{ output.index }}</p>
            <RouterLink
              :to="{
                name: 'address',
                params: { chain: chain.id, address: output.address },
              }"
              class="break-all font-mono text-cyan-300 hover:text-cyan-200"
            >
              {{ output.address }}
            </RouterLink>
            <p class="font-mono text-white">{{ output.amount }}</p>
            <p class="text-xs uppercase tracking-wide text-gray-500">
              {{ output.spent ? "Spent" : "Unspent" }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section v-else class="rounded-2xl border border-red-900/70 bg-red-950/30 p-6">
    <h1 class="text-2xl font-black text-red-200">Transaction unavailable</h1>
    <p class="mt-2 text-red-100">
      {{ error || "Unable to load this transaction." }}
    </p>
  </section>
</template>
