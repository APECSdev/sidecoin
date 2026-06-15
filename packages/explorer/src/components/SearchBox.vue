<!-- packages/explorer/src/components/SearchBox.vue -->

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import {
  classifyExplorerSearch,
  routeForExplorerSearch,
} from "../explorer/search";

const props = defineProps<{
  chainId: string;
  placeholder?: string;
}>();

const router = useRouter();
const query = ref("");
const error = ref("");

async function submitSearch() {
  const classification = classifyExplorerSearch(query.value);
  const route = routeForExplorerSearch(props.chainId, query.value);

  if (route == null) {
    error.value =
      classification.kind === "unknown"
        ? classification.reason
        : "Enter a block height, transaction hash, or address.";
    return;
  }

  error.value = "";
  await router.push(route);
}
</script>

<template>
  <form class="space-y-2" role="search" @submit.prevent="submitSearch">
    <div class="flex flex-col gap-3 sm:flex-row">
      <label class="sr-only" for="explorer-search">
        Search blocks, transactions, or addresses
      </label>
      <input
        id="explorer-search"
        v-model="query"
        class="min-h-12 flex-1 rounded-xl border border-gray-800 bg-gray-950 px-4 font-mono text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20"
        :placeholder="
          placeholder ?? 'Search by block height, transaction hash, or address'
        "
      />
      <button
        type="submit"
        class="min-h-12 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-black text-gray-950 transition hover:bg-yellow-300"
      >
        Search
      </button>
    </div>

    <p v-if="error" class="text-sm text-red-300" role="alert">
      {{ error }}
    </p>
  </form>
</template>
