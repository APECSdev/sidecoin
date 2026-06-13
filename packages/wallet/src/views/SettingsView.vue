<!-- packages/wallet/src/views/SettingsView.vue -->

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getApiBaseUrl, setApiBaseUrl } from "../api";
import { DEFAULT_BASE_URL } from "@sidecoin/api-client";
import { loadWallet } from "../keystore";
import { deriveNostrIdentityKey } from "@sidecoin/shared";
import { isDemoModeEnabled, setDemoMode } from "../demo";
import {
  WALLET_THEMES,
  getWalletTheme,
  setWalletTheme,
} from "../theme";
import type { WalletTheme } from "../theme";

const nodeUrl = ref("");
const electrumUrl = ref("tcp://127.0.0.1:50001");
const saved = ref(false);
const usingDefault = ref(true);
const demoMode = ref(false);
const selectedTheme = ref<WalletTheme>("default");
const showDemoModeExplainer = ref(false);

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
  demoMode.value = isDemoModeEnabled();
  selectedTheme.value = getWalletTheme();

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

function handleDemoModeChange() {
  setDemoMode(demoMode.value);

  if (demoMode.value) {
    showDemoModeExplainer.value = true;
  }
}

function handleThemeChange(theme: WalletTheme) {
  selectedTheme.value = theme;
  setWalletTheme(theme);
}

