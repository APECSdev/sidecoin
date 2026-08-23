<!-- packages/wallet/src/views/SidechainsView.vue -->

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { getSidechains } from "../api";
import type { SidechainSummary } from "../api";
import { deriveDrivechainAddress, deriveEvmAddress } from "@sidecoin/shared";
import { loadWallet } from "../keystore";
import { PLATFORMS, getPlatformById } from "../data/platforms";
import { canAccessPlatform, isProPlatform } from "../entitlements";
import ProBadge from "../components/pro/ProBadge.vue";

interface WalletSidechainSummary {
  slot: number | null;
  id: string;
  displayName: string;
  description: string;
  status: string;
}

// Slots for which we can derive a verified receive address from the
// stored mnemonic. Each entry names the derivation scheme to use.
//   9  → Thunder  (SLIP-0010 ed25519 + blake3 + base58)
//   4  → BitAssets (same drivechain scheme — slot-independent)
//   88 → Snowside (standard EVM BIP-44, coin type 60)
const ADDRESS_DERIVATION_SLOTS = new Set<number>([9, 4, 88]);
const EVM_ADDRESS_SLOTS = new Set<number>([88]);

const PLATFORM_DISPLAY_PRIORITY: Record<string, number> = {
  bitnames: 0,
  thunder: 1,
  snowside: 2,
};

const sidechains = ref<WalletSidechainSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

// Per-slot derived receive address (one per sidechain with a derivation
// scheme). Keyed by slot so Thunder (9) and Snowside (88) display distinct
// addresses instead of sharing a single L2 address string.
const derivedAddresses = ref<Record<number, string>>({});
const addressError = ref("");
const copiedSlot = ref<number | null>(null);

const orderedSidechains = computed(() => {
  return sidechains.value
    .map((sidechain, index) => ({ sidechain, index }))
    .sort((a, b) => {
      const aPriority = PLATFORM_DISPLAY_PRIORITY[a.sidechain.id] ?? 100 + a.index;
      const bPriority = PLATFORM_DISPLAY_PRIORITY[b.sidechain.id] ?? 100 + b.index;
      return aPriority - bPriority;
    })
    .map((entry) => entry.sidechain);
});

onMounted(async () => {
  const wallet = loadWallet();
  if (wallet) {
    try {
      derivedAddresses.value = deriveAddresses(wallet.mnemonic);
    } catch (e) {
      console.error("[SidechainsView] Failed to derive sidechain addresses:", e);
      addressError.value =
        "Unable to derive a sidechain address from the stored key.";
    }
  }

  // The platform grid + locally-derived addresses render from the static
  // PLATFORMS registry, so they are always visible even when the live API
  // is unreachable. The API call only enriches cards with live status — a
  // failure is surfaced as a non-fatal banner, not a full-page error.
  try {
    sidechains.value = mergePlatformSidechains(await getSidechains());
  } catch (e) {
    error.value = String(e);
    console.error("[SidechainsView] Failed to load sidechains:", e);
    // Fall back to the static platform list so addresses still display.
    sidechains.value = mergePlatformSidechains([]);
  } finally {
    loading.value = false;
  }
});

/**
 * Derive a verified receive address for every slot that has a derivation
 * scheme wired up (Thunder/BitAssets drivechain + Snowside EVM).
 *
 * Each scheme uses its own index convention:
 *   Thunder / BitAssets: index 1 (get_new_address starts at 1)
 *   Snowside (EVM):       index 0 (standard EVM address issuance)
 */
function deriveAddresses(mnemonic: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const slot of ADDRESS_DERIVATION_SLOTS) {
    try {
      if (EVM_ADDRESS_SLOTS.has(slot)) {
        out[slot] = deriveEvmAddress(mnemonic, 0);
      } else {
        out[slot] = deriveDrivechainAddress(mnemonic, 1);
      }
    } catch (e) {
      console.error(`[SidechainsView] Failed to derive address for slot ${slot}:`, e);
    }
  }
  return out;
}

function mergePlatformSidechains(apiSidechains: SidechainSummary[]): WalletSidechainSummary[] {
  const byId = new Map<string, WalletSidechainSummary>();

  for (const sidechain of apiSidechains) {
    byId.set(sidechain.id, sidechain);
  }

  for (const platform of PLATFORMS) {
    if (!byId.has(platform.id)) {
      byId.set(platform.id, {
        slot: platform.slot,
        id: platform.id,
        displayName: platform.displayName,
        description: platform.description,
        status: platform.status,
      });
    }
  }

  return Array.from(byId.values());
}

