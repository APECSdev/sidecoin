<!-- packages/explorer/src/components/ComingSoonCta.vue -->

<script setup lang="ts">
defineProps<{
  chainName: string;
}>();

const proHref =
  "https://sidecoin.app/pro?utm_source=explorer&utm_medium=coming_soon&utm_campaign=founder_cta";

const foundersHref =
  "https://sidecoin.app/founders?utm_source=explorer&utm_medium=coming_soon&utm_campaign=founder_cta";
</script>

<template>
  <section class="rounded-3xl border border-blue-900/70 bg-blue-950/30 p-6">
    <p class="text-sm font-black uppercase tracking-[0.22em] text-blue-300">
      Not indexed yet
    </p>
    <h2 class="mt-3 text-2xl font-black text-blue-100">Coming soon</h2>
    <p class="mt-2 max-w-3xl text-sm leading-6 text-blue-100/80">
      This explorer view is not indexed yet. SidΞcoin only shows live chain
      data. Until SupaQt indexing is connected for this network, blocks,
      transactions, addresses, balances, deposits, and withdrawals will
      remain empty.
    </p>

    <div class="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
      <p class="text-sm font-black uppercase tracking-[0.18em] text-yellow-200">
        Founder access
      </p>
      <h3 class="mt-2 text-xl font-black text-white">
        Want early access when {{ chainName }} comes online?
      </h3>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-yellow-50/80">
        Sidecoin Pro is the path to reduced fees, advanced features, and
        Founding Member access. The Founder Leaderboard tracks who joined
        early, and the top 10% of Founding Members at Drivechain activation
        become the Alpha Circle.
      </p>

      <div class="mt-4 flex flex-col gap-3 sm:flex-row">
        <a
          :href="proHref"
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center justify-center rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-gray-950 transition hover:bg-yellow-200"
        >
          Become a Founding Member
        </a>
        <a
          :href="foundersHref"
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center justify-center rounded-2xl border border-yellow-300/40 px-5 py-3 text-sm font-black text-yellow-100 transition hover:border-yellow-200 hover:bg-yellow-300/10"
        >
          View Founder Leaderboard
        </a>
      </div>

      <p class="mt-3 text-xs leading-5 text-yellow-100/70">
        Yearly PRO is the Founder path. Monthly PRO unlocks product features
        without Founder Leaderboard placement.
      </p>
    </div>
  </section>
</template>
