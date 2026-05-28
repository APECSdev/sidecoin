<!-- packages/desktop/src/views/SettingsView.vue -->

<script setup lang="ts">
import { ref } from "vue";

const nodeUrl = ref("http://127.0.0.1:8332");
const electrumUrl = ref("tcp://127.0.0.1:50001");
const saved = ref(false);

function handleSave() {
  // TODO: persist via tauri-plugin-store
  console.log("[SettingsView] Saving settings:", {
    nodeUrl: nodeUrl.value,
    electrumUrl: electrumUrl.value,
  });
  saved.value = true;
  setTimeout(() => {
    saved.value = false;
  }, 2000);
}
</script>

<template>
  <div>
    <h2 class="mb-6 text-2xl font-bold">Settings</h2>

    <form class="max-w-lg space-y-4" @submit.prevent="handleSave">
      <div>
        <label class="mb-1 block text-sm text-gray-400">Node RPC URL</label>
        <input
          v-model="nodeUrl"
          type="text"
          class="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
        />
      </div>

      <div>
        <label class="mb-1 block text-sm text-gray-400">Electrum Server URL</label>
        <input
          v-model="electrumUrl"
          type="text"
          class="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        class="rounded bg-ecash-600 px-6 py-2 text-sm font-semibold text-white hover:bg-ecash-500"
      >
        {{ saved ? "Saved ✓" : "Save Settings" }}
      </button>
    </form>

    <!-- Debug info -->
    <div class="mt-8 rounded border border-gray-800 bg-gray-900 p-4">
      <p class="mb-2 text-sm font-semibold text-gray-400">Debug Info</p>
      <div class="space-y-1 font-mono text-xs text-gray-500">
        <p>Version: 26.5.11</p>
        <p>Fork Target: 2026-08-21 15:00Z</p>
        <p>Fork Block: ~964,000</p>
        <p>Sidechains: Thunder · zSide · BitNames · BitAssets · Photon · Truthcoin · CoinShift</p>
        <p>BIPs: 300, 301</p>
      </div>
    </div>
  </div>
</template>
