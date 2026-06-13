<!-- packages/wallet/src/views/PlatformDetailView.vue -->

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useRoute } from "vue-router";
import { getPlatformById } from "../data/platforms";
import { canAccessPlatform, isProPlatform } from "../entitlements";
import ProBadge from "../components/pro/ProBadge.vue";
import ProGate from "../components/pro/ProGate.vue";

const route = useRoute();
const selectedTabId = ref("");

const platform = computed(() => {
  const id = String(route.params.platformId ?? "");
  return getPlatformById(id);
});

const locked = computed(() => {
  return platform.value ? !canAccessPlatform(platform.value.id) : false;
});

watchEffect(() => {
  const tabs = platform.value?.featureTabs ?? [];
  if (!tabs.length) {
    selectedTabId.value = "";
    return;
  }

  if (!tabs.some((tab) => tab.id === selectedTabId.value)) {
    selectedTabId.value = tabs[0].id;
  }
});

const selectedTab = computed(() => {
  return platform.value?.featureTabs.find((tab) => tab.id === selectedTabId.value);
});

const proBenefits = computed(() => [
  `Unlock ${platform.value?.displayName ?? "this platform"} workflows`,
  "Historical analysis across platforms",
  "Hardware signing workflows",
  "Early access to proposed platforms like RISCy",
]);
</script>

<template>
  <div v-if="!platform" class="mx-auto max-w-2xl">
    <router-link to="/platforms" class="text-sm text-ecash-400 hover:text-ecash-300">
      ← Back to Platforms
    </router-link>

    <div class="mt-6 rounded-xl border border-red-800 bg-red-950/30 p-6">
      <h2 class="text-2xl font-bold text-red-300">Platform not found</h2>
      <p class="mt-2 text-sm text-red-200/80">
        This platform route does not exist.
      </p>
    </div>
  </div>

  <div v-else>
    <router-link to="/platforms" class="text-sm text-ecash-400 hover:text-ecash-300">
      ← Back to Platforms
    </router-link>

    <section class="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="text-xs uppercase tracking-widest text-ecash-500">
            Platform · Slot {{ platform.slot }}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <h2 class="text-3xl font-extrabold text-white">
              {{ platform.displayName }}
            </h2>
            <ProBadge v-if="isProPlatform(platform.id)" />
          </div>
          <p class="mt-2 max-w-2xl text-gray-400">
            {{ platform.tagline }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold"
            :class="platform.status === 'active' ? 'bg-ecash-900 text-ecash-400' : 'bg-gray-800 text-gray-400'"
          >
            {{ platform.status === "active" ? "Active" : "Proposed" }}
          </span>
          <span class="rounded-full bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300">
            {{ platform.primaryUseCase }}
          </span>
        </div>
      </div>

      <p class="mt-6 max-w-3xl text-sm leading-6 text-gray-300">
        {{ platform.description }}
      </p>
    </section>

    <ProGate
      v-if="locked"
      class="mt-6"
      :title="`Unlock ${platform.displayName} with Sidecoin PRO`"
      :description="`${platform.displayName} is part of the complete Drivechains Financial Hub. Upgrade to access premium platform workflows, analytics, and early platform features.`"
      :benefits="proBenefits"
      cta="Unlock with PRO"
    />

    <section
      v-else
      class="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4"
    >
      <div class="overflow-x-auto">
        <div class="flex min-w-max gap-2 border-b border-gray-800 pb-3">
          <button
            v-for="tab in platform.featureTabs"
            :key="tab.id"
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            :class="selectedTabId === tab.id ? 'bg-ecash-600 text-white' : 'bg-gray-950 text-gray-400 hover:bg-gray-800 hover:text-white'"
            @click="selectedTabId = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div v-if="selectedTab" class="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div>
          <h3 class="text-xl font-bold text-white">{{ selectedTab.title }}</h3>
          <p class="mt-3 text-sm leading-6 text-gray-400">
            {{ selectedTab.body }}
          </p>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p class="mb-3 text-xs uppercase tracking-widest text-gray-500">
            Features
          </p>
          <ul class="space-y-2">
            <li
              v-for="item in selectedTab.bullets"
              :key="item"
              class="flex gap-2 text-sm text-gray-300"
            >
              <span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-ecash-500"></span>
              <span>{{ item }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
