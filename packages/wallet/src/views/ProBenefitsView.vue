<!-- packages/wallet/src/views/ProBenefitsView.vue -->

<script setup lang="ts">
const platformBenefits = [
  "Unlock zSide, BitAssets, Photon, Truthcoin, CoinShift, and RISCy",
  "Early access to proposed platforms like RISCy",
  "Premium platform dashboards and guided workflows",
  "Advanced platform-specific safety checks",
];

const walletBenefits = [
  "Historical portfolio analysis across platforms",
  "Advanced transaction review and wallet insights",
  "Hardware signing workflows for supported devices",
  "Priority access to new Drivechain features",
];

const basicIncludes = [
  "L1 wallet",
  "Thunder payments",
  "BitNames identity registration",
  "Swap access",
  "Coin Split Helper",
];

const proHighlights = [
  {
    title: "All Platforms",
    body:
      "Move beyond Basic access and unlock the full Drivechains Financial Hub.",
  },
  {
    title: "Historical Analysis",
    body:
      "Track activity, balances, and performance across L1 and every platform.",
  },
  {
    title: "Early Access",
    body:
      "Get first access to proposed and experimental platforms, including RISCy.",
  },
  {
    title: "Hardware Power Tools",
    body:
      "Use advanced hardware wallet workflows as signing support rolls out.",
  },
];

const founderEligibility = [
  {
    title: "Monthly PRO",
    body:
      "Unlocks Sidecoin PRO wallet features. Monthly subscriptions do not qualify for Founder Leaderboard placement or Alpha Circle eligibility.",
  },
  {
    title: "Yearly PRO",
    body:
      "Unlocks Sidecoin PRO wallet features and qualifies for Founder Leaderboard placement and Alpha Circle eligibility.",
  },
];
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <section class="rounded-3xl border border-amber-500/40 bg-gradient-to-br from-amber-950/40 via-gray-900 to-gray-950 p-8 shadow-2xl shadow-black/30">
      <p class="text-xs font-black uppercase tracking-[0.3em] text-amber-400">
        Sidecoin PRO
      </p>
      <h2 class="mt-4 text-4xl font-black tracking-tight text-white md:text-5xl">
        Unlock the full Drivechains Financial Hub
      </h2>
      <p class="mt-4 max-w-3xl text-lg leading-8 text-gray-300">
        Basic gives you L1, Thunder, BitNames, Swap, and Coin Split tools.
        PRO unlocks the complete platform experience, historical analysis,
        advanced hardware workflows, and early access to proposed platforms.
      </p>

      <div class="mt-8 flex flex-wrap gap-3">
        <a
          href="https://sidecoin.app/pro"
          target="_blank"
          rel="noopener"
          class="rounded-xl bg-amber-500 px-6 py-3 text-sm font-black text-gray-950 transition-colors hover:bg-amber-400"
        >
          Upgrade to PRO
        </a>
        <router-link
          to="/platforms"
          class="rounded-xl border border-gray-700 bg-gray-900 px-6 py-3 text-sm font-bold text-gray-200 transition-colors hover:border-amber-500 hover:text-white"
        >
          Explore platforms
        </router-link>
      </div>
    </section>

    <section class="mt-8 grid gap-4 md:grid-cols-4">
      <div
        v-for="item in proHighlights"
        :key="item.title"
        class="rounded-2xl border border-gray-800 bg-gray-900 p-5"
      >
        <h3 class="font-bold text-white">{{ item.title }}</h3>
        <p class="mt-2 text-sm leading-6 text-gray-400">{{ item.body }}</p>
      </div>
    </section>

    <section class="mt-8 rounded-2xl border border-amber-500/40 bg-amber-950/10 p-6">
      <p class="text-xs font-black uppercase tracking-[0.25em] text-amber-400">
        Founder eligibility
      </p>
      <h3 class="mt-2 text-2xl font-black text-white">
        Leaderboard and Alpha Circle require Yearly PRO
      </h3>
      <p class="mt-3 max-w-3xl text-sm leading-6 text-gray-300">
        Monthly PRO unlocks Sidecoin PRO wallet features. Yearly PRO unlocks
        those features and qualifies for Founder Leaderboard placement and Alpha
        Circle eligibility.
      </p>

      <div class="mt-5 grid gap-4 md:grid-cols-2">
        <div
          v-for="item in founderEligibility"
          :key="item.title"
          class="rounded-xl border border-gray-800 bg-gray-950 p-4"
        >
          <h4 class="font-black text-white">{{ item.title }}</h4>
          <p class="mt-2 text-sm leading-6 text-gray-400">{{ item.body }}</p>
        </div>
      </div>
    </section>

    <section class="mt-8 grid gap-6 lg:grid-cols-3">
      <div class="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h3 class="text-xl font-black text-white">Basic includes</h3>
        <ul class="mt-5 space-y-3">
          <li
            v-for="item in basicIncludes"
            :key="item"
            class="flex gap-2 text-sm text-gray-300"
          >
            <span class="text-ecash-400">✓</span>
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>

      <div class="rounded-2xl border border-amber-500/40 bg-amber-950/10 p-6">
        <h3 class="text-xl font-black text-amber-400">PRO platforms</h3>
        <ul class="mt-5 space-y-3">
          <li
            v-for="item in platformBenefits"
            :key="item"
            class="flex gap-2 text-sm text-gray-300"
          >
            <span class="text-amber-400">✓</span>
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>

      <div class="rounded-2xl border border-amber-500/40 bg-amber-950/10 p-6">
        <h3 class="text-xl font-black text-amber-400">PRO wallet tools</h3>
        <ul class="mt-5 space-y-3">
          <li
            v-for="item in walletBenefits"
            :key="item"
            class="flex gap-2 text-sm text-gray-300"
          >
            <span class="text-amber-400">✓</span>
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
