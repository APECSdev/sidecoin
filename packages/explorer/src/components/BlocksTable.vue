<!-- packages/explorer/src/components/BlocksTable.vue -->

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { formatBytes, formatNumber, formatTimestamp, truncateMiddle } from "../explorer/format";
import type { ExplorerBlockSummary } from "../explorer/types";

defineProps<{
  chainId: string;
  blocks: ExplorerBlockSummary[];
}>();
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
    <div class="border-b border-gray-800 px-4 py-3">
      <h2 class="font-black text-white">Latest Blocks</h2>
    </div>

    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-800 text-sm">
        <thead class="bg-gray-950/50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th class="px-4 py-3">Height</th>
            <th class="px-4 py-3">Hash</th>
            <th class="px-4 py-3">Time</th>
            <th class="px-4 py-3">Txs</th>
            <th class="px-4 py-3">Size</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          <tr v-for="block in blocks" :key="block.hash" class="hover:bg-gray-800/40">
            <td class="px-4 py-3">
              <RouterLink
                :to="{
                  name: 'block',
                  params: { chain: chainId, id: String(block.height) },
                }"
                class="font-mono font-bold text-yellow-300 hover:text-yellow-200"
              >
                {{ formatNumber(block.height) }}
              </RouterLink>
            </td>
            <td class="px-4 py-3 font-mono text-gray-300">
              {{ truncateMiddle(block.hash) }}
            </td>
            <td class="px-4 py-3 text-gray-400">
              {{ formatTimestamp(block.timestamp) }}
            </td>
            <td class="px-4 py-3 font-mono text-gray-300">
              {{ formatNumber(block.transactionCount) }}
            </td>
            <td class="px-4 py-3 text-gray-400">
              {{ formatBytes(block.size) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
