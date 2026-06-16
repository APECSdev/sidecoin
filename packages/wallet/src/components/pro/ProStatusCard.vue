<!-- packages/wallet/src/components/pro/ProStatusCard.vue -->

<script setup lang="ts">
import { CURRENT_ENTITLEMENTS, isProPlan } from "../../entitlements";

const pro = isProPlan(CURRENT_ENTITLEMENTS);
</script>

<template>
  <div class="rounded-xl border border-gray-800 bg-gray-900 p-3 text-xs">
    <div v-if="pro">
      <p class="font-bold text-amber-400">Sidecoin PRO</p>
      <p class="mt-1 text-gray-500">All platforms unlocked.</p>
    </div>

    <div v-else>
      <p class="font-bold text-white">Sidecoin Basic</p>
      <p class="mt-1 text-gray-500">
        Core wallet tools are ready. Advanced platform workflows unlock from
        deeper product areas.
      </p>
      <router-link
        to="/pro"
        class="mt-3 inline-flex rounded border border-amber-500/60 px-3 py-2 font-bold text-amber-400 hover:bg-amber-500 hover:text-gray-950"
      >
        Upgrade to PRO
      </router-link>
    </div>
  </div>
</template>
