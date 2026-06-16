<!-- packages/explorer/src/components/LoadingState.vue -->

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    message?: string;
  }>(),
  {
    title: "Loading explorer data",
    message: "Fetching the latest chain view.",
  },
);
</script>

<template>
  <section class="rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
    <div class="flex items-center gap-4">
      <div
        class="h-4 w-4 animate-pulse rounded-full bg-yellow-300 shadow-lg shadow-yellow-300/30"
        aria-hidden="true"
      />
      <div>
        <p class="font-black text-white">{{ title }}</p>
        <p class="mt-1 text-sm text-gray-400">{{ message }}</p>
      </div>
    </div>
  </section>
</template>
