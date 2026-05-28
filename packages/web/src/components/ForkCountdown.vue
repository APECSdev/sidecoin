<!-- packages/web/src/components/ForkCountdown.vue -->

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const FORK_DATE = new Date("2026-08-21T15:00:00Z").getTime();

const days = ref(0);
const hours = ref(0);
const minutes = ref(0);
const seconds = ref(0);
const isPast = ref(false);

let timer: ReturnType<typeof setInterval> | null = null;

function update() {
  const now = Date.now();
  const diff = FORK_DATE - now;

  if (diff <= 0) {
    isPast.value = true;
    days.value = 0;
    hours.value = 0;
    minutes.value = 0;
    seconds.value = 0;
    if (timer) clearInterval(timer);
    return;
  }

  isPast.value = false;
  const absDiff = Math.abs(diff);
  days.value = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  hours.value = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  minutes.value = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
  seconds.value = Math.floor((absDiff % (1000 * 60)) / 1000);
}

onMounted(() => {
  update();
  timer = setInterval(update, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
</script>

<template>
  <div class="text-center">
    <!-- Pre-fork countdown -->
    <div v-if="!isPast">
      <p class="mb-4 text-sm uppercase tracking-widest text-gray-400">
        eCash Hard Fork Countdown
      </p>
      <div class="flex items-center justify-center gap-4 font-mono text-5xl font-bold text-ecash-400 md:text-7xl">
        <div class="flex flex-col items-center">
          <span>{{ days }}</span>
          <span class="mt-1 text-xs font-normal uppercase tracking-wider text-gray-500">Days</span>
        </div>
        <span class="text-gray-600">:</span>
        <div class="flex flex-col items-center">
          <span>{{ pad(hours) }}</span>
          <span class="mt-1 text-xs font-normal uppercase tracking-wider text-gray-500">Hours</span>
        </div>
        <span class="text-gray-600">:</span>
        <div class="flex flex-col items-center">
          <span>{{ pad(minutes) }}</span>
          <span class="mt-1 text-xs font-normal uppercase tracking-wider text-gray-500">Min</span>
        </div>
        <span class="text-gray-600">:</span>
        <div class="flex flex-col items-center">
          <span>{{ pad(seconds) }}</span>
          <span class="mt-1 text-xs font-normal uppercase tracking-wider text-gray-500">Sec</span>
        </div>
      </div>
      <p class="mt-4 font-mono text-sm text-gray-500">
        2026-08-21 15:00 UTC · Block ~964,000
      </p>
    </div>

    <!-- Post-fork -->
    <div v-else>
      <p class="text-2xl font-bold text-ecash-400">
        eCash Hard Fork is LIVE 🚀
      </p>
      <p class="mt-2 text-sm text-gray-400">
        BIP-300 / BIP-301 Drivechains · 8 sidechains active
      </p>
    </div>
  </div>
</template>
