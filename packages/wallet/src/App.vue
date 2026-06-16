<!-- packages/wallet/src/App.vue -->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterView } from "vue-router";
import InstallWallet from "./components/InstallWallet.vue";
import ProStatusCard from "./components/pro/ProStatusCard.vue";
import { DEMO_MODE_EVENT, isDemoModeEnabled } from "./demo";
import {
  THEME_EVENT,
  getWalletTheme,
  walletThemeClass,
} from "./theme";

const links = [
  { to: "/", label: "Home" },
  { to: "/send", label: "Send" },
  { to: "/receive", label: "Receive" },
  { to: "/swap", label: "Swap" },
  { to: "/platforms", label: "Platforms" },
  { to: "/hardware", label: "Hardware" },
  { to: "/toolbox", label: "Tools" },
  { to: "/settings", label: "Settings" },
];

const demoMode = ref(isDemoModeEnabled());
const walletTheme = ref(getWalletTheme());

const themeClass = computed(() => walletThemeClass(walletTheme.value));

function handleDemoModeChanged() {
  demoMode.value = isDemoModeEnabled();
}

function handleThemeChanged() {
  walletTheme.value = getWalletTheme();
}

onMounted(() => {
  demoMode.value = isDemoModeEnabled();
  walletTheme.value = getWalletTheme();
  window.addEventListener(DEMO_MODE_EVENT, handleDemoModeChanged);
  window.addEventListener(THEME_EVENT, handleThemeChanged);
});

onBeforeUnmount(() => {
  window.removeEventListener(DEMO_MODE_EVENT, handleDemoModeChanged);
  window.removeEventListener(THEME_EVENT, handleThemeChanged);
});
</script>

<template>
  <div :class="themeClass" class="min-h-screen bg-gray-950 text-white">
    <!-- Mobile top bar -->
    <header
      class="sticky top-0 z-20 flex items-center justify-between border-b border-gray-800 bg-gray-950/95 px-4 py-3 backdrop-blur md:hidden"
    >
      <div>
        <h1 class="text-lg font-bold text-ecash-400">
          <span aria-hidden="true">SidΞcoin</span>
          <span class="sr-only">Sidecoin</span>
        </h1>
        <p class="text-[10px] uppercase tracking-wider text-gray-600">
          Drivechains Financial Hub
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span
          v-if="demoMode"
          class="rounded-full border border-ecash-700 bg-ecash-950/70 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-ecash-400"
        >
          Demo
        </span>
        <span class="font-mono text-[10px] text-ecash-400">2026·08·21</span>
      </div>
    </header>

    <!-- Desktop sidebar -->
    <nav
      class="fixed left-0 top-0 hidden h-full w-56 flex-col border-r border-gray-800 bg-gray-950 p-4 md:flex"
    >
      <div class="mb-8">
        <h1 class="text-xl font-bold text-ecash-400">
          <span aria-hidden="true">SidΞcoin</span>
          <span class="sr-only">Sidecoin</span>
        </h1>
        <p class="text-xs text-gray-500">Drivechains Financial Hub</p>
      </div>

      <ul class="space-y-1">
        <li v-for="l in links" :key="l.to">
          <router-link
            :to="l.to"
            class="block rounded px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
            active-class="bg-gray-800 text-white"
          >
            {{ l.label }}
          </router-link>
        </li>
      </ul>

      <div class="mt-auto space-y-3">
        <div
          v-if="demoMode"
          class="rounded-xl border border-ecash-700 bg-ecash-950/40 p-3 text-xs"
          data-test="demo-mode-sidebar-card"
        >
          <p class="font-black text-ecash-400">Demo Mode</p>
          <p class="mt-1 text-gray-400">
            Sample balances and platform activity enabled.
          </p>
          <router-link
            to="/settings"
            class="mt-3 inline-flex rounded border border-ecash-700 px-3 py-2 font-bold text-ecash-400 hover:bg-ecash-900/40"
          >
            Manage demo
          </router-link>
        </div>

        <ProStatusCard />

        <div class="rounded bg-gray-900 p-3 text-xs text-gray-500">
          <p>eCash Hard Fork</p>
          <p class="mt-1 font-mono text-ecash-400">2026-08-21 15:00Z</p>
          <p class="text-gray-600">block ~964,000</p>
        </div>
      </div>
    </nav>

    <!-- Main content -->
    <main class="min-h-screen p-4 pb-24 md:ml-56 md:p-6 md:pb-6">
      <RouterView />
    </main>

    <!-- Mobile bottom tab bar -->
    <nav
      class="fixed bottom-0 left-0 right-0 z-20 flex h-16 overflow-x-auto border-t border-gray-800 bg-gray-950/95 backdrop-blur md:hidden"
      aria-label="Wallet navigation"
    >
      <router-link
        v-for="l in links"
        :key="l.to"
        :to="l.to"
        class="flex h-full min-w-20 flex-col items-center justify-center gap-1 px-2 text-xs font-medium text-gray-400 transition-colors hover:text-gray-200 active:bg-gray-800/60"
        active-class="text-ecash-400"
      >
        {{ l.label }}
      </router-link>
    </nav>

    <!-- Install-the-wallet prompt (mobile) -->
    <InstallWallet />
  </div>
</template>
