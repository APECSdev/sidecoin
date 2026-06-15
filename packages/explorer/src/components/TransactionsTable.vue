<!-- packages/explorer/src/components/TransactionsTable.vue -->

<script setup lang="ts">
import { RouterLink } from "vue-router";
import {
  formatTimestamp,
  statusClass,
  truncateMiddle,
} from "../explorer/format";
import type { ExplorerTransactionSummary } from "../explorer/types";

defineProps<{
  chainId: string;
  transactions: ExplorerTransactionSummary[];
}>();
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
    <div class="border-b border-gray-800 px-4 py-3">
      <h2 class="font-black text-white">Latest Transactions</h2>
    </div>

    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-800 text-sm">
        <thead class="bg-gray-950/50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th class="px-4 py-3">TxID</th>
            <th class="px-4 py-3">Time</th>
            <th class="px-4 py-3">Amount</th>
            <th class="px-4 py-3">Fee</th>
            <th class="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          <tr
            v-for="transaction in transactions"
            :key="transaction.txid"
            class="hover:bg-gray-800/40"
          >
            <td class="px-4 py-3">
              <RouterLink
                :to="{
                  name: 'transaction',
                  params: { chain: chainId, txid: transaction.txid },
                }"
                class="font-mono font-bold text-cyan-300 hover:text-cyan-200"
              >
                {{ truncateMiddle(transaction.txid) }}
              </RouterLink>
            </td>
            <td class="px-4 py-3 text-gray-400">
              {{ formatTimestamp(transaction.timestamp) }}
            </td>
            <td class="px-4 py-3 font-mono text-gray-300">
              {{ transaction.amount }}
            </td>
            <td class="px-4 py-3 font-mono text-gray-400">
              {{ transaction.fee }}
            </td>
            <td class="px-4 py-3">
              <span
                class="rounded-full border px-2 py-1 text-xs font-bold uppercase"
                :class="statusClass(transaction.status)"
              >
                {{ transaction.status }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
