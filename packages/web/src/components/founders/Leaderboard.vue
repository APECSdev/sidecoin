<!-- packages/web/src/components/founders/Leaderboard.vue -->
<!--
  Leaderboard component for the /founders page.

  Displays a paginated, scrollable list of Founding Members
  with Alpha Circle cut-line visualization.

  Data source: mock data for now.
  TODO: Replace with GET /api/founders?page=N&limit=50

  Features:
    - Sort toggle: oldest first (default) / newest first
    - Alpha Circle zone highlight for top 10%
    - Visual cut-line separator
    - Load more pagination (50 per page)
    - Responsive layout
-->

<script setup lang="ts">
import { ref, computed } from "vue";

// ─── Types ───────────────────────────────────────────────

interface Founder {
  founder_number: number;
  display_name: string;
  created_at: string;
  user_id?: string;
  badge?: string;
}

// ─── Mock Data ───────────────────────────────────────────
//
// TODO: Replace with actual API call when backend is ready.
// Expected endpoint: GET /api/founders?page=N&limit=50&sort=asc|desc
// Response: { founders: Founder[], total: number, page: number, hasMore: boolean }

function generateMockFounders(count: number): Founder[] {
  const names = [
    "satoshi_dev", "alice_chains", "bob_miner", "carol_node",
    "dave_wallet", "eve_signer", "frank_hash", "grace_block",
    "heidi_relay", "ivan_merkle", "judy_utxo", "karl_mempool",
    "lisa_nonce", "mike_ledger", "nancy_fork", "oscar_peer",
    "pat_script", "quinn_stack", "rosa_proof", "steve_branch",
    "tina_output", "uma_input", "vic_header", "wendy_chain",
    "xander_fee", "yara_dust", "zack_opcode",
  ];

  const founders: Founder[] = [];

  for (let i = 1; i <= count; i++) {
    const hasName = Math.random() > 0.25;
    const dayOffset = Math.floor((i / count) * 180);
    const date = new Date("2026-01-15");
    date.setDate(date.getDate() + dayOffset);

    founders.push({
      founder_number: i,
      display_name: hasName
        ? names[i % names.length] + (i > names.length ? `_${i}` : "")
        : "",
      created_at: date.toISOString(),
      user_id: `user-${i.toString(16).padStart(8, "0")}`,
      badge: i <= 10 ? "early" : undefined,
    });
  }

  return founders;
}

// ─── State ───────────────────────────────────────────────

const TOTAL_FOUNDERS = 1284;
const PAGE_SIZE = 50;

const allFounders = generateMockFounders(TOTAL_FOUNDERS);
const sortOrder = ref<"asc" | "desc">("asc");
const visibleCount = ref(PAGE_SIZE);
const isLoading = ref(false);

// ─── Computed ────────────────────────────────────────────

const cutLine = computed(() => Math.max(1, Math.ceil(TOTAL_FOUNDERS * 0.10)));

const sortedFounders = computed(() => {
  const arr = [...allFounders];
  if (sortOrder.value === "desc") {
    arr.sort((a, b) => b.founder_number - a.founder_number);
  } else {
    arr.sort((a, b) => a.founder_number - b.founder_number);
  }
  return arr;
});

const visibleFounders = computed(() => {
  return sortedFounders.value.slice(0, visibleCount.value);
});

const hasMore = computed(() => {
  return visibleCount.value < TOTAL_FOUNDERS;
});

// ─── Methods ─────────────────────────────────────────────

function toggleSort(): void {
  sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
  visibleCount.value = PAGE_SIZE;
}

function loadMore(): void {
  isLoading.value = true;
  // Simulate network delay
  setTimeout(() => {
    visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, TOTAL_FOUNDERS);
    isLoading.value = false;
  }, 300);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function displayName(founder: Founder): string {
  if (founder.display_name) return founder.display_name;
  if (founder.user_id) return founder.user_id.slice(0, 12) + "…";
  return "Anonymous";
}

function isAlphaCircle(founderNumber: number): boolean {
  return founderNumber <= cutLine.value;
}

/**
 * Determine where the cut-line separator should appear
 * within the visible list. Returns the index AFTER which
 * the separator should be rendered, or -1 if not visible.
 */
function cutLineIndex(): number {
  for (let i = 0; i < visibleFounders.value.length; i++) {
    const current = visibleFounders.value[i];
    const next = visibleFounders.value[i + 1];

    if (sortOrder.value === "asc") {
      // Ascending: cut line goes after the last alpha member
      if (current.founder_number <= cutLine.value && (!next || next.founder_number > cutLine.value)) {
        return i;
      }
    } else {
      // Descending: cut line goes after the last non-alpha member
      if (current.founder_number > cutLine.value && (!next || next.founder_number <= cutLine.value)) {
        return i;
      }
    }
  }
  return -1;
}
</script>

