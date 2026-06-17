<!-- packages/explorer/src/views/AddressView.vue -->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import CopyButton from "../components/CopyButton.vue";
import ErrorState from "../components/ErrorState.vue";
import HashLink from "../components/HashLink.vue";
import LoadingState from "../components/LoadingState.vue";
import { getAddress } from "../api";
import { getExplorerChain } from "../explorer/chains";
import {
  formatNumber,
  formatTimestamp,
  statusClass,
} from "../explorer/format";
import type { ExplorerAddressDetail } from "../explorer/types";

const route = useRoute();

const chainId = computed(() => {
  const chain = route.params.chain;
  return typeof chain === "string" ? chain : "";
});

const addressParam = computed(() => {
  const address = route.params.address;
  return typeof address === "string" ? address : "";
});

const chain = computed(() => getExplorerChain(chainId.value));
const isIndexedChain = computed(() => chain.value?.status === "active");
const hasUtxos = computed(() => (address.value?.utxos.length ?? 0) > 0);

const address = ref<ExplorerAddressDetail | null>(null);
const loading = ref(true);
const error = ref("");

async function loadAddress() {
  if (chain.value == null) {
    error.value = "This explorer chain is not configured.";
    address.value = null;
    loading.value = false;
    return;
  }

  if (!isIndexedChain.value) {
    error.value = "";
    address.value = null;
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    address.value = await getAddress(chainId.value, addressParam.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unable to load this address.";
    address.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadAddress);
watch([chainId, addressParam], loadAddress);
</script>

<template>
  <LoadingState
    v-if="loading && chain"
    title="Loading address"
    :message="`Fetching address activity on ${chain.displayName}.`"
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
      This address view is not indexed yet. SidΞcoin only shows live chain data.
      Until SupaQt indexing is connected for {{ chain.displayName }}, address
      balances, UTXOs, and transaction history will remain empty.
    </p>
  </section>

  <section v-else-if="chain && address" class="space-y-6">
    <div class="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p class="text-sm font-black uppercase tracking-[0.22em] text-cyan-300">
            {{ chain.displayName }} Address
          </p>
          <h1 class="mt-3 break-all font-mono text-xl font-black text-white md:text-3xl">
            {{ address.address }}
          </h1>
        </div>

        <CopyButton :value="address.address" label="Copy address" />
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Balance</p>
        <p class="mt-2 font-mono text-white">{{ address.balance }}</p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Received</p>
        <p class="mt-2 font-mono text-white">{{ address.totalReceived }}</p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Sent</p>
        <p class="mt-2 font-mono text-white">{{ address.totalSent }}</p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">Transactions</p>
        <p class="mt-2 font-mono text-white">{{ formatNumber(address.transactionCount) }}</p>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
        <p class="text-xs uppercase tracking-wide text-gray-500">UTXOs</p>
        <p class="mt-2 font-mono text-white">{{ formatNumber(address.utxoCount) }}</p>
      </div>
    </div>

    <div
      v-if="hasUtxos"
      class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70"
    >
      <div class="border-b border-gray-800 px-4 py-3">
        <h2 class="font-black text-white">UTXOs</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-800 text-sm">
          <thead class="bg-gray-950/50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th class="px-4 py-3">Outpoint</th>
              <th class="px-4 py-3">Amount</th>
              <th class="px-4 py-3">Confirmations</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Copy</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="utxo in address.utxos" :key="`${utxo.txid}:${utxo.vout}`">
              <td class="px-4 py-3">
                <div class="flex flex-wrap items-center gap-1">
                  <HashLink
                    :value="utxo.txid"
                    :chain-id="chain.id"
                    route-name="transaction"
                    param-name="txid"
                  />
                  <span class="font-mono text-gray-500">:{{ utxo.vout }}</span>
                </div>
              </td>
              <td class="px-4 py-3 font-mono text-white">{{ utxo.amount }}</td>
              <td class="px-4 py-3 font-mono text-gray-300">
                {{ formatNumber(utxo.confirmations) }}
              </td>
              <td class="px-4 py-3">
                <span
                  class="rounded-full border px-2 py-1 text-xs font-bold uppercase"
                  :class="statusClass(utxo.status)"
                >
                  {{ utxo.status }}
                </span>
              </td>
              <td class="px-4 py-3">
                <CopyButton :value="`${utxo.txid}:${utxo.vout}`" label="Outpoint" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-else
      class="rounded-2xl border border-gray-800 bg-gray-900/70 p-6"
    >
      <h2 class="font-black text-white">UTXO details</h2>
      <p class="mt-2 text-sm leading-6 text-gray-400">
        Address balance and transaction history are live. Detailed UTXO rows are
        not shown yet for this indexed chain.
      </p>
    </div>

    <div class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
      <div class="border-b border-gray-800 px-4 py-3">
        <h2 class="font-black text-white">Transactions</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-800 text-sm">
          <thead class="bg-gray-950/50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th class="px-4 py-3">TxID</th>
              <th class="px-4 py-3">Time</th>
              <th class="px-4 py-3">Type</th>
              <th class="px-4 py-3">Amount</th>
              <th class="px-4 py-3">Confirmations</th>
              <th class="px-4 py-3">Copy</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="transaction in address.transactions" :key="transaction.txid">
              <td class="px-4 py-3">
                <HashLink
                  :value="transaction.txid"
                  :chain-id="chain.id"
                  route-name="transaction"
                  param-name="txid"
                />
              </td>
              <td class="px-4 py-3 text-gray-400">
                {{ formatTimestamp(transaction.timestamp) }}
              </td>
              <td class="px-4 py-3 font-bold uppercase text-gray-300">
                {{ transaction.type }}
              </td>
              <td class="px-4 py-3 font-mono text-white">
                {{ transaction.amount }}
              </td>
              <td class="px-4 py-3 font-mono text-gray-300">
                {{ formatNumber(transaction.confirmations) }}
              </td>
              <td class="px-4 py-3">
                <CopyButton :value="transaction.txid" label="TxID" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <ErrorState
    v-else
    title="Address unavailable"
    :message="error || 'Unable to load this address.'"
  />
</template>
