<!-- packages/wallet/src/views/ReceiveView.vue -->

<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import QrcodeVue from "qrcode.vue";
import { deriveReceiveAddress } from "@sidecoin/shared";
import type { NetworkId } from "@sidecoin/shared";
import { loadWallet } from "../keystore";

type ReceiveTab = "address" | "payment-code" | "history";

// The two networks a user can receive to from this page. Signet is the
// live signet ("signet live" on ecash.com); Alphanet is the ECX alpha
// practice network (a mainnet fork — see https://drivechain.dev/config).
// The choice is session-only: it is NOT persisted to the keystore.
const RECEIVE_NETWORKS: { id: NetworkId; label: string }[] = [
  { id: "signet", label: "Signet" },
  { id: "alphanet", label: "Alphanet" },
];

// Address issuance is derived from the wallet key. On mount we load the
// stored mnemonic and derive the BIP-84 (P2WPKH) receive address at
// index 0 for the wallet's persisted network. If no wallet exists yet, the
// pending state is shown instead.
//
// The network selector + address index are session-only refs — switching
// re-derives a fresh address without touching the keystore.
const mnemonic = ref("");
const hasWallet = ref(false);
const selectedNetwork = ref<NetworkId>("signet");
const addressIndex = ref(0);
const address = ref("");
const copied = ref(false);
const copiedPaymentCode = ref(false);
const error = ref("");
const selectedTab = ref<ReceiveTab>("address");

const receiveTabs: { id: ReceiveTab; label: string }[] = [
  { id: "address", label: "Address" },
  { id: "payment-code", label: "Payment Code" },
  { id: "history", label: "History" },
];

const networkLabel = computed(() => {
  const found = RECEIVE_NETWORKS.find((n) => n.id === selectedNetwork.value);
  return found ? found.label : selectedNetwork.value;
});

// BIP-44 coin type: 0 for mainnet + mainnet forks (alphanet), 1 for test
// networks. Mirrors the coinTypeFor logic in @sidecoin/shared/wallet/derivation.
const coinType = computed(() =>
  selectedNetwork.value === "mainnet" || selectedNetwork.value === "alphanet" ? 0 : 1,
);

const derivationPath = computed(
  () => `m/84'/${coinType.value}'/0'/0/${addressIndex.value}`,
);

const paymentCodePreview = computed(() => {
  if (!address.value) return "";
  return `sidecoin:receive:${address.value}`;
});

// Re-derive the receive address for the currently selected network + index.
// Called on mount and whenever the network or index changes (session-only).
function updateAddress() {
  if (!hasWallet.value || !mnemonic.value) {
    address.value = "";
    return;
  }
  try {
    error.value = "";
    address.value = deriveReceiveAddress(
      mnemonic.value,
      selectedNetwork.value,
      addressIndex.value,
    );
  } catch (e) {
    console.error("[ReceiveView] Failed to derive address:", e);
    address.value = "";
    error.value = "Unable to derive a receive address from the stored key.";
  }
}

// Cycle to the next receive address index (session-only, not persisted).
function generateNewAddress() {
  addressIndex.value += 1;
}

watch([selectedNetwork, addressIndex], updateAddress);

onMounted(() => {
  const wallet = loadWallet();
  if (!wallet) return; // no key yet — pending state renders
  hasWallet.value = true;
  mnemonic.value = wallet.mnemonic;
  selectedNetwork.value = wallet.network;
  updateAddress();
});

