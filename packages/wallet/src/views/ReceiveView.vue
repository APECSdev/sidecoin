<!-- packages/wallet/src/views/ReceiveView.vue -->

<script setup lang="ts">
import { ref } from "vue";

// Address issuance is derived from the wallet key (Phase 3 — key setup).
// There is no adapter endpoint that hands out addresses, so until a key
// exists this view shows a pending state rather than a placeholder address.
const address = ref("");
const copied = ref(false);

async function copyAddress() {
  if (!address.value) return;
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

    <!-- No key yet: address derivation comes with wallet setup -->
    <div v-if="!address" class="max-w-lg rounded-lg border border-yellow-800 bg-yellow-950/30 p-4 text-sm text-yellow-400">
      <p class="font-semibold">Wallet setup required</p>
      <p class="mt-1 text-xs text-yellow-600">
        Receive addresses are derived from your wallet key. Address generation
        becomes available once key setup is complete.
      </p>
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
