<!-- packages/desktop/src/views/ReceiveView.vue -->

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";

const address = ref("");
const loading = ref(true);
const error = ref<string | null>(null);
const copied = ref(false);

onMounted(async () => {
  try {
    address.value = await invoke<string>("get_receive_address");
  } catch (e) {
    error.value = String(e);
    console.error("[ReceiveView] Failed to get address:", e);
  } finally {
    loading.value = false;
  }
});

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(address.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (e) {
    console.error("[ReceiveView] Failed to copy:", e);
  }
}
</script>

<template>
  <div>
    <h2 class="mb-6 text-2xl font-bold">Receive eCash</h2>

    <div v-if="loading" class="text-gray-400">Generating address…</div>

    <div v-else-if="error" class="rounded bg-red-900/30 p-4 text-red-400">
      <p class="font-semibold">Error generating address</p>
      <p class="mt-1 text-sm">{{ error }}</p>
    </div>

    <div v-else class="max-w-lg">
      <div class="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <p class="mb-2 text-sm text-gray-400">Your Receive Address</p>
        <p class="break-all font-mono text-sm text-ecash-400">{{ address }}</p>

        <button
          class="mt-4 rounded bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
          @click="copyAddress"
        >
          {{ copied ? "Copied ✓" : "Copy Address" }}
        </button>
      </div>

      <!-- QR code placeholder -->
      <div class="mt-6 flex h-48 w-48 items-center justify-center rounded border border-gray-800 bg-gray-900">
        <span class="text-xs text-gray-600">QR code — TODO</span>
      </div>
    </div>
  </div>
</template>
