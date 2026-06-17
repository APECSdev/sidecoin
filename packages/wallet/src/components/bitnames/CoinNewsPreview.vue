<!-- packages/wallet/src/components/bitnames/CoinNewsPreview.vue -->

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import CoinNewsComposer from "./CoinNewsComposer.vue";
import {
  getCoinNewsFeeds,
  getCoinNewsPosts,
  satsToBtc,
  type CoinNewsFeed,
  type CoinNewsPost,
} from "../../api";

const props = withDefaults(
  defineProps<{
    dashboard?: boolean;
    showHero?: boolean;
    showJapanFeed?: boolean;
    composerOpenNonce?: number;
  }>(),
  {
    dashboard: false,
    showHero: true,
    showJapanFeed: true,
    composerOpenNonce: 0,
  },
);

const composerOpen = ref(false);
const composerHost = ref<HTMLElement | null>(null);
const feeds = ref<CoinNewsFeed[]>([]);
const usWeeklyRows = ref<CoinNewsPost[]>([]);
const japanWeeklyRows = ref<CoinNewsPost[]>([]);
const feedsLoading = ref(true);
const usWeeklyLoading = ref(true);
const japanWeeklyLoading = ref(true);
const feedsError = ref<string | null>(null);
const usWeeklyError = ref<string | null>(null);
const japanWeeklyError = ref<string | null>(null);

const enabledFeeds = computed(() => {
  return feeds.value.filter((feed) => feed.enabled !== false);
});

const totalPostCount = computed(() => {
  const indexedTotal = feeds.value.reduce((acc, feed) => {
    return acc + (typeof feed.post_count === "number" ? feed.post_count : 0);
  }, 0);

  if (indexedTotal > 0) {
    return indexedTotal;
  }

  return usWeeklyRows.value.length + japanWeeklyRows.value.length;
});

async function loadFeeds() {
  feedsLoading.value = true;
  feedsError.value = null;

  try {
    feeds.value = await getCoinNewsFeeds();
  } catch (e) {
    console.error("[CoinNewsPreview] Failed to load feeds:", e);
    feedsError.value = "Live Coin News feeds are unavailable.";
  } finally {
    feedsLoading.value = false;
  }
}

async function loadFeedPosts(
  feedId: "us-weekly" | "japan-weekly",
  target: typeof usWeeklyRows,
  setLoading: (value: boolean) => void,
  setError: (value: string | null) => void,
) {
  setLoading(true);
  setError(null);

  try {
    const page = await getCoinNewsPosts(feedId, {
      limit: props.dashboard ? 5 : 10,
    });
    target.value = page.posts;
  } catch (e) {
    console.error(`[CoinNewsPreview] Failed to load ${feedId}:`, e);
    target.value = [];
    setError("Live Coin News posts are unavailable.");
  } finally {
    setLoading(false);
  }
}

async function loadCoinNews() {
  await Promise.all([
    loadFeeds(),
    loadFeedPosts(
      "us-weekly",
      usWeeklyRows,
      (value) => {
        usWeeklyLoading.value = value;
      },
      (value) => {
        usWeeklyError.value = value;
      },
    ),
    props.showJapanFeed
      ? loadFeedPosts(
          "japan-weekly",
          japanWeeklyRows,
          (value) => {
            japanWeeklyLoading.value = value;
          },
          (value) => {
            japanWeeklyError.value = value;
          },
        )
      : Promise.resolve(),
  ]);
}

function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) {
    return "—";
  }

  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const month = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");

  return `${date.getUTCFullYear()} ${month} ${day} ${hour}:${minute}`;
}

function formatFee(feeSats: string): string {
  try {
    return `${satsToBtc(BigInt(feeSats))} BTC`;
  } catch {
    return "—";
  }
}

function feedPostCount(feedId: string, rows: CoinNewsPost[]): number {
  const feed = feeds.value.find((candidate) => candidate.id === feedId);
  return typeof feed?.post_count === "number" ? feed.post_count : rows.length;
}

async function openComposer() {
  if (props.dashboard) {
    return;
  }

  composerOpen.value = true;
  await nextTick();
  composerHost.value?.scrollIntoView?.({
    behavior: "smooth",
    block: "start",
  });
}

watch(
  () => props.composerOpenNonce,
  (value, oldValue) => {
    if (value > 0 && value !== oldValue) {
      void openComposer();
    }
  },
);

