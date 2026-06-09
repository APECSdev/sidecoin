<!-- packages/wallet/src/views/ReceiveView.vue -->

<script setup lang="ts">
import { ref, onMounted } from "vue";
import QrcodeVue from "qrcode.vue";
import { deriveReceiveAddress } from "@sidecoin/shared";
import { loadWallet } from "../keystore";

// Address issuance is derived from the wallet key. On mount we load the
// stored mnemonic and derive the BIP-84 (P2WPKH) receive address at
// index 0. If no wallet exists yet, the pending state is shown instead.
const address = ref("");
const copied = ref(false);
const error = ref("");

onMounted(() => {
  const wallet = loadWallet();
  if (!wallet) return; // no key yet — pending state renders
  try {
    address.value = deriveReceiveAddress(wallet.mnemonic, wallet.network, 0);
  } catch (e) {
    console.error("[ReceiveView] Failed to derive address:", e);
    error.value = "Unable to derive a receive address from the stored key.";
  }
});

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

    <!-- Derivation failed -->
    <div v-if="error" class="max-w-lg rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-400">
      <p class="font-semibold">Address unavailable</p>
      <p class="mt-1 text-xs text-red-600">{{ error }}</p>
    </div>

    <!-- No key yet: address derivation comes with wallet setup -->
    <div v-else-if="!address" class="max-w-lg rounded-lg border border-yellow-800 bg-yellow-950/30 p-4 text-sm text-yellow-400">
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

      <!-- QR code -->
      <div class="mt-6 flex h-48 w-48 items-center justify-center rounded border border-gray-800 bg-gray-900 p-2">
        <QrcodeVue :value="address" :size="176" level="M" />
      </div>
    </div>
  </div>
</template>
