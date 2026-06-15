<!-- packages/explorer/src/App.vue -->

<script setup lang="ts">
import { RouterView } from "vue-router";
import ExplorerHeader from "./components/ExplorerHeader.vue";
</script>

<template>
  <div class="min-h-screen bg-transparent text-white">
    <ExplorerHeader />

    <main class="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <RouterView />
    </main>
  </div>
</template>
