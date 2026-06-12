<!-- packages/web/src/components/founders/Leaderboard.vue -->
<!--
  Leaderboard component for the /founders page.

  Displays a cursor-paginated, scrollable list of Founding Members
  with Alpha Circle cut-line visualization.

  Data source: GET /v1/founders?limit=50&sort=asc|desc&cursor=<lastFounderNumber>
  Highlight:   GET /v1/founders/by-key/:pubkey  ("find my position")

  Features:
    - Sort toggle: oldest first (default) / newest first — TRUE server-side
      keyset sort (re-queries page 1), not just a reorder of loaded rows
    - Alpha Circle zone highlight, driven by the server's aboveCutLine flag
    - Visual cut-line separator at the live 20% cut line
    - Cursor "Load More" pagination (50 per page)
    - "Find my position" via the Nostr/identity public key
    - jdenticon avatars derived from avatar_seed
    - "View on Nostr" links (NIP-19 npub derived from identity)
    - Responsive layout
-->

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { toSvg } from "jdenticon";
import { nip19 } from "nostr-tools";

// ─── Configuration ───────────────────────────────────────

const API_BASE = import.meta.env.PUBLIC_API_BASE || "/v1";
const PAGE_SIZE = 50;
const AVATAR_SIZE = 32; // px — matches the h-8 w-8 container
const MY_KEY_STORAGE = "sidecoin:identity_pubkey";
const NOSTR_VIEWER = "https://njump.me"; // human-friendly npub viewer

// ─── Types ───────────────────────────────────────────────
//
// Mirrors the public shape from packages/api/src/routes/founders.ts
// (shapeFounder). identity is the raw 66-char compressed pubkey, exposed so
// clients can derive the Nostr npub.

interface Founder {
  founderNumber: number;
  identity: string;
  username: string | null;
  displayName: string | null;
  avatarSeed: string;
  createdAt: number; // unix seconds
  isAlpha: boolean;
  proActive: boolean;
  aboveCutLine: boolean;
  bio: string | null;
  links: string[];
}

interface LeaderboardResponse {
  total: number;
  cutLine: number;
  cutLinePct: number;
  sort?: string;
  founders: Founder[];
  nextCursor: number | null;
}

interface ByKeyResponse {
  found: boolean;
  total: number;
  cutLine: number;
  founder?: Founder;
  paidThrough?: number;
  proActive?: boolean;
}

// ─── State ───────────────────────────────────────────────

const founders = ref<Founder[]>([]);
const total = ref(0);
const cutLineNum = ref(0);
const nextCursor = ref<number | null>(null);

const sortOrder = ref<"asc" | "desc">("asc");

const initialLoading = ref(true);
const isLoading = ref(false);
const loadError = ref<string | null>(null);

// "Find my position" state
const myKey = ref("");
const myResult = ref<ByKeyResponse | null>(null);
const myLoading = ref(false);
const myError = ref<string | null>(null);

// ─── Computed ────────────────────────────────────────────

// The API returns rows already sorted by the active `sort` direction, so we
// render them as-is. (Kept as a computed so the template binding is stable.)
const sortedFounders = computed(() => founders.value);

const hasMore = computed(() => nextCursor.value !== null);

const myKeyValid = computed(() =>
  /^[0-9a-fA-F]{66}$/.test(myKey.value.trim()),
);

const myFounderNumber = computed(() =>
  myResult.value?.found ? myResult.value.founder?.founderNumber ?? null : null,
);

// ─── Data Loading ────────────────────────────────────────

