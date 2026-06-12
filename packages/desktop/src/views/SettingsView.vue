<!-- packages/desktop/src/views/SettingsView.vue -->

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { loadWallet } from "@sidecoin/wallet";
import { deriveNostrIdentityKey } from "@sidecoin/shared";

const nodeUrl = ref("http://127.0.0.1:8332");
const electrumUrl = ref("tcp://127.0.0.1:50001");
const saved = ref(false);

// ─── Founder Identity Key (NIP-06 Nostr key) ────────────────
// Derived locally from the wallet mnemonic at m/44'/1237'/0'/0/0. This is the
// canonical Founder identity: the user copies it here and pastes it at
// sidecoin.app/pro. Only the PUBLIC key is ever shown — the private half never
// leaves this derivation call.
const identityKey = ref<string | null>(null);
const identityError = ref<string | null>(null);
const copied = ref(false);

onMounted(() => {
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
        <p>Fork Target: 2026-08-21 15:00Z</p>
        <p>Fork Block: ~964,000</p>
        <p>Sidechains: Thunder · zSide · BitNames · BitAssets · Photon · Truthcoin · CoinShift</p>
        <p>BIPs: 300, 301</p>
      </div>
    </div>
  </div>
</template>
