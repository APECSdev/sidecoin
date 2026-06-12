<!-- packages/wallet/src/views/SendView.vue -->

<script setup lang="ts">
import { ref, defineAsyncComponent } from "vue";
import { parsePaymentUri } from "../components/paymenturi";

// The scanner is loaded lazily (only when opened) so the camera library
// (vue-qrcode-reader) — which pulls in browser-only getUserMedia APIs — is
// never imported during normal render or in unit tests.
const QrScanner = defineAsyncComponent(
  () => import("../components/QrScanner.vue"),
);

const address = ref("");
const amount = ref("");
const sending = ref(false);
const result = ref<string | null>(null);
const showScanner = ref(false);

function openScanner() {
  showScanner.value = true;
}

function closeScanner() {
  showScanner.value = false;
}

/**
 * Fill the form from a scanned QR value. Accepts a bare address or a BIP-21
 * "bitcoin:" URI (with optional amount); the recipient field is always set,
 * and the amount field only when the URI carried a valid one.
 */
function onScanDecode(value: string) {
  const parsed = parsePaymentUri(value);
  if (parsed.address) address.value = parsed.address;
  if (parsed.amount) amount.value = parsed.amount;
  showScanner.value = false;
}

async function handleSend() {
  // TODO: invoke send command via api layer
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
        <div class="flex gap-2">
          <input
            v-model="address"
            type="text"
            inputmode="text"
            autocapitalize="none"
            autocomplete="off"
            spellcheck="false"
            placeholder="ecash1q..."
            class="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
          />
          <button
            type="button"
            aria-label="Scan QR code"
            class="shrink-0 rounded border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 active:bg-gray-600"
            @click="openScanner"
          >
            Scan
          </button>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-sm text-gray-400">Amount (eCash)</label>
        <input
          v-model="amount"
          type="text"
          inputmode="decimal"
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

    <QrScanner
      v-if="showScanner"
      @decode="onScanDecode"
      @close="closeScanner"
    />
  </div>
</template>