async function fetchPage(cursor: number | null): Promise<void> {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    sort: sortOrder.value,
  });
  if (cursor != null) params.set("cursor", String(cursor));

  const res = await fetch(`${API_BASE}/founders?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data: LeaderboardResponse = await res.json();
  total.value = data.total;
  cutLineNum.value = data.cutLine;
  nextCursor.value = data.nextCursor;

  if (cursor == null) {
    founders.value = data.founders;
  } else {
    founders.value.push(...data.founders);
  }
}

async function loadInitial(): Promise<void> {
  initialLoading.value = true;
  loadError.value = null;
  try {
    await fetchPage(null);
  } catch (err) {
    console.error("[founders] initial load failed", err);
    loadError.value = "Could not load founders. Please try again.";
  } finally {
    initialLoading.value = false;
  }
}

function loadMore(): void {
  if (isLoading.value || nextCursor.value == null) return;
  isLoading.value = true;
  loadError.value = null;
  fetchPage(nextCursor.value)
    .catch((err) => {
      console.error("[founders] load more failed", err);
      loadError.value = "Could not load more founders.";
    })
    .finally(() => {
      isLoading.value = false;
    });
}

// ─── Find My Position ────────────────────────────────────

async function findMe(): Promise<void> {
  if (!myKeyValid.value) {
    myError.value = "Enter your 66-character identity public key.";
    return;
  }
  myLoading.value = true;
  myError.value = null;
  try {
    const key = myKey.value.trim().toLowerCase();
    const res = await fetch(`${API_BASE}/founders/by-key/${key}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    myResult.value = await res.json();

    // Persist for convenience (client-only).
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MY_KEY_STORAGE, key);
    }
  } catch (err) {
    console.error("[founders] by-key lookup failed", err);
    myError.value = "Lookup failed. Please try again.";
  } finally {
    myLoading.value = false;
  }
}

function clearMe(): void {
  myResult.value = null;
  myKey.value = "";
  myError.value = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(MY_KEY_STORAGE);
  }
}

// ─── Methods ─────────────────────────────────────────────

function toggleSort(): void {
  sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
  // TRUE server-side sort: re-query page 1 with the new direction so the whole
  // dataset reorders, not just the rows already loaded.
  loadInitial();
}

function formatDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function displayName(founder: Founder): string {
  if (founder.displayName) return founder.displayName;
  if (founder.username) return founder.username;
  return `Founder #${founder.founderNumber}`;
}

/** Deterministic identicon SVG from the avatar_seed (sha256 of the pubkey). */
function avatarSvg(seed: string): string {
  return toSvg(seed, AVATAR_SIZE);
}

// ─── Nostr / npub ────────────────────────────────────────
//
// `identity` is the 66-char compressed secp256k1 pubkey (02/03 parity prefix +
// the 32-byte X coordinate). A Nostr pubkey is the X-only coordinate, so we
// drop the leading prefix byte before NIP-19 npub-encoding. Memoized because
// this is called per-row during render.

const npubCache = new Map<string, string>();

function npubOf(identity: string): string {
  if (!identity || identity.length < 66) return "";
  const cached = npubCache.get(identity);
  if (cached !== undefined) return cached;
  try {
    const xOnly = identity.slice(2); // strip 02/03 parity prefix → X-only
    const npub = nip19.npubEncode(xOnly);
    npubCache.set(identity, npub);
    return npub;
  } catch (err) {
    console.error("[founders] npub encode failed", err);
    npubCache.set(identity, "");
    return "";
  }
}

function nostrUrl(identity: string): string {
  const npub = npubOf(identity);
  return npub ? `${NOSTR_VIEWER}/${npub}` : "";
}

/** Row sits in the Alpha zone (server-computed: live 20% OR locked is_alpha). */
function isAlphaCircle(founder: Founder): boolean {
  return founder.aboveCutLine;
}

/** Highlight the viewer's own row when it's present in the loaded set. */
function isMine(founder: Founder): boolean {
  return (
    myFounderNumber.value !== null &&
    founder.founderNumber === myFounderNumber.value
  );
}

/**
 * Determine where the cut-line separator should appear
 * within the visible list. Returns the index AFTER which
 * the separator should be rendered, or -1 if not visible.
 *
 * Anchored to the numeric cut line (cutLineNum) so the separator marks the
 * live 20% boundary regardless of sort direction.
 */
function cutLineIndex(): number {
  const line = cutLineNum.value;
  const list = sortedFounders.value;

  for (let i = 0; i < list.length; i++) {
    const current = list[i];
    const next = list[i + 1];

    if (sortOrder.value === "asc") {
      // Ascending: cut line goes after the last alpha member
      if (current.founderNumber <= line && (!next || next.founderNumber > line)) {
        return i;
      }
    } else {
      // Descending: cut line goes after the last non-alpha member
      if (current.founderNumber > line && (!next || next.founderNumber <= line)) {
        return i;
      }
    }
  }
  return -1;
}

