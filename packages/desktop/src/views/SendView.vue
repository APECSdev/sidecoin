<!-- packages/desktop/src/views/SendView.vue -->

<script setup lang="ts">
import { ref } from "vue";

const address = ref("");
const amount = ref("");
const sending = ref(false);
const result = ref<string | null>(null);

async function handleSend() {
  // TODO: invoke send command
  sending.value = true;
  result.value = null;
  try {
    console.log("[SendView] Send requested:", { address: address.value, amount: amount.value });
    result.value = "Send functionality not yet implemented.";
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div>
    <h2 class="mb-6 text-2xl font-bold">Send eCash</h2>

    <form class="max-w-lg space-y-4" @submit.prevent="handleSend">
      <div>
        <label class="mb-1 block text-sm text-gray-400">Recipient Address</label>
        <input
          v-model="address"
          type="text"
          placeholder="ecash1q..."
          class="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
        />
      </div>

      <div>
        <label class="mb-1 block text-sm text-gray-400">Amount (eCash)</label>
        <input
          v-model="amount"
          type="text"
          placeholder="0.00000000"
          class="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        :disabled="sending || !address || !amount"
        class="rounded bg-ecash-600 px-6 py-2 text-sm font-semibold text-white hover:bg-ecash-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ sending ? "Sending…" : "Send" }}
      </button>

      <div v-if="result" class="mt-4 rounded bg-gray-900 p-3 text-sm text-gray-400">
        {{ result }}
      </div>
    </form>
  </div>
</template>
