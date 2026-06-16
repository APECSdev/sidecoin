<!-- packages/explorer/src/components/EmptyState.vue -->

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    message?: string;
  }>(),
  {
    title: "Nothing to show yet",
    message: "No explorer records are available for this view.",
  },
);
</script>

<template>
  <div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-6 text-center">
    <p class="text-lg font-black text-white">{{ title }}</p>
    <p class="mt-2 text-sm text-gray-400">{{ message }}</p>
  </div>
</template>
