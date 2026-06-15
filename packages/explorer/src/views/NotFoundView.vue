<!-- packages/explorer/src/views/NotFoundView.vue -->

<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <section class="rounded-3xl border border-gray-800 bg-gray-900/70 p-8">
    <p class="text-sm font-black uppercase tracking-[0.22em] text-yellow-300">
      SidΞcoin Explorer
    </p>
    <h1 class="mt-3 text-4xl font-black text-white">Page not found</h1>
    <p class="mt-3 max-w-2xl text-gray-400">
      This explorer route does not exist. Open a chain dashboard to search by
      block, transaction, or address.
    </p>
    <RouterLink
      to="/"
      class="mt-6 inline-flex rounded-xl bg-yellow-400 px-5 py-3 text-sm font-black text-gray-950 hover:bg-yellow-300"
    >
      Open Explorer Home
    </RouterLink>
  </section>
</template>