onMounted(() => {
  loadCoinNews();
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
              Live
            </span>
          </div>

          <h3 class="mt-3 text-3xl font-black text-white">Coin News</h3>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            Signed news posts, weekly broadcasts, and BitNames-linked messages
            indexed from Signet by SupaQt.
          </p>
          <p v-if="feedsError" class="mt-3 text-sm text-yellow-500">
            {{ feedsError }}
          </p>
        </div>

        <div class="grid grid-cols-3 gap-3 rounded-2xl border border-gray-800 bg-gray-950/70 p-3 text-center">
          <div class="px-3 py-2">
            <p class="text-lg font-black text-ecash-400">
              {{ feedsLoading ? "…" : totalPostCount }}
            </p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Posts</p>
          </div>
          <div class="border-x border-gray-800 px-3 py-2">
            <p class="text-lg font-black text-ecash-400">
              {{ feedsLoading ? "…" : enabledFeeds.length }}
            </p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Feeds</p>
          </div>
          <div class="px-3 py-2">
            <p class="text-lg font-black text-ecash-400">Signet</p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Network</p>
          </div>
        </div>
      </div>
    </section>

    <div
      v-if="composerOpen && !props.dashboard"
      ref="composerHost"
    >
      <CoinNewsComposer />
    </div>

    <section class="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950">
      <div class="flex flex-col gap-3 border-b border-gray-800 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 class="text-xl font-black text-white">Coin News</h3>
          <p class="mt-1 text-sm text-gray-500">US Weekly</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <select
            disabled
            class="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-80"
          >
            <option>US Weekly</option>
          </select>
          <button
            type="button"
            :disabled="props.dashboard"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            @click="openComposer"
          >
            Broadcast News
          </button>
        </div>
      </div>

      <div v-if="usWeeklyLoading" class="px-5 py-6 text-sm text-gray-400">
        Loading live US Weekly posts…
      </div>

      <div v-else-if="usWeeklyError" class="px-5 py-6 text-sm text-yellow-500">
        {{ usWeeklyError }}
      </div>

      <div v-else-if="usWeeklyRows.length === 0" class="px-5 py-6 text-sm text-gray-500">
        No live US Weekly posts are indexed yet.
      </div>

      <div v-else class="overflow-x-auto">
        <table
          class="text-left text-sm"
          :class="props.dashboard ? 'w-full table-fixed' : 'w-full min-w-[760px]'"
        >
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
              :key="row.id"
            >
              <td class="border-b border-gray-900 px-4 py-3 font-mono text-xs text-gray-300">{{ formatDate(row.created_at) }}</td>
              <td class="border-b border-gray-900 px-4 py-3 font-mono text-xs text-gray-300">{{ formatFee(row.fee_sats) }}</td>
              <td
                class="border-b border-gray-900 px-4 py-3 font-semibold text-white"
                :class="props.dashboard ? 'whitespace-normal break-words' : ''"
              >
                {{ row.title }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="border-t border-gray-900 px-5 py-3 text-xs text-gray-600">
        {{ feedPostCount("us-weekly", usWeeklyRows) }} indexed posts
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

        <select
          disabled
          class="w-fit rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-80"
        >
          <option>Japan Weekly</option>
        </select>
      </div>

      <div v-if="japanWeeklyLoading" class="px-5 py-6 text-sm text-gray-400">
        Loading live Japan Weekly posts…
      </div>

      <div v-else-if="japanWeeklyError" class="px-5 py-6 text-sm text-yellow-500">
        {{ japanWeeklyError }}
      </div>

      <div v-else-if="japanWeeklyRows.length === 0" class="px-5 py-6 text-sm text-gray-500">
        No live Japan Weekly posts are indexed yet.
      </div>

      <div v-else class="overflow-x-auto">
        <table
          class="text-left text-sm"
          :class="props.dashboard ? 'w-full table-fixed' : 'w-full min-w-[760px]'"
        >
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
              :key="row.id"
            >
              <td class="border-b border-gray-900 px-4 py-3 font-mono text-xs text-gray-300">{{ formatDate(row.created_at) }}</td>
              <td class="border-b border-gray-900 px-4 py-3 font-mono text-xs text-gray-300">{{ formatFee(row.fee_sats) }}</td>
              <td
                class="border-b border-gray-900 px-4 py-3 font-semibold text-white"
                :class="props.dashboard ? 'whitespace-normal break-words' : ''"
              >
                {{ row.title }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="border-t border-gray-900 px-5 py-3 text-xs text-gray-600">
        {{ feedPostCount("japan-weekly", japanWeeklyRows) }} indexed posts
      </div>
    </section>
  </div>
</template>