function closeDemoModeExplainer() {
  showDemoModeExplainer.value = false;
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

    <!-- Appearance settings are display-only. They must never affect wallet
         logic, signing, balances, swaps, coin splitting, or broadcast. -->
    <section class="mt-8 max-w-3xl rounded border border-gray-800 bg-gray-900 p-4">
      <p class="text-sm font-semibold text-gray-300">Appearance</p>
      <h3 class="mt-2 text-lg font-black text-white">Theme</h3>
      <p class="mt-2 text-xs leading-5 text-gray-500">
        Choose the visual style that best fits your wallet experience.
      </p>

      <div class="mt-4 grid gap-3 md:grid-cols-3">
        <button
          v-for="theme in WALLET_THEMES"
          :key="theme.id"
          type="button"
          class="rounded-xl border p-4 text-left transition-colors"
          :class="selectedTheme === theme.id ? 'border-ecash-500 bg-ecash-950/60' : 'border-gray-800 bg-gray-950 hover:border-gray-700'"
          :aria-pressed="selectedTheme === theme.id"
          @click="handleThemeChange(theme.id)"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="font-black text-white">{{ theme.label }}</p>
            <span
              v-if="selectedTheme === theme.id"
              class="rounded-full bg-ecash-500 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-gray-950"
            >
              Active
            </span>
          </div>
          <p class="mt-2 text-xs leading-5 text-gray-500">
            {{ theme.description }}
          </p>
        </button>
      </div>
    </section>

    <!-- Demo Mode is display-only. It must never affect signing, sending,
         swapping, splitting, settlement, or broadcast. -->
    <section
      class="mt-8 max-w-lg rounded border p-4 transition-colors"
      :class="demoMode ? 'border-ecash-700 bg-ecash-950/40' : 'border-gray-800 bg-gray-900'"
      data-test="demo-mode-settings-card"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p
            class="text-sm font-semibold"
            :class="demoMode ? 'text-ecash-400' : 'text-gray-300'"
          >
            Experience
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-black text-white">Demo Mode</h3>
            <span
              v-if="demoMode"
              class="rounded-full bg-ecash-500 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-gray-950"
            >
              Active
            </span>
          </div>
          <p class="mt-2 text-xs leading-5 text-gray-500">
            Explore Sidecoin with sample balances, platform activity, and PRO
            previews. Demo Mode changes display data only.
          </p>
          <p v-if="demoMode" class="mt-3 text-xs font-semibold text-ecash-400">
            Sample balances and platform activity are enabled.
          </p>
          <button
            v-if="demoMode"
            type="button"
            class="mt-3 rounded border border-ecash-700 px-3 py-2 text-xs font-bold text-ecash-400 hover:bg-ecash-900/40"
            @click="showDemoModeExplainer = true"
          >
            What changes in Demo Mode?
          </button>
        </div>

        <label class="relative inline-flex cursor-pointer items-center">
          <input
            v-model="demoMode"
            type="checkbox"
            class="peer sr-only"
            aria-label="Demo Mode"
            @change="handleDemoModeChange"
          />
          <span class="h-6 w-11 rounded-full bg-gray-700 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-ecash-600 peer-checked:after:translate-x-5"></span>
        </label>
      </div>
    </section>

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

    <!-- Debug info hidden by default for a cleaner user-facing settings page. -->
    <details class="mt-8 rounded border border-gray-800 bg-gray-900 p-4">
      <summary class="cursor-pointer select-none text-sm font-semibold text-gray-400 hover:text-white">
        Show Debug Info
      </summary>

      <div class="mt-4 space-y-1 border-t border-gray-800 pt-4 font-mono text-xs text-gray-500">
        <p>Version: 26.5.11</p>
        <p>Product: Drivechains Financial Hub</p>
        <p>Platform: Web</p>
        <p>Adapter: {{ usingDefault ? "Default" : "Custom" }}</p>
        <p>Fork Target: 2026-08-21 15:00Z</p>
        <p>Fork Block: ~964,000</p>
        <p>Platforms: Thunder · zSide · BitNames · BitAssets · Photon · Truthcoin · CoinShift</p>
        <p>BIPs: 300, 301</p>
      </div>
    </details>

    <!-- Demo Mode explainer. Display-only: this modal explains UI scope only.
         It must never trigger signing, sending, swaps, splitting, settlement,
         entitlement changes, hardware calls, or broadcast. -->
    <div
      v-if="showDemoModeExplainer"
      class="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-mode-explainer-title"
      data-test="demo-mode-explainer-modal"
    >
      <div class="w-full max-w-3xl rounded-2xl border border-ecash-700 bg-gray-900 shadow-2xl">
        <div class="border-b border-gray-800 p-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <span class="inline-flex rounded-full bg-ecash-500 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-gray-950">
                Demo Mode
              </span>
              <h3
                id="demo-mode-explainer-title"
                class="mt-4 text-2xl font-black text-white"
              >
                Demo Mode is now active
              </h3>
              <p class="mt-3 max-w-2xl text-sm leading-6 text-gray-300">
                You can explore Sidecoin with sample balances, platform
                activity, and PRO previews across the Drivechains Financial Hub.
              </p>
            </div>

            <button
              type="button"
              class="rounded-lg border border-gray-700 px-3 py-2 text-sm font-bold text-gray-300 hover:bg-gray-800 hover:text-white"
              aria-label="Close Demo Mode explanation"
              @click="closeDemoModeExplainer"
            >
              Close
            </button>
          </div>
        </div>

        <div class="grid gap-4 p-6 lg:grid-cols-2">
          <section class="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <h4 class="font-black text-ecash-400">What Demo Mode changes</h4>
            <ul class="mt-4 space-y-3 text-sm text-gray-300">
              <li class="flex gap-3">
                <span class="text-ecash-400">✓</span>
                <span>Dashboard balances and platform activity use sample data.</span>
              </li>
              <li class="flex gap-3">
                <span class="text-ecash-400">✓</span>
                <span>Platform portfolio cards show screenshot-ready activity.</span>
              </li>
              <li class="flex gap-3">
                <span class="text-ecash-400">✓</span>
                <span>PRO previews stay visible so you can explore the full hub.</span>
              </li>
              <li class="flex gap-3">
                <span class="text-ecash-400">✓</span>
                <span>The sidebar and Dashboard clearly show Demo Mode is enabled.</span>
              </li>
            </ul>
          </section>

          <section class="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <h4 class="font-black text-amber-400">What Demo Mode never changes</h4>
            <ul class="mt-4 space-y-3 text-sm text-gray-300">
              <li class="flex gap-3">
                <span class="text-amber-400">✓</span>
                <span>Your wallet keys, seed phrase, and identity key are unchanged.</span>
              </li>
              <li class="flex gap-3">
                <span class="text-amber-400">✓</span>
                <span>Send, receive, swap, split, signing, and broadcast logic are unchanged.</span>
              </li>
              <li class="flex gap-3">
                <span class="text-amber-400">✓</span>
                <span>Hardware wallet operations are not simulated or bypassed.</span>
              </li>
              <li class="flex gap-3">
                <span class="text-amber-400">✓</span>
                <span>Entitlements, PRO checks, and wallet security rules stay intact.</span>
              </li>
            </ul>
          </section>
        </div>

        <div class="flex flex-col gap-3 border-t border-gray-800 p-6 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs leading-5 text-gray-500">
            Demo Mode is a display-only experience for exploring Sidecoin before
            connecting live activity.
          </p>

          <div class="flex flex-wrap gap-3">
            <a
              href="#/"
              class="rounded-lg bg-ecash-600 px-4 py-2 text-sm font-black text-white hover:bg-ecash-500"
              @click="closeDemoModeExplainer"
            >
              Explore Dashboard
            </a>
            <button
              type="button"
              class="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
              @click="closeDemoModeExplainer"
            >
              Keep browsing
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