async function copyAddress() {
  if (!address.value) return;
  try {
    await navigator.clipboard.writeText(address.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (e) {
    console.error("[ReceiveView] Failed to copy:", e);
  }
}

async function copyPaymentCode() {
  if (!paymentCodePreview.value) return;
  try {
    await navigator.clipboard.writeText(paymentCodePreview.value);
    copiedPaymentCode.value = true;
    setTimeout(() => {
      copiedPaymentCode.value = false;
    }, 2000);
  } catch (e) {
    console.error("[ReceiveView] Failed to copy payment code preview:", e);
  }
}
</script>

<template>
  <div>
    <section class="mb-6 rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="text-xs uppercase tracking-widest text-ecash-500">
            L1 Wallet
          </p>
          <h2 class="mt-1 text-3xl font-black">Receive eCash</h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
            Generate your wallet receive address, scan a QR code, and review
            receive metadata from one place.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <span class="rounded-full bg-ecash-900 px-3 py-1 text-xs font-semibold text-ecash-400">
            Native SegWit
          </span>
        </div>
      </div>
    </section>

    <!-- Derivation failed -->
    <div v-if="error" class="max-w-3xl rounded-xl border border-red-800 bg-red-950/30 p-5 text-sm text-red-400">
      <p class="font-semibold">Address unavailable</p>
      <p class="mt-1 text-xs text-red-600">{{ error }}</p>
    </div>

    <!-- No key yet: address derivation comes with wallet setup -->
    <div v-else-if="!address" class="max-w-3xl rounded-xl border border-yellow-800 bg-yellow-950/30 p-5 text-sm text-yellow-400">
      <p class="font-semibold">Wallet setup required</p>
      <p class="mt-1 text-xs leading-5 text-yellow-600">
        Receive addresses are derived from your wallet key. Address generation
        becomes available once key setup is complete.
      </p>
    </div>

    <section v-else class="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div class="overflow-x-auto">
        <div class="flex min-w-max gap-2 border-b border-gray-800 pb-3">
          <button
            v-for="tab in receiveTabs"
            :key="tab.id"
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            :class="selectedTab === tab.id ? 'bg-ecash-600 text-white' : 'bg-gray-950 text-gray-400 hover:bg-gray-800 hover:text-white'"
            @click="selectedTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div v-if="selectedTab === 'address'" class="mt-6">
        <!-- Network selector — session-only, not persisted to the keystore. -->
        <div class="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Receive to network
            </p>
            <p class="mt-1 text-xs text-gray-500">
              Select which network to receive to. This is a session-only
              choice and is not saved to your wallet.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="net in RECEIVE_NETWORKS"
              :key="net.id"
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              :class="selectedNetwork === net.id ? 'bg-ecash-600 text-white' : 'bg-gray-950 text-gray-400 hover:bg-gray-800 hover:text-white'"
              @click="selectedNetwork = net.id; addressIndex = 0"
            >
              {{ net.label }}
            </button>
          </div>
        </div>

        <div class="grid gap-6 xl:grid-cols-[0.8fr_1fr]">
        <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
          <p class="text-xs uppercase tracking-widest text-gray-500">
            Scan this QR code
          </p>

          <div class="mt-5 flex justify-center">
            <div class="rounded-2xl border border-gray-800 bg-white p-4">
              <QrcodeVue :value="address" :size="220" level="M" />
            </div>
          </div>

          <p class="mt-5 text-center text-xs leading-5 text-gray-500">
            Send only funds for this network to this address. Deposits appear
            after confirmation and indexing.
          </p>
        </div>

        <div class="space-y-4">
          <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
            <p class="mb-2 text-sm text-gray-400">Your Receive Address</p>
            <p class="break-all font-mono text-sm text-ecash-400">{{ address }}</p>

            <div class="mt-5 flex flex-wrap gap-3">
              <button
                class="rounded-lg bg-ecash-600 px-4 py-2 text-sm font-bold text-white hover:bg-ecash-500"
                @click="copyAddress"
              >
                {{ copied ? "Copied ✓" : "Copy Address" }}
              </button>
              <button
                class="rounded-lg border border-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-800 hover:text-white"
                @click="generateNewAddress"
              >
                Generate New Address
              </button>
            </div>
          </div>

          <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Address details
            </p>

            <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div class="rounded-lg border border-gray-800 bg-gray-900 p-3">
                <dt class="text-xs text-gray-500">Network</dt>
                <dd class="mt-1 font-semibold text-gray-200">{{ networkLabel }}</dd>
              </div>
              <div class="rounded-lg border border-gray-800 bg-gray-900 p-3">
                <dt class="text-xs text-gray-500">Address type</dt>
                <dd class="mt-1 font-semibold text-gray-200">Native SegWit</dd>
              </div>
              <div class="rounded-lg border border-gray-800 bg-gray-900 p-3">
                <dt class="text-xs text-gray-500">Address index</dt>
                <dd class="mt-1 font-mono text-xs text-gray-300">{{ addressIndex }}</dd>
              </div>
              <div class="rounded-lg border border-gray-800 bg-gray-900 p-3 sm:col-span-2">
                <dt class="text-xs text-gray-500">Derivation</dt>
                <dd class="mt-1 font-mono text-xs text-gray-300">
                  {{ derivationPath }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
        </div>
      </div>

      <div v-else-if="selectedTab === 'payment-code'" class="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
          <p class="text-xs uppercase tracking-widest text-gray-500">
            Payment code preview
          </p>
          <h3 class="mt-2 text-xl font-black text-white">
            Reusable receive identity
          </h3>
          <p class="mt-3 text-sm leading-6 text-gray-400">
            This preview packages your current receive address into a Sidecoin
            receive card format. Future identity-based receiving can build on
            this pattern without changing your wallet keys.
          </p>

          <div class="mt-5 rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p class="mb-2 text-xs uppercase tracking-widest text-gray-500">
              Preview code
            </p>
            <p class="break-all font-mono text-xs text-ecash-400">
              {{ paymentCodePreview }}
            </p>
          </div>

          <button
            class="mt-5 rounded-lg bg-ecash-600 px-4 py-2 text-sm font-bold text-white hover:bg-ecash-500"
            @click="copyPaymentCode"
          >
            {{ copiedPaymentCode ? "Copied ✓" : "Copy Preview Code" }}
          </button>
        </div>

        <div class="rounded-xl border border-amber-500/40 bg-amber-950/10 p-6">
          <p class="text-xs font-black uppercase tracking-[0.25em] text-amber-400">
            Coming next
          </p>
          <h3 class="mt-2 text-xl font-black text-white">
            BitNames receiving
          </h3>
          <p class="mt-3 text-sm leading-6 text-gray-300">
            BitNames can make receiving easier by connecting human-readable
            names, contacts, and reusable payment metadata.
          </p>
          <ul class="mt-5 space-y-3 text-sm text-gray-300">
            <li class="flex gap-2">
              <span class="text-amber-400">✓</span>
              <span>Resolve a BitName before sending.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-amber-400">✓</span>
              <span>Attach wallet addresses to identity records.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-amber-400">✓</span>
              <span>Use contacts for repeat payments and messaging.</span>
            </li>
          </ul>
        </div>
      </div>

      <div v-else class="mt-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 class="text-xl font-black text-white">Receive history</h3>
            <p class="mt-2 text-sm text-gray-500">
              Address usage and confirmed deposits will appear here after
              indexing.
            </p>
          </div>

          <button
            disabled
            class="w-fit rounded-lg border border-gray-800 px-4 py-2 text-sm font-semibold text-gray-600"
          >
            Export CSV
          </button>
        </div>

        <div class="mt-5 overflow-x-auto rounded-xl border border-gray-800 bg-gray-950">
          <table class="w-full min-w-[760px] text-left text-sm">
            <thead class="text-xs uppercase tracking-widest text-gray-500">
              <tr>
                <th class="border-b border-gray-800 px-4 py-3">Label</th>
                <th class="border-b border-gray-800 px-4 py-3">Address</th>
                <th class="border-b border-gray-800 px-4 py-3">Status</th>
                <th class="border-b border-gray-800 px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody class="text-gray-300">
              <tr>
                <td class="border-b border-gray-900 px-4 py-3">Primary receive</td>
                <td class="break-all border-b border-gray-900 px-4 py-3 font-mono text-xs text-gray-500">
                  {{ address }}
                </td>
                <td class="border-b border-gray-900 px-4 py-3">Ready</td>
                <td class="border-b border-gray-900 px-4 py-3 font-mono text-ecash-400">
                  —
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
