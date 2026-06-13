<!-- packages/wallet/src/App.vue -->

<script setup lang="ts">
import { RouterView } from "vue-router";
import InstallWallet from "./components/InstallWallet.vue";
import ProStatusCard from "./components/pro/ProStatusCard.vue";

const links = [
  { to: "/", label: "Home" },
  { to: "/send", label: "Send" },
  { to: "/receive", label: "Receive" },
  { to: "/swap", label: "Swap" },
  { to: "/platforms", label: "Platforms" },
  { to: "/hardware", label: "Hardware" },
  { to: "/toolbox", label: "Tools" },
  { to: "/pro", label: "PRO" },
  { to: "/settings", label: "Settings" },
];
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
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
      <span class="font-mono text-[10px] text-ecash-400">2026·08·21</span>
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