// ─── Lifecycle ───────────────────────────────────────────

onMounted(() => {
  loadInitial();

  // Restore a previously entered identity key and auto-locate.
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(MY_KEY_STORAGE);
    if (saved) {
      myKey.value = saved;
      findMe();
    }
  }
});
</script>

<template>
  <div id="leaderboard">

    <!-- ─── Find My Position ──────────────────────────── -->
    <div class="mb-6 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <label class="block text-sm font-semibold text-white">
        Find my position
      </label>
      <p class="mt-1 text-xs text-gray-500">
        Paste your Nostr / identity public key (Wallet → Settings) to locate
        your Founder number.
      </p>
      <div class="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          v-model="myKey"
          type="text"
          spellcheck="false"
          autocomplete="off"
          placeholder="02… (66 hex characters)"
          class="flex-1 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2.5 font-mono text-xs text-gray-200 placeholder-gray-600 focus:border-amber-600 focus:outline-none"
          :class="{ 'border-red-700': myKey && !myKeyValid }"
          @keyup.enter="findMe"
        />
        <button
          @click="findMe"
          :disabled="myLoading || !myKeyValid"
          class="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-gray-950 transition-all hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ myLoading ? "Searching…" : "Locate Me" }}
        </button>
      </div>
      <p v-if="myError" class="mt-2 text-xs text-red-400">{{ myError }}</p>

      <!-- Result card -->
      <div v-if="myResult" class="mt-4">
        <!-- Found -->
        <div
          v-if="myResult.found && myResult.founder"
          class="flex items-center gap-4 rounded-lg border border-amber-700/40 bg-amber-950/20 p-4"
        >
          <div
            class="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border border-amber-700/50 bg-amber-950/40"
            v-html="avatarSvg(myResult.founder.avatarSeed)"
          ></div>
          <div class="flex-1">
            <p class="font-mono text-xl font-bold text-amber-400">
              #{{ myResult.founder.founderNumber.toLocaleString() }}
            </p>
            <p class="text-xs text-gray-400">
              {{ displayName(myResult.founder) }}
              <span v-if="myResult.founder.aboveCutLine" class="text-amber-400">
                · In the Alpha Circle
              </span>
              <span v-else class="text-gray-500">
                · {{ (cutLineNum && myResult.founder.founderNumber - cutLineNum).toLocaleString() }}
                spots from the cut line
              </span>
            </p>
            <a
              v-if="nostrUrl(myResult.founder.identity)"
              :href="nostrUrl(myResult.founder.identity)"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-purple-400 transition-colors hover:text-purple-300"
            >
              View on Nostr
              <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
          <button
            @click="clearMe"
            class="text-xs text-gray-500 transition-colors hover:text-gray-300"
          >
            Clear
          </button>
        </div>

        <!-- Not a founder yet -->
        <div
          v-else
          class="rounded-lg border border-gray-700 bg-gray-950 p-4 text-center"
        >
          <p class="text-sm text-gray-300">
            That key isn't a Founder yet.
          </p>
          <a
            href="/pro"
            class="mt-2 inline-block rounded-lg bg-amber-500 px-5 py-2 text-xs font-bold text-gray-950 transition-all hover:bg-amber-400"
          >
            Become a Founder →
          </a>
        </div>
      </div>
    </div>

    <!-- Controls -->
    <div class="mb-6 flex items-center justify-between">
      <p class="text-sm text-gray-500">
        Showing {{ founders.length.toLocaleString() }}
        of {{ total.toLocaleString() }} founders
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

    <!-- Initial loading state -->
    <div
      v-if="initialLoading"
      class="flex items-center justify-center gap-3 rounded-xl border border-gray-800 bg-gray-900/40 py-16"
    >
      <div class="h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-amber-400"></div>
      <span class="text-sm text-gray-400">Loading founders…</span>
    </div>

    <!-- Load error (initial) -->
    <div
      v-else-if="loadError && founders.length === 0"
      class="rounded-xl border border-red-900/50 bg-red-950/20 py-12 text-center"
    >
      <p class="text-sm text-red-400">{{ loadError }}</p>
      <button
        @click="loadInitial"
        class="mt-3 rounded-lg bg-amber-500 px-5 py-2 text-xs font-bold text-gray-950 transition-all hover:bg-amber-400"
      >
        Retry
      </button>
    </div>

    <!-- Leaderboard table -->
    <template v-else>
      <!-- Table Header -->
      <div class="hidden sm:grid sm:grid-cols-12 gap-4 rounded-t-xl border border-gray-800 bg-gray-900/60 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <div class="col-span-2">#</div>
        <div class="col-span-5">Name</div>
        <div class="col-span-3">Joined</div>
        <div class="col-span-2 text-right">Status</div>
      </div>

      <!-- Rows -->
      <div class="border-x border-b border-gray-800 rounded-b-xl overflow-hidden">
        <template v-for="(founder, idx) in sortedFounders" :key="founder.founderNumber">

          <!-- Founder Row -->
          <div
            :class="[
              'grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-6 py-4 transition-colors',
              isAlphaCircle(founder)
                ? 'bg-amber-950/10 hover:bg-amber-950/20 border-l-2 border-l-amber-500/40'
                : 'bg-gray-950 hover:bg-gray-900/40 border-l-2 border-l-transparent',
              idx > 0 ? 'border-t border-gray-800/50' : '',
              isMine(founder) ? 'ring-2 ring-inset ring-amber-400/70' : '',
            ]"
          >
            <!-- Founder Number -->
            <div class="sm:col-span-2 flex items-center gap-2">
              <span
                :class="[
                  'font-mono text-lg font-bold',
                  isAlphaCircle(founder) ? 'text-amber-400' : 'text-gray-300',
                ]"
              >
                #{{ founder.founderNumber.toLocaleString() }}
              </span>
              <span
                v-if="isMine(founder)"
                class="rounded-full border border-amber-700/40 bg-amber-950/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400"
              >
                You
              </span>
            </div>

            <!-- Display Name -->
            <div class="sm:col-span-5 flex items-center gap-3">
              <!-- jdenticon avatar (from avatar_seed) -->
              <div
                :class="[
                  'h-8 w-8 flex-shrink-0 overflow-hidden rounded-full',
                  isAlphaCircle(founder)
                    ? 'border border-amber-700/50 bg-amber-950/40'
                    : 'border border-gray-700 bg-gray-800',
                ]"
                v-html="avatarSvg(founder.avatarSeed)"
              ></div>
              <span class="text-sm text-gray-300 truncate">
                {{ displayName(founder) }}
              </span>
              <!-- Badge -->
              <span
                v-if="founder.founderNumber <= 10"
                class="rounded-full border border-amber-700/40 bg-amber-950/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400"
              >
                Early
              </span>
              <!-- View on Nostr (npub derived from identity) -->
              <a
                v-if="nostrUrl(founder.identity)"
                :href="nostrUrl(founder.identity)"
                target="_blank"
                rel="noopener noreferrer"
                class="flex-shrink-0 text-gray-600 transition-colors hover:text-purple-400"
                title="View on Nostr"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>

            <!-- Joined Date -->
            <div class="sm:col-span-3 flex items-center">
              <span class="text-xs text-gray-500 font-mono">
                {{ formatDate(founder.createdAt) }}
              </span>
            </div>

            <!-- Status -->
            <div class="sm:col-span-2 flex items-center justify-end">
              <span
                v-if="isAlphaCircle(founder)"
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
                Alpha Circle Cut Line — #{{ cutLineNum.toLocaleString() }}
              </span>
              <svg class="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </div>
            <div class="h-px flex-1 bg-gradient-to-r from-transparent via-amber-600/40 to-transparent"></div>
          </div>

        </template>
      </div>

      <!-- Inline error during "load more" (keeps existing rows) -->
      <p v-if="loadError && founders.length > 0" class="mt-3 text-center text-xs text-red-400">
        {{ loadError }}
      </p>

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
          {{ (total - founders.length).toLocaleString() }} more founders
        </p>
      </div>

      <!-- All loaded message -->
      <div v-else class="mt-6 text-center">
        <p class="text-xs text-gray-600">
          All {{ total.toLocaleString() }} Founding Members displayed
        </p>
      </div>
    </template>

  </div>
</template>
