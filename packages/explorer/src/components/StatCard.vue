<!-- packages/explorer/src/components/StatCard.vue -->

<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  note?: string;
}>();
</script>

<template>
  <article class="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
    <p class="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
      {{ label }}
    </p>
    <p class="mt-2 break-all font-mono text-xl font-black text-white">
      {{ value }}
    </p>
    <p v-if="note" class="mt-1 text-xs text-gray-500">
      {{ note }}
    </p>
  </article>
</template>
