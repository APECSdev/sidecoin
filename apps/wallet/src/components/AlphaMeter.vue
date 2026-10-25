<!-- apps/wallet/src/components/AlphaMeter.vue -->
<!--
  Alpha balance meter (Duolingo Energy pattern), ported 1:1 from
  apps/mobile/src/components/AlphaMeter.tsx.

  Renders a compact pill — a colored gauge + the integer balance — for
  metered (free-tier) users, and NOTHING for unlimited plans (pro / founder
  / diamond): the paid tier removes the meter.

  Clicking the pill opens an explainer modal: current balance, regen ETA,
  the drain/regen rules, the earn-back grant list, and an unlimited-PRO
  note. Unlike the mobile sheet (plain text only, app-store policy), the
  web wallet MAY link sidecoin.app/pro directly — the no-link rule is
  mobile-appstore-only (infra/entitlements/HANDOFF-sidecoin-api.md §6).
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import {
  ALPHA_CAP,
  ALPHA_GRANTS,
  ALPHA_TICK_MS,
  alphaBalanceWarning,
  alphaRegenEtaMinutes,
  formatAlphaBalance,
  isAlphaMetered,
  tickAlpha,
  useAlpha,
} from "../alpha";
import { useEntitlements } from "../entitlements";

const entitlements = useEntitlements();
const state = useAlpha();
const explainerOpen = ref(false);

// The engine settles lazily (on reads) and reads deliberately do not emit,
// so without a ticker the pill would show a stale number until some action
// emits. Tick while mounted so the gauge visibly drains on a PRO screen
// and refills while idle.
let interval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  interval = setInterval(() => {
    tickAlpha(); // settle + persist + emit; the ref re-renders
  }, ALPHA_TICK_MS);
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  if (interval !== null) clearInterval(interval);
  window.removeEventListener("keydown", handleKeydown);
});

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") explainerOpen.value = false;
}

const metered = computed(() => isAlphaMetered(entitlements.value));

const balance = computed(() => Math.max(0, Math.floor(state.value.balance)));
const fill = computed(() => Math.max(0, Math.min(1, state.value.balance / ALPHA_CAP)));
const color = computed(() => {
  const warning = alphaBalanceWarning(state.value.balance);
  if (warning === "critical") return "#ef4444";
  if (warning === "low") return "#f59e0b";
  return "#22c55e";
});
const eta = computed(() => alphaRegenEtaMinutes());
const draining = computed(() => state.value.session != null);

const statusLabel = computed(() => {
  if (draining.value) return "Draining — you are using PRO features.";
  if (eta.value != null) return `Replenishing — full in ${formatEta(eta.value)}.`;
  return "Full.";
});

function formatEta(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
</script>

<template>
  <div v-if="metered" class="inline-flex">
    <button
      type="button"
      data-test="alpha-meter"
      :aria-label="`Alpha balance ${balance} of ${ALPHA_CAP}`"
      class="mr-3 flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-900 px-2.5 py-1 transition-opacity hover:opacity-80"
      @click="explainerOpen = true"
    >
      <span class="h-1.5 w-7 overflow-hidden rounded-full bg-gray-800">
        <span
          class="block h-1.5 rounded-full"
          :style="{ width: `${Math.round(fill * 100)}%`, backgroundColor: color }"
        />
      </span>
      <span class="text-xs font-bold tabular-nums" :style="{ color }">
        {{ formatAlphaBalance(state.balance) }}
      </span>
    </button>

    <Teleport to="body">
      <div
        v-if="explainerOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Alpha explainer"
        @click.self="explainerOpen = false"
      >
        <div class="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950 p-5">
          <p class="text-[11px] font-extrabold uppercase tracking-[0.2em] text-gray-500">
            Alpha
          </p>
          <p class="mt-1.5 text-3xl font-black tabular-nums text-white" data-test="alpha-explainer-balance">
            {{ formatAlphaBalance(state.balance) }} / {{ ALPHA_CAP }}
          </p>
          <p class="mt-1 text-sm text-gray-400">{{ statusLabel }}</p>

          <h3 class="mt-5 text-xs font-extrabold uppercase tracking-widest text-ecash-400">
            How it works
          </h3>
          <p class="mt-1.5 text-sm leading-6 text-gray-300">
            Alpha powers PRO features on the free tier. It drains while a PRO
            screen is open and when you run a PRO action, and replenishes
            slowly while you are not using them.
          </p>

          <h3 class="mt-5 text-xs font-extrabold uppercase tracking-widest text-ecash-400">
            Earn more
          </h3>
          <div
            v-for="grant in ALPHA_GRANTS"
            :key="grant.id"
            class="mt-1.5 flex items-center justify-between"
          >
            <p class="text-sm text-gray-300">+{{ grant.amount }} — {{ grant.description }}</p>
            <p v-if="state.claimedGrants.includes(grant.id)" class="text-xs italic text-gray-600">
              claimed
            </p>
          </div>

          <p class="mt-5 text-xs leading-5 text-gray-500">
            Sidecoin PRO subscribers get unlimited Alpha — PRO features never
            drain. Upgrade at
            <a
              href="https://sidecoin.app/pro"
              target="_blank"
              rel="noreferrer"
              class="font-bold text-ecash-400 underline"
            >sidecoin.app/pro</a>,
            then activate your key under Settings → Sidecoin PRO.
          </p>

          <button
            type="button"
            class="mt-5 w-full rounded-lg border border-gray-700 px-3 py-2 text-sm font-bold text-gray-300 hover:bg-gray-900"
            @click="explainerOpen = false"
          >
            Close
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
