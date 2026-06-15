<!-- packages/explorer/src/views/AddressView.vue -->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { getAddress } from "../api";
import { getExplorerChain } from "../explorer/chains";
import {
  formatNumber,
  formatTimestamp,
  statusClass,
  truncateMiddle,
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
const address = ref<ExplorerAddressDetail | null>(null);
const error = ref("");

async function loadAddress() {
  if (chain.value == null) {
    error.value = "Unknown explorer chain.";
    address.value = null;
    return;
  }

  error.value = "";
  address.value = await getAddress(chainId.value, addressParam.value);
}

onMounted(loadAddress);
watch([chainId, addressParam], loadAddress);
</script>

<template>
  <section v-if="chain && address" class="space-y-6">
    <div class="rounded-3xl border border-gray-800 bg-gray-900/70 p-6">
      <p class="text-sm font-black uppercase tracking-[0.22em] text-cyan-300">
        {{ chain.displayName }} Address
      </p>
      <h1 class="mt-3 break-all font-mono text-xl font-black text-white md:text-3xl">
        {{ address.address }}
      </h1>
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

    <div class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
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
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="utxo in address.utxos" :key="`${utxo.txid}:${utxo.vout}`">
              <td class="px-4 py-3">
                <RouterLink
                  :to="{ name: 'transaction', params: { chain: chain.id, txid: utxo.txid } }"
                  class="font-mono text-cyan-300 hover:text-cyan-200"
                >
                  {{ truncateMiddle(utxo.txid) }}:{{ utxo.vout }}
                </RouterLink>
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
            </tr>
          </tbody>
        </table>
      </div>
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
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="transaction in address.transactions" :key="transaction.txid">
              <td class="px-4 py-3">
                <RouterLink
                  :to="{
                    name: 'transaction',
                    params: { chain: chain.id, txid: transaction.txid },
                  }"
                  class="font-mono text-cyan-300 hover:text-cyan-200"
                >
                  {{ truncateMiddle(transaction.txid) }}
                </RouterLink>
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
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section v-else class="rounded-2xl border border-red-900/70 bg-red-950/30 p-6">
    <h1 class="text-2xl font-black text-red-200">Address unavailable</h1>
    <p class="mt-2 text-red-100">
      {{ error || "Unable to load this address." }}
    </p>
  </section>
</template>
