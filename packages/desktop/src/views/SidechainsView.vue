<!-- packages/desktop/src/views/SidechainsView.vue -->

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { commands, type Sidechain } from "../bindings";

const sidechains = ref<Sidechain[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const result = await commands.getSidechains();
    if (result.status === "ok") {
      sidechains.value = result.data;
    } else {
      error.value = String(result.error);
      console.error(
        "[SidechainsView] Failed to load sidechains:",
        result.error,
      );
    }
  } catch (e) {
    error.value = String(e);
    console.error("[SidechainsView] Failed to load sidechains:", e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <h2 class="mb-2 text-2xl font-bold">Sidechains</h2>
    <p class="mb-6 text-sm text-gray-400">
      BIP-300 / BIP-301 Drivechains — 7 sidechains at launch
    </p>

    <div v-if="loading" class="text-gray-400">Loading sidechains…</div>

    <div v-else-if="error" class="rounded bg-red-900/30 p-4 text-red-400">
      <p class="font-semibold">Error loading sidechains</p>
      <p class="mt-1 text-sm">{{ error }}</p>
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="sc in sidechains"
        :key="sc.slot"
        class="rounded-lg border border-gray-800 bg-gray-900 p-4"
      >
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-white">{{ sc.name }}</h3>
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="sc.active ? 'bg-ecash-900 text-ecash-400' : 'bg-gray-800 text-gray-500'"
          >
            {{ sc.active ? "Active" : "Pending" }}
          </span>
        </div>
        <p class="mt-1 text-sm text-gray-400">{{ sc.description }}</p>
        <p class="mt-2 font-mono text-xs text-gray-600">Slot {{ sc.slot }}</p>
      </div>
    </div>
  </div>
</template>
