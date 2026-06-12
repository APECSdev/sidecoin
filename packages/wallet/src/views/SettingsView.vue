<!-- packages/wallet/src/views/SettingsView.vue -->

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getApiBaseUrl, setApiBaseUrl } from "../api";
import { DEFAULT_BASE_URL } from "@sidecoin/api-client";
import { loadWallet } from "../keystore";
import { deriveNostrIdentityKey } from "@sidecoin/shared";

const nodeUrl = ref("");
const electrumUrl = ref("tcp://127.0.0.1:50001");
const saved = ref(false);
const usingDefault = ref(true);

// ─── Founder Identity Key (NIP-06 Nostr key) ────────────────
// Derived locally from the wallet mnemonic at m/44'/1237'/0'/0/0. This is the
// canonical Founder identity: copy it here and paste it at sidecoin.app/pro.
// Only the PUBLIC key is ever shown; the private half never leaves derivation.
const identityKey = ref<string | null>(null);
const identityError = ref<string | null>(null);
const copied = ref(false);

onMounted(() => {
  const currentUrl = getApiBaseUrl();
  if (currentUrl) {
    nodeUrl.value = currentUrl;
  }
  usingDefault.value = getApiBaseUrl() === "";

  try {
    const wallet = loadWallet();
    if (!wallet) {
      identityError.value = "No wallet found. Create or import a wallet first.";
      return;
    }
    identityKey.value = deriveNostrIdentityKey(wallet.mnemonic, 0).publicKeyHex;
  } catch (err) {
    console.error("[SettingsView] identity key derivation failed:", err);
    identityError.value = "Could not derive your Founder identity key.";
  }
});

async function copyIdentityKey() {
  if (!identityKey.value) return;
  try {
    await navigator.clipboard.writeText(identityKey.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error("[SettingsView] clipboard write failed:", err);
  }
}

function handleSave() {
  setApiBaseUrl(nodeUrl.value);
  usingDefault.value = getApiBaseUrl() === "";
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

    <!-- Connection status -->
    <div v-if="usingDefault" class="mb-6 rounded border border-yellow-800 bg-yellow-950/30 p-3 text-sm text-yellow-400">
      <p class="font-semibold">Using Default Adapter</p>
      <p class="mt-1 text-xs text-yellow-600">
        Requests go to {{ DEFAULT_BASE_URL }}. Set a custom adapter URL below to override.
      </p>
    </div>
    <div v-else class="mb-6 rounded border border-ecash-800 bg-ecash-950/30 p-3 text-sm text-ecash-400">
      <p class="font-semibold">Custom Adapter</p>
      <p class="mt-1 text-xs text-ecash-600">
        Adapter: {{ getApiBaseUrl() }}
      </p>
    </div>

    <form class="max-w-lg space-y-4" @submit.prevent="handleSave">
      <div>
        <label class="mb-1 block text-sm text-gray-400">Adapter Base URL</label>
        <input
          v-model="nodeUrl"
          type="text"
          :placeholder="DEFAULT_BASE_URL"
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

    <!-- ─── Founder Identity Key ──────────────────────────── -->
    <div class="mt-8 max-w-lg rounded border border-gray-800 bg-gray-900 p-4">
      <p class="mb-1 text-sm font-semibold text-gray-300">Founder Identity Key</p>
      <p class="mb-3 text-xs text-gray-500">
        Paste this at
        <span class="text-ecash-400">sidecoin.app/pro</span> to claim your
        Founder profile. It's your public Nostr identity — safe to share.
      </p>

      <div v-if="identityKey" class="flex items-center gap-2">
        <code
          class="flex-1 break-all rounded border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-xs text-gray-300 select-all"
        >{{ identityKey }}</code>
        <button
          type="button"
          class="shrink-0 rounded bg-ecash-600 px-3 py-2 text-xs font-semibold text-white hover:bg-ecash-500"
          @click="copyIdentityKey"
        >
          {{ copied ? "Copied ✓" : "Copy" }}
        </button>
      </div>

      <p v-else-if="identityError" class="text-xs text-amber-400">
        {{ identityError }}
      </p>
      <p v-else class="text-xs text-gray-500">Deriving…</p>
    </div>

    <!-- Debug info -->
    <div class="mt-8 rounded border border-gray-800 bg-gray-900 p-4">
      <p class="mb-2 text-sm font-semibold text-gray-400">Debug Info</p>
      <div class="space-y-1 font-mono text-xs text-gray-500">
        <p>Version: 26.5.11</p>
        <p>Platform: Web</p>
        <p>Adapter: {{ usingDefault ? "Default" : "Custom" }}</p>
        <p>Fork Target: 2026-08-21 15:00Z</p>
        <p>Fork Block: ~964,000</p>
        <p>Sidechains: Thunder · zSide · BitNames · BitAssets · Photon · Truthcoin · CoinShift</p>
        <p>BIPs: 300, 301</p>
      </div>
    </div>
  </div>
</template>
