<!-- packages/wallet/src/views/HardwareWalletView.vue -->
<script setup lang="ts">
import { ref } from "vue";
import type { HardwareWallet, HardwareAccount } from "../hardware/types";
import { OneKeyHardwareWallet } from "../hardware/onekey";

// Injectable so unit tests can pass a fake (the real adapter touches WebUSB).
const props = defineProps<{ wallet?: HardwareWallet }>();
const wallet: HardwareWallet = props.wallet ?? new OneKeyHardwareWallet();

const status = ref<"idle" | "connecting" | "connected" | "error">("idle");
const error = ref("");
const path = ref("m/44'/0'/0'/0/0");
const coin = ref("btc");
const showOnDevice = ref(true);
const account = ref<HardwareAccount | null>(null);

async function connect() {
  error.value = "";
  status.value = "connecting";
  try {
    await wallet.connect();
    status.value = "connected";
  } catch (e) {
    status.value = "error";
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function fetchAddress() {
  error.value = "";
  try {
    account.value = await wallet.getAddress(path.value, {
      coin: coin.value,
      showOnDevice: showOnDevice.value,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg">
    <h1 class="text-2xl font-bold text-ecash-400">Hardware Wallet</h1>
    <p class="mt-1 text-sm text-gray-500">{{ wallet.name }} · read-only</p>

    <div
      class="mt-4 rounded border border-gray-800 bg-gray-900 p-3 text-xs text-gray-400"
    >
      Requires a Chromium browser over HTTPS (localhost is fine). Read-only:
      derives and displays an address so it can be compared against BitWindow.
      No signing yet.
    </div>

    <div class="mt-6 space-y-4">
      <button
        class="rounded bg-ecash-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-ecash-400 disabled:opacity-40"
        :disabled="status === 'connecting'"
        @click="connect"
      >
        {{ status === "connected" ? "Reconnect" : "Connect device" }}
      </button>

      <div v-if="status === 'connected'" class="space-y-3 rounded bg-gray-900 p-4">
        <label class="block text-xs uppercase tracking-wide text-gray-500">
          Derivation path
          <input
            v-model="path"
            class="mt-1 w-full rounded bg-gray-800 p-2 font-mono text-sm text-gray-100"
          />
        </label>
        <label class="block text-xs uppercase tracking-wide text-gray-500">
          Coin
          <input
            v-model="coin"
            class="mt-1 w-full rounded bg-gray-800 p-2 font-mono text-sm text-gray-100"
          />
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-300">
          <input v-model="showOnDevice" type="checkbox" />
          Show address on device
        </label>
        <button
          class="rounded border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
          @click="fetchAddress"
        >
          Get address
        </button>
      </div>

      <div
        v-if="account"
        class="rounded bg-gray-900 p-4 font-mono text-sm break-all text-ecash-400"
        data-test="hw-address"
      >
        {{ account.address }}
      </div>

      <p v-if="error" class="text-sm text-red-400" data-test="hw-error">
        {{ error }}
      </p>
    </div>
  </div>
</template>
