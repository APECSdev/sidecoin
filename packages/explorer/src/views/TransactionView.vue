<!-- packages/explorer/src/views/TransactionView.vue -->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import CopyButton from "../components/CopyButton.vue";
import ErrorState from "../components/ErrorState.vue";
import HashLink from "../components/HashLink.vue";
import LoadingState from "../components/LoadingState.vue";
import { getTransaction } from "../api";
import { getExplorerChain } from "../explorer/chains";
import {
  formatBytes,
  formatNumber,
  formatTimestamp,
  statusClass,
} from "../explorer/format";
import type { ExplorerTransactionDetail } from "../explorer/types";

const OFFICIAL_L1_EXPLORER_BASE = "https://explorer.signet.drivechain.info";

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
const isIndexedChain = computed(() => chain.value?.status === "active");
const transaction = ref<ExplorerTransactionDetail | null>(null);
const officialL1TransactionUrl = computed(() =>
  chainId.value === "l1" && transaction.value?.txid
    ? `${OFFICIAL_L1_EXPLORER_BASE}/tx/${transaction.value.txid}`
    : "",
);
const loading = ref(true);
const error = ref("");

async function loadTransaction() {
  if (chain.value == null) {
    error.value = "This explorer chain is not configured.";
    transaction.value = null;
    loading.value = false;
    return;
  }

  if (!isIndexedChain.value) {
    error.value = "";
    transaction.value = null;
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    transaction.value = await getTransaction(chainId.value, txid.value);
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : "Unable to load this transaction.";
    transaction.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadTransaction);
watch([chainId, txid], loadTransaction);
</script>

<template>
  <LoadingState
    v-if="loading && chain"
    title="Loading transaction"
    :message="`Fetching transaction ${txid} on ${chain.displayName}.`"
  />

  <section
    v-else-if="chain && !isIndexedChain"
    class="rounded-3xl border border-blue-900/70 bg-blue-950/30 p-6"
  >
    <p class="text-sm font-black uppercase tracking-[0.22em] text-blue-300">
      Not indexed yet
    </p>
    <h1 class="mt-3 text-2xl font-black text-blue-100">Coming soon</h1>
    <p class="mt-2 max-w-3xl text-sm leading-6 text-blue-100/80">
      This transaction view is not indexed yet. SidΞcoin only shows live chain
      data. Until SupaQt indexing is connected for {{ chain.displayName }},
      transaction details will remain empty.
    </p>
  </section>

  <section v-else-if="chain && transaction" class="space-y-6">
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

        <div class="flex flex-wrap items-center gap-2">
          <span
            class="w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase"
            :class="statusClass(transaction.status)"
          >
            {{ transaction.status }}
          </span>
          <a
            v-if="officialL1TransactionUrl"
            :href="officialL1TransactionUrl"
            target="_blank"
            rel="noreferrer"
            class="rounded-xl border border-gray-700 px-4 py-2 text-sm font-bold text-gray-200 transition hover:border-cyan-300 hover:text-cyan-200"
          >
            Official L1 Explorer
          </a>
          <CopyButton :value="transaction.txid" label="Copy txid" />
        </div>
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
            <HashLink
              v-if="transaction.blockHash"
              :value="transaction.blockHash"
              :chain-id="chain.id"
              route-name="block"
              param-name="id"
              :head="16"
              :tail="16"
            />
            <span v-else>Pending</span>
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
            <div class="flex flex-wrap items-center gap-2">
              <HashLink
                :value="input.previousTxid"
                :chain-id="chain.id"
                route-name="transaction"
                param-name="txid"
                :head="16"
                :tail="16"
              />
              <span class="font-mono text-gray-500">:{{ input.vout }}</span>
              <CopyButton :value="`${input.previousTxid}:${input.vout}`" label="Outpoint" />
            </div>
            <HashLink
              :value="input.address"
              :chain-id="chain.id"
              route-name="address"
              param-name="address"
              :truncate="false"
            />
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
            <div class="flex flex-wrap items-center gap-2">
              <HashLink
                :value="output.address"
                :chain-id="chain.id"
                route-name="address"
                param-name="address"
                :truncate="false"
              />
              <CopyButton :value="output.address" label="Address" />
            </div>
            <p class="font-mono text-white">{{ output.amount }}</p>
            <p class="text-xs uppercase tracking-wide text-gray-500">
              {{ output.spent ? "Spent" : "Unspent" }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <ErrorState
    v-else
    title="Transaction unavailable"
    :message="error || 'Unable to load this transaction.'"
  />
</template>
