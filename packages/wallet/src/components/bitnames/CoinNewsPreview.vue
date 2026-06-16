<!-- packages/wallet/src/components/bitnames/CoinNewsPreview.vue -->

<script setup lang="ts">
import { computed } from "vue";

interface CoinNewsRow {
  feed: "US Weekly" | "Japan Weekly";
  date: string;
  fee: string;
  title: string;
}

const props = withDefaults(
  defineProps<{
    showHero?: boolean;
    showJapanFeed?: boolean;
  }>(),
  {
    showHero: true,
    showJapanFeed: true,
  },
);

const coinNewsRows: CoinNewsRow[] = [
  {
    feed: "US Weekly",
    date: "2026 Jun 15 20:00",
    fee: "0.00001108 BTC",
    title: "Posting from the new eCash.com wallet",
  },
  {
    feed: "US Weekly",
    date: "2026 Jun 15 14:20",
    fee: "0.00133700 BTC",
    title: "Introducing SidΞcoin",
  },
  {
    feed: "US Weekly",
    date: "2026 Jun 10 23:00",
    fee: "0.00000192 BTC",
    title: "If you see this message, broadcast more news",
  },
  {
    feed: "US Weekly",
    date: "2026 Jun 10 22:10",
    fee: "0.00000193 BTC",
    title: "Are fees supposed to be the only anti-spam rule?",
  },
  {
    feed: "Japan Weekly",
    date: "2026 Jun 13 09:20",
    fee: "0.00002000 BTC",
    title: "私はサトシです。このフォークを支持します。",
  },
];

const usWeeklyRows = computed(() => {
  return coinNewsRows.filter((row) => row.feed === "US Weekly");
});

const japanWeeklyRows = computed(() => {
  return coinNewsRows.filter((row) => row.feed === "Japan Weekly");
});
</script>

<template>
  <div class="space-y-6">
    <section
      v-if="props.showHero"
      class="rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-950 via-gray-950 to-gray-900 p-6"
    >
      <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs uppercase tracking-widest text-ecash-500">
              Broadcast feed
            </p>
            <span class="rounded-full border border-ecash-500/40 bg-ecash-950/60 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-ecash-300">
              Preview mode
            </span>
          </div>

          <h3 class="mt-3 text-3xl font-black text-white">Coin News</h3>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            Signed news posts, weekly broadcasts, and BitNames-linked messages
            across Signet.
          </p>
        </div>

        <div class="grid grid-cols-3 gap-3 rounded-2xl border border-gray-800 bg-gray-950/70 p-3 text-center">
          <div class="px-3 py-2">
            <p class="text-lg font-black text-ecash-400">5</p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Posts</p>
          </div>
          <div class="border-x border-gray-800 px-3 py-2">
            <p class="text-lg font-black text-ecash-400">2</p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Feeds</p>
          </div>
          <div class="px-3 py-2">
            <p class="text-lg font-black text-ecash-400">Signet</p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Network</p>
          </div>
        </div>
      </div>
    </section>

    <section class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950">
      <div class="flex flex-col gap-3 border-b border-gray-800 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 class="text-xl font-black text-white">Coin News</h3>
          <p class="mt-1 text-sm text-gray-500">US Weekly</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <select class="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-semibold text-white">
            <option>US Weekly</option>
            <option>Japan Weekly</option>
          </select>
          <button
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-500"
          >
            Broadcast News
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="bg-gray-950/80 text-xs uppercase tracking-widest text-gray-500">
            <tr>
              <th class="border-b border-gray-800 px-4 py-3">Date</th>
              <th class="border-b border-gray-800 px-4 py-3">Fee</th>
              <th class="border-b border-gray-800 px-4 py-3">Title</th>
            </tr>
          </thead>
          <tbody class="text-gray-300">
            <tr
              v-for="row in usWeeklyRows"
              :key="`${row.feed}-${row.date}-${row.title}`"
            >
              <td class="border-b border-gray-900 px-4 py-3 font-mono text-xs text-gray-300">{{ row.date }}</td>
              <td class="border-b border-gray-900 px-4 py-3 font-mono text-xs text-gray-300">{{ row.fee }}</td>
              <td class="border-b border-gray-900 px-4 py-3 font-semibold text-white">{{ row.title }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section
      v-if="props.showJapanFeed"
      class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950"
    >
      <div class="flex flex-col gap-3 border-b border-gray-800 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 class="text-xl font-black text-white">BitNames Feed</h3>
          <p class="mt-1 text-sm text-gray-500">Japan Weekly</p>
        </div>

        <select class="w-fit rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-semibold text-white">
          <option>Japan Weekly</option>
          <option>US Weekly</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="bg-gray-950/80 text-xs uppercase tracking-widest text-gray-500">
            <tr>
              <th class="border-b border-gray-800 px-4 py-3">Date</th>
              <th class="border-b border-gray-800 px-4 py-3">Fee</th>
              <th class="border-b border-gray-800 px-4 py-3">Title</th>
            </tr>
          </thead>
          <tbody class="text-gray-300">
            <tr
              v-for="row in japanWeeklyRows"
              :key="`${row.feed}-${row.date}-${row.title}`"
            >
              <td class="border-b border-gray-900 px-4 py-3 font-mono text-xs text-gray-300">{{ row.date }}</td>
              <td class="border-b border-gray-900 px-4 py-3 font-mono text-xs text-gray-300">{{ row.fee }}</td>
              <td class="border-b border-gray-900 px-4 py-3 font-semibold text-white">{{ row.title }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
