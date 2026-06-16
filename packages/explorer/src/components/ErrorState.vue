<!-- packages/explorer/src/components/ErrorState.vue -->

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    message?: string;
  }>(),
  {
    title: "Explorer data unavailable",
    message: "Unable to load this explorer view.",
  },
);
</script>

<template>
  <section class="rounded-2xl border border-red-900/70 bg-red-950/30 p-6">
    <p class="text-sm font-black uppercase tracking-[0.22em] text-red-300">
      SidΞcoin Explorer
    </p>
    <h1 class="mt-3 text-2xl font-black text-red-100">{{ title }}</h1>
    <p class="mt-2 text-red-100/80">{{ message }}</p>
  </section>
</template>