<template>
  <div id="leaderboard">

    <!-- Controls -->
    <div class="mb-6 flex items-center justify-between">
      <p class="text-sm text-gray-500">
        Showing {{ visibleFounders.length.toLocaleString() }}
        of {{ TOTAL_FOUNDERS.toLocaleString() }} founders
      </p>
      <button
        @click="toggleSort"
        class="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
      >
        <svg
          class="h-4 w-4"
          :class="sortOrder === 'desc' ? 'rotate-180' : ''"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
        </svg>
        {{ sortOrder === "asc" ? "Oldest First" : "Newest First" }}
      </button>
    </div>

    <!-- Table Header -->
    <div class="hidden sm:grid sm:grid-cols-12 gap-4 rounded-t-xl border border-gray-800 bg-gray-900/60 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
      <div class="col-span-2">#</div>
      <div class="col-span-5">Name</div>
      <div class="col-span-3">Joined</div>
      <div class="col-span-2 text-right">Status</div>
    </div>

    <!-- Rows -->
    <div class="border-x border-b border-gray-800 rounded-b-xl overflow-hidden">
      <template v-for="(founder, idx) in visibleFounders" :key="founder.founder_number">

        <!-- Founder Row -->
        <div
          :class="[
            'grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-6 py-4 transition-colors',
            isAlphaCircle(founder.founder_number)
              ? 'bg-amber-950/10 hover:bg-amber-950/20 border-l-2 border-l-amber-500/40'
              : 'bg-gray-950 hover:bg-gray-900/40 border-l-2 border-l-transparent',
            idx > 0 ? 'border-t border-gray-800/50' : '',
          ]"
        >
          <!-- Founder Number -->
          <div class="sm:col-span-2 flex items-center gap-2">
            <span
              :class="[
                'font-mono text-lg font-bold',
                isAlphaCircle(founder.founder_number) ? 'text-amber-400' : 'text-gray-300',
              ]"
            >
              #{{ founder.founder_number.toLocaleString() }}
            </span>
          </div>

          <!-- Display Name -->
          <div class="sm:col-span-5 flex items-center gap-3">
            <!-- Avatar placeholder -->
            <div
              :class="[
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                isAlphaCircle(founder.founder_number)
                  ? 'border border-amber-700/50 bg-amber-950/40 text-amber-400'
                  : 'border border-gray-700 bg-gray-800 text-gray-400',
              ]"
            >
              {{ displayName(founder).charAt(0).toUpperCase() }}
            </div>
            <span class="text-sm text-gray-300 truncate">
              {{ displayName(founder) }}
            </span>
            <!-- Badge -->
            <span
              v-if="founder.badge === 'early'"
              class="rounded-full border border-amber-700/40 bg-amber-950/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400"
            >
              Early
            </span>
          </div>

          <!-- Joined Date -->
          <div class="sm:col-span-3 flex items-center">
            <span class="text-xs text-gray-500 font-mono">
              {{ formatDate(founder.created_at) }}
            </span>
          </div>

          <!-- Status -->
          <div class="sm:col-span-2 flex items-center justify-end">
            <span
              v-if="isAlphaCircle(founder.founder_number)"
              class="inline-flex items-center gap-1 rounded-full border border-amber-700/30 bg-amber-950/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400"
            >
              <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
              Alpha
            </span>
            <span
              v-else
              class="text-[10px] font-bold uppercase tracking-wider text-gray-600"
            >
              Founder
            </span>
          </div>
        </div>

        <!-- ─── Alpha Circle Cut Line Separator ──────────── -->
        <div
          v-if="idx === cutLineIndex()"
          class="relative flex items-center gap-4 bg-gray-950 px-6 py-3 border-t border-b border-dashed border-amber-600/40"
        >
          <div class="h-px flex-1 bg-gradient-to-r from-transparent via-amber-600/40 to-transparent"></div>
          <div class="flex items-center gap-2 rounded-full border border-amber-700/40 bg-amber-950/30 px-4 py-1.5">
            <svg class="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
            <span class="text-xs font-bold uppercase tracking-widest text-amber-400">
              Alpha Circle Cut Line — #{{ cutLine.toLocaleString() }}
            </span>
            <svg class="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </div>
          <div class="h-px flex-1 bg-gradient-to-r from-transparent via-amber-600/40 to-transparent"></div>
        </div>

      </template>
    </div>

    <!-- Load More -->
    <div v-if="hasMore" class="mt-6 text-center">
      <button
        @click="loadMore"
        :disabled="isLoading"
        class="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-8 py-3 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg
          v-if="isLoading"
          class="h-4 w-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {{ isLoading ? "Loading…" : "Load More Founders" }}
      </button>
      <p class="mt-2 text-xs text-gray-600">
        {{ (TOTAL_FOUNDERS - visibleCount).toLocaleString() }} more founders
      </p>
    </div>

    <!-- All loaded message -->
    <div v-else class="mt-6 text-center">
      <p class="text-xs text-gray-600">
        All {{ TOTAL_FOUNDERS.toLocaleString() }} Founding Members displayed
      </p>
    </div>

  </div>
</template>
