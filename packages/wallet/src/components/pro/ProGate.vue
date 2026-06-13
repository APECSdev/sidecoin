<!-- packages/wallet/src/components/pro/ProGate.vue -->

<script setup lang="ts">
import ProBadge from "./ProBadge.vue";

defineProps<{
  title: string;
  description: string;
  benefits: string[];
  cta?: string;
}>();
</script>

<template>
  <section class="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-950/30 via-gray-900 to-gray-950 p-6 shadow-xl shadow-black/20">
    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <ProBadge />
        <h3 class="mt-4 text-2xl font-extrabold text-white">{{ title }}</h3>
        <p class="mt-3 max-w-2xl text-sm leading-6 text-gray-300">
          {{ description }}
        </p>
      </div>
    </div>

    <div class="mt-6 grid gap-3 sm:grid-cols-2">
      <div
        v-for="benefit in benefits"
        :key="benefit"
        class="rounded-xl border border-gray-800 bg-gray-950/70 p-3 text-sm text-gray-300"
      >
        <span class="mr-2 text-amber-400">✓</span>{{ benefit }}
      </div>
    </div>

    <div class="mt-6 flex flex-wrap gap-3">
      <a
        href="#/pro"
        class="rounded-lg bg-amber-500 px-5 py-3 text-sm font-black text-gray-950 transition-colors hover:bg-amber-400"
      >
        {{ cta ?? "Upgrade to PRO" }}
      </a>
      <a
        href="#/pro"
        class="rounded-lg border border-gray-700 bg-gray-900 px-5 py-3 text-sm font-semibold text-gray-200 transition-colors hover:border-amber-500 hover:text-white"
      >
        View PRO benefits
      </a>
    </div>
  </section>
</template>
