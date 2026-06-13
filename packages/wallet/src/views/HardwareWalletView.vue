<!-- packages/wallet/src/views/HardwareWalletView.vue -->

<script setup lang="ts">
import { ref } from "vue";
import type { HardwareWallet, HardwareAccount } from "../hardware/types";
import { OneKeyHardwareWallet } from "../hardware/onekey";
import ProGate from "../components/pro/ProGate.vue";

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
  <div class="mx-auto max-w-3xl">
    <div class="mb-6">
      <p class="text-xs uppercase tracking-widest text-ecash-500">OneKey integration</p>
      <h2 class="mt-1 text-2xl font-bold">Hardware Wallet</h2>
      <p class="mt-2 max-w-2xl text-sm text-gray-400">
        Connect a OneKey device, derive addresses, and verify receive details
        directly on your hardware wallet.
      </p>
    </div>

    <div class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="font-semibold text-white">{{ wallet.name }} Device</h3>
            <p class="mt-1 text-xs text-gray-500">
              Chromium + HTTPS or localhost · WebUSB required
            </p>
          </div>
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold"
            :class="{
              'bg-gray-800 text-gray-400': status === 'idle',
              'bg-yellow-900 text-yellow-300': status === 'connecting',
              'bg-ecash-900 text-ecash-400': status === 'connected',
              'bg-red-900 text-red-300': status === 'error',
            }"
          >
            {{ status }}
          </span>
        </div>

        <button
          class="mt-5 rounded-lg bg-ecash-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-ecash-400 disabled:opacity-40"
          :disabled="status === 'connecting'"
          @click="connect"
        >
          {{ status === "connected" ? "Reconnect OneKey" : "Connect OneKey" }}
        </button>

        <div v-if="status === 'connected'" class="mt-6 space-y-4 rounded-lg border border-gray-800 bg-gray-950 p-4">
          <label class="block text-xs uppercase tracking-wide text-gray-500">
            Derivation path
            <input
              v-model="path"
              class="mt-1 w-full rounded bg-gray-800 p-2 font-mono text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-ecash-500"
            />
          </label>

          <label class="block text-xs uppercase tracking-wide text-gray-500">
            OneKey coin id
            <input
              v-model="coin"
              class="mt-1 w-full rounded bg-gray-800 p-2 font-mono text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-ecash-500"
            />
          </label>

          <label class="flex items-center gap-2 text-sm text-gray-300">
            <input v-model="showOnDevice" type="checkbox" />
            Show address on device for confirmation
          </label>

          <button
            class="rounded border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
            @click="fetchAddress"
          >
            Show address
          </button>
        </div>

        <div
          v-if="account"
          class="mt-5 rounded-lg border border-gray-800 bg-gray-950 p-4"
          data-test="hw-address"
        >
          <p class="mb-1 text-xs uppercase tracking-wide text-gray-500">Derived address</p>
          <p class="break-all font-mono text-sm text-ecash-400">{{ account.address }}</p>
          <p class="mt-2 break-all font-mono text-xs text-gray-600">{{ account.path }}</p>
        </div>

        <p v-if="error" class="mt-4 text-sm text-red-400" data-test="hw-error">
          {{ error }}
        </p>
      </section>

      <aside class="space-y-4">
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h3 class="font-semibold text-white">Basic hardware tools</h3>
          <ul class="mt-3 space-y-2 text-sm text-gray-400">
            <li>✓ Device discovery</li>
            <li>✓ Address derivation</li>
            <li>✓ On-device address confirmation</li>
          </ul>
        </div>

        <ProGate
          title="Unlock hardware signing with PRO"
          description="Sidecoin PRO adds advanced hardware workflows for platform transactions, split review, and higher-assurance wallet operations."
          :benefits="[
            'Hardware signing workflows',
            'Advanced transaction review',
            'Platform-aware signing screens',
            'Historical analysis for signed activity',
          ]"
          cta="Upgrade for hardware signing"
        />
      </aside>
    </div>
  </div>
</template>
