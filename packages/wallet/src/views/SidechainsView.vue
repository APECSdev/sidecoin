<!-- packages/wallet/src/views/SidechainsView.vue -->

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getSidechains } from "../api";
import type { SidechainSummary } from "../api";
import { deriveDrivechainAddress } from "@sidecoin/shared";
import { loadWallet } from "../keystore";

// Slots whose L2 receive-address derivation has been VERIFIED against
// thunder-rust (SLIP-0010 m/1'/0'/0'/1' -> blake3 dkLen:20 -> base58):
//   slot 9 = Thunder, slot 4 = BitAssets.
// Both share the identical scheme, so the derived address is the same for
// each. We deliberately do NOT surface an address for unverified chains
// (zSide, BitNames, Photon, Truthcoin, CoinShift, RISCy) — their derivation
// schemes are unconfirmed and we will not display an address we cannot
// stand behind.
const VERIFIED_ADDRESS_SLOTS = new Set<number>([9, 4]);

const sidechains = ref<SidechainSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

// L2 drivechain receive address derived from the stored wallet key.
// Slot-independent (identical for Thunder slot 9 and BitAssets slot 4),
// so a single derived value is rendered on every verified card.
const drivechainAddress = ref("");
const addressError = ref("");
const copiedSlot = ref<number | null>(null);

onMounted(async () => {
  // Derive the L2 receive address from the stored mnemonic, mirroring
  // ReceiveView. If no wallet exists yet, verified cards simply omit the
  // address block.
  const wallet = loadWallet();
  if (wallet) {
    try {
      drivechainAddress.value = deriveDrivechainAddress(wallet.mnemonic, 1);
    } catch (e) {
      console.error("[SidechainsView] Failed to derive L2 address:", e);
      addressError.value =
        "Unable to derive a sidechain address from the stored key.";
    }
  }

  try {
    sidechains.value = await getSidechains();
  } catch (e) {
    error.value = String(e);
    console.error("[SidechainsView] Failed to load sidechains:", e);
  } finally {
    loading.value = false;
  }
});

function isVerified(slot: number): boolean {
  return VERIFIED_ADDRESS_SLOTS.has(slot) && drivechainAddress.value !== "";
}

async function copyAddress(slot: number) {
  if (!drivechainAddress.value) return;
  try {
    await navigator.clipboard.writeText(drivechainAddress.value);
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
    <h2 class="mb-2 text-2xl font-bold">Sidechains</h2>
    <p class="mb-6 text-sm text-gray-400">
      BIP-300 / BIP-301 Drivechains — 7 sidechains at launch
    </p>

    <div v-if="loading" class="text-gray-400">Loading sidechains…</div>

    <div v-else-if="error" class="rounded bg-red-900/30 p-4 text-red-400">
      <p class="font-semibold">Error loading sidechains</p>
      <p class="mt-1 text-sm">{{ error }}</p>
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="sc in sidechains"
        :key="sc.slot"
        class="rounded-lg border border-gray-800 bg-gray-900 p-4"
      >
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-white">{{ sc.displayName }}</h3>
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="sc.status === 'active' ? 'bg-ecash-900 text-ecash-400' : 'bg-gray-800 text-gray-500'"
          >
            {{ sc.status === "active" ? "Active" : "Pending" }}
          </span>
        </div>
        <p class="mt-1 text-sm text-gray-400">{{ sc.description }}</p>
        <p class="mt-2 font-mono text-xs text-gray-600">Slot {{ sc.slot }}</p>

        <!-- L2 receive address — only on VERIFIED chains (Thunder slot 9,
             BitAssets slot 4) and only once a wallet key exists. -->
        <div
          v-if="isVerified(sc.slot)"
          class="mt-3 border-t border-gray-800 pt-3"
        >
          <p class="mb-1 text-xs text-gray-500">Your Receive Address</p>
          <p class="break-all font-mono text-xs text-ecash-400">
            {{ drivechainAddress }}
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
