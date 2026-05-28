<!-- packages/desktop/src/App.vue -->

<script setup lang="ts">
import { RouterView } from "vue-router";
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <!-- Navigation sidebar -->
    <nav class="fixed left-0 top-0 h-full w-56 border-r border-gray-800 bg-gray-950 p-4">
      <div class="mb-8">
        <h1 class="text-xl font-bold text-ecash-400">Sidecoin</h1>
        <p class="text-xs text-gray-500">eCash Drivechains Wallet</p>
      </div>

      <ul class="space-y-1">
        <li>
          <router-link
            to="/"
            class="block rounded px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
            active-class="bg-gray-800 text-white"
          >
            Dashboard
          </router-link>
        </li>
        <li>
          <router-link
            to="/send"
            class="block rounded px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
            active-class="bg-gray-800 text-white"
          >
            Send
          </router-link>
        </li>
        <li>
          <router-link
            to="/receive"
            class="block rounded px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
            active-class="bg-gray-800 text-white"
          >
            Receive
          </router-link>
        </li>
        <li>
          <router-link
            to="/sidechains"
            class="block rounded px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
            active-class="bg-gray-800 text-white"
          >
            Sidechains
          </router-link>
        </li>
        <li>
          <router-link
            to="/settings"
            class="block rounded px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
            active-class="bg-gray-800 text-white"
          >
            Settings
          </router-link>
        </li>
      </ul>

      <div class="absolute bottom-4 left-4 right-4">
        <div class="rounded bg-gray-900 p-3 text-xs text-gray-500">
          <p>eCash Hard Fork</p>
          <p class="mt-1 font-mono text-ecash-400">2026-08-21 15:00Z</p>
          <p class="text-gray-600">block ~964,000</p>
        </div>
      </div>
    </nav>

    <!-- Main content area -->
    <main class="ml-56 min-h-screen p-6">
      <RouterView />
    </main>
  </div>
</template>
