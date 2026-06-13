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
        Upgrade for all platforms, historical analysis, hardware signing, and early access.
      </p>
      <router-link
        to="/pro"
        class="mt-3 inline-flex rounded bg-amber-500 px-3 py-2 font-black text-gray-950 hover:bg-amber-400"
      >
        Upgrade to PRO
      </router-link>
    </div>
  </div>
</template>
