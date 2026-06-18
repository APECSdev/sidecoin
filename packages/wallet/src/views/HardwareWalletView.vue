<!-- packages/wallet/src/views/HardwareWalletView.vue -->

<script setup lang="ts">
import { ref } from "vue";
import type { HardwareWallet, HardwareAccount } from "../hardware/types";
import { OneKeyHardwareWallet } from "../hardware/onekey";
import ProGate from "../components/pro/ProGate.vue";

const props = defineProps<{ wallet?: HardwareWallet }>();
const wallet: HardwareWallet = props.wallet ?? new OneKeyHardwareWallet();

const status = ref<"idle" | "connecting" | "connected" | "error">("idle");
const busy = ref(false);
const error = ref("");
const path = ref("m/84'/0'/0'/0/0");
const coin = ref("btc");
const showOnDevice = ref(true);
const account = ref<HardwareAccount | null>(null);

const quickStart = [
  "Connect your OneKey over WebUSB",
  "Choose a derivation path",
  "Confirm the address on-device",
];

async function connect() {
  if (busy.value || status.value === "connecting") return;

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
  if (busy.value) return;

  busy.value = true;
  error.value = "";
  try {
    account.value = await wallet.getAddress(path.value, {
      coin: coin.value,
      showOnDevice: showOnDevice.value,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <section class="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-xs uppercase tracking-widest text-ecash-500">OneKey integration</p>
          <h2 class="mt-1 text-3xl font-black">Hardware Wallet</h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
            Verify receive addresses directly on your OneKey device and prepare
            for higher-assurance signing workflows across the Drivechains
            Financial Hub.
          </p>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4 lg:w-72">
          <p class="text-xs uppercase tracking-widest text-gray-500">Device status</p>
          <div class="mt-3 flex items-center justify-between">
            <span class="text-sm font-semibold text-white">{{ wallet.name }}</span>
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
            class="mt-4 w-full rounded-lg bg-ecash-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-ecash-400 disabled:opacity-40"
            :disabled="busy || status === 'connecting'"
            @click="connect"
          >
            {{ status === "connected" ? "Reconnect OneKey" : "Connect OneKey" }}
          </button>
        </div>
      </div>
    </section>

    <section class="mt-5 grid gap-4 md:grid-cols-3">
      <div
        v-for="(item, i) in quickStart"
        :key="item"
        class="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-ecash-600 text-sm font-black text-white">
          {{ i + 1 }}
        </span>
        <p class="mt-3 text-sm font-semibold text-white">{{ item }}</p>
      </div>
    </section>

    <section class="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h3 class="font-semibold text-white">Address verification</h3>
        <p class="mt-1 text-xs text-gray-500">
          Chromium + HTTPS or localhost - WebUSB required
        </p>

        <div class="mt-5 space-y-4 rounded-lg border border-gray-800 bg-gray-950 p-4">
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
            class="rounded border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-40"
            :disabled="status !== 'connected' || busy"
            @click="fetchAddress"
          >
            {{ busy ? "Waiting for device..." : "Show address" }}
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
      </div>

      <div class="space-y-5">
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h3 class="font-semibold text-white">Basic hardware tools</h3>
          <ul class="mt-3 space-y-2 text-sm text-gray-400">
            <li>[x] Device discovery</li>
            <li>[x] Address derivation</li>
            <li>[x] On-device address confirmation</li>
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
      </div>
    </section>
  </div>
</template>