function isVerified(slot: number | null): boolean {
  return slot != null && ADDRESS_DERIVATION_SLOTS.has(slot) && derivedAddresses.value[slot] != null && derivedAddresses.value[slot] !== "";
}

/**
 * Look up the derived receive address for a slot (or empty string).
 * Used in the template so a null slot never reaches the index lookup.
 */
function addressFor(slot: number | null): string {
  if (slot == null) return "";
  return derivedAddresses.value[slot] ?? "";
}

function platformHref(id: string): string {
  return `/platforms/${id}`;
}

function platformUseCase(id: string): string {
  return getPlatformById(id)?.primaryUseCase ?? "Platform";
}

function platformTagline(id: string): string {
  return getPlatformById(id)?.tagline ?? "";
}

function platformStatusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "coming soon") return "Coming Soon";
  return "Proposed";
}

function slotLabel(slot: number | null): string {
  return slot == null ? "Slot TBD" : `Slot ${slot}`;
}

async function copyAddress(slot: number | null) {
  if (slot == null) return;
  const addr = derivedAddresses.value[slot];
  if (!addr) return;
  try {
    await navigator.clipboard.writeText(addr);
    copiedSlot.value = slot;
    setTimeout(() => {
      copiedSlot.value = null;
    }, 2000);
  } catch (e) {
    console.error("[SidechainsView] Failed to copy:", e);
  }
}
</script>

<template>
  <div>
    <section class="mb-6 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="text-xs uppercase tracking-widest text-ecash-500">
            Drivechains Financial Hub
          </p>
          <h2 class="mt-1 text-3xl font-black">Platforms</h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
            Basic includes L1, Thunder, and BitNames. Sidecoin PRO unlocks the
            complete platform suite, historical analysis, hardware signing
            workflows, and early access to proposed platforms like RISCy.
          </p>
        </div>

        <router-link
          to="/pro"
          class="rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-gray-950 transition-colors hover:bg-amber-400"
        >
          Go PRO!
        </router-link>
      </div>
    </section>

    <div v-if="addressError" class="mb-4 rounded border border-yellow-800 bg-yellow-950/30 p-3 text-sm text-yellow-400">
      {{ addressError }}
    </div>

    <div v-if="loading" class="text-gray-400">Loading platforms…</div>

    <div v-else-if="error" class="rounded bg-red-900/30 p-4 text-red-400">
      <p class="font-semibold">Error loading platforms</p>
      <p class="mt-1 text-sm">{{ error }}</p>
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="sc in orderedSidechains"
        :key="sc.id"
        class="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-white">{{ sc.displayName }}</h3>
            <p class="mt-1 text-xs text-gray-500">{{ platformTagline(sc.id) }}</p>
          </div>

          <div class="flex shrink-0 flex-col items-end gap-2">
            <ProBadge v-if="isProPlatform(sc.id)" />
            <span
              class="rounded-full px-2 py-0.5 text-xs font-medium"
              :class="sc.status === 'active' ? 'bg-ecash-900 text-ecash-400' : 'bg-gray-800 text-gray-500'"
            >
              {{ platformStatusLabel(sc.status) }}
            </span>
          </div>
        </div>

        <p class="mt-3 text-sm text-gray-400">{{ sc.description }}</p>

        <div class="mt-3 flex items-center justify-between text-xs">
          <p class="font-mono text-gray-600">{{ slotLabel(sc.slot) }}</p>
          <span class="rounded-full bg-gray-800 px-2 py-0.5 text-gray-400">
            {{ platformUseCase(sc.id) }}
          </span>
        </div>

        <router-link
          :to="platformHref(sc.id)"
          class="mt-4 inline-flex rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-ecash-500 hover:bg-gray-800 hover:text-white"
        >
          {{ canAccessPlatform(sc.id) ? "Open platform" : "Unlock platform" }}
        </router-link>

        <div
          v-if="isVerified(sc.slot)"
          class="mt-3 border-t border-gray-800 pt-3"
        >
          <p class="mb-1 text-xs text-gray-500">Your Receive Address</p>
          <p class="break-all font-mono text-xs text-ecash-400">
            {{ addressFor(sc.slot) }}
          </p>
          <button
            class="mt-2 rounded bg-gray-800 px-3 py-1 text-xs text-gray-300 hover:bg-gray-700"
            @click="copyAddress(sc.slot)"
          >
            {{ copiedSlot === sc.slot ? "Copied ✓" : "Copy Address" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
