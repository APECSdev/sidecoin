<!-- packages/wallet/src/views/SendView.vue -->

<script setup lang="ts">
import { ref, defineAsyncComponent } from "vue";
import { parsePaymentUri } from "../components/paymenturi";
import { toSpendableUtxo, parseCoinsToSats } from "../send";
import { loadWallet } from "../keystore";
import {
  getL1Utxos,
  broadcastTransaction,
  satsToBtc,
  L1_CHAIN_ID,
  ApiError,
  type BroadcastReceipt,
} from "../api";
import {
  deriveSigningKey,
  selectCoins,
  buildAndSignP2wpkhTransaction,
  type SignedTransaction,
} from "@sidecoin/shared";

// The scanner is loaded lazily (only when opened) so the camera library
// (qr-scanner) — which pulls in browser-only getUserMedia APIs — is never
// imported during normal render or in unit tests.
const QrScanner = defineAsyncComponent(
  () => import("../components/QrScanner.vue"),
);

// Flat fee rate for signet (an empty mempool confirms at 1 sat/vB).
const FEE_RATE_SAT_PER_VB = 1;

type SendTab = "simple" | "advanced" | "review";

/** A built+signed tx plus the recipient amount, for the Review panel. */
interface BuiltTx extends SignedTransaction {
  amountSatoshis: bigint;
}

const sendTabs: { id: SendTab; label: string }[] = [
  { id: "simple", label: "Simple" },
  { id: "advanced", label: "Advanced" },
  { id: "review", label: "Review" },
];

const selectedTab = ref<SendTab>("simple");
const address = ref("");
const amount = ref("");
const sending = ref(false);
const broadcasting = ref(false);
const error = ref<string | null>(null);
const built = ref<BuiltTx | null>(null);
const receipt = ref<BroadcastReceipt | null>(null);
const showScanner = ref(false);

function openScanner() {
  showScanner.value = true;
}

function closeScanner() {
  showScanner.value = false;
}

/**
 * Fill the form from a scanned QR value. Accepts a bare address or a BIP-21
 * "bitcoin:" URI (with optional amount); the recipient field is always set,
 * and the amount field only when the URI carried a valid one.
 */
function onScanDecode(value: string) {
  const parsed = parsePaymentUri(value);
  if (parsed.address) address.value = parsed.address;
  if (parsed.amount) amount.value = parsed.amount;
  showScanner.value = false;
}

/**
 * Build + sign the transaction LOCALLY (does not broadcast). Single-address
 * wallet: we derive the index-0 BIP-84 key (the same path Receive shows),
 * fetch the spendable set for THAT address (the only script we can sign),
 * select coins, and sign. The signed hex is shown for optional verification
 * (testmempoolaccept) before the separate Broadcast step.
 */
async function handleSend() {
  sending.value = true;
  error.value = null;
  built.value = null;
  receipt.value = null;
  try {
    const wallet = loadWallet();
    if (!wallet) {
      error.value = "No wallet found. Complete wallet setup first.";
      return;
    }

    // Parse the amount up front so a bad value fails fast (before any network).
    const amountSatoshis = parseCoinsToSats(amount.value);

    // Index-0 signing key — identical path to deriveReceiveAddress(.., 0).
    const key = deriveSigningKey(wallet.mnemonic, wallet.network, 0);

    // Spendable set for this one address (the only coins we hold a key for).
    const utxoSet = await getL1Utxos(key.address);
    if (utxoSet.truncated) {
      error.value =
        "The UTXO set was truncated upstream; refusing to build from an " +
        "incomplete set. Please try again shortly.";
      return;
    }

    const spendable = utxoSet.utxos.map(toSpendableUtxo);

    const selection = selectCoins({
      utxos: spendable,
      targetSatoshis: amountSatoshis,
      feeRateSatPerVb: FEE_RATE_SAT_PER_VB,
    });

    const signed = buildAndSignP2wpkhTransaction({
      network: wallet.network,
      selectedUtxos: selection.selectedUtxos,
      toAddress: address.value.trim(),
      amountSatoshis,
      feeSatoshis: selection.feeSatoshis,
      changeScriptPubKey: key.scriptPubKey, // change returns to index 0
      signingKeys: [key],
    });

    built.value = { ...signed, amountSatoshis };
    selectedTab.value = "review";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    sending.value = false;
  }
}

/** Relay the already-signed tx to the signet node via the adapter. */
async function broadcast() {
  if (!built.value) return;
  broadcasting.value = true;
  error.value = null;
  try {
    receipt.value = await broadcastTransaction(L1_CHAIN_ID, built.value.hex);
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = `Broadcast failed (${e.code}): ${e.message}`;
    } else {
      error.value = e instanceof Error ? e.message : String(e);
    }
  } finally {
    broadcasting.value = false;
  }
}

/** Discard the built tx and return to the form. */
function cancel() {
  built.value = null;
  receipt.value = null;
  error.value = null;
  selectedTab.value = "simple";
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
          <h2 class="mt-1 text-3xl font-black">Send eCash</h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
            Build, review, sign, and broadcast a local L1 transaction with an
            explicit review step before funds leave your wallet.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <span class="rounded-full bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300">
            Signet
          </span>
          <span class="rounded-full bg-ecash-900 px-3 py-1 text-xs font-semibold text-ecash-400">
            Local signing
          </span>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div class="overflow-x-auto">
        <div class="flex min-w-max gap-2 border-b border-gray-800 pb-3">
          <button
            v-for="tab in sendTabs"
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

      <div
        v-if="error"
        class="mt-6 rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-400"
      >
        {{ error }}
      </div>

      <div v-if="selectedTab === 'simple'" class="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <form class="space-y-5" @submit.prevent="handleSend">
          <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
            <h3 class="text-xl font-black text-white">Simple send</h3>
            <p class="mt-2 text-sm leading-6 text-gray-500">
              Enter a recipient and amount. Sidecoin builds and signs locally,
              then shows a full review before broadcast.
            </p>

            <label class="mt-6 block">
              <span class="mb-1 block text-sm font-semibold text-gray-300">
                Recipient Address
              </span>
              <div class="flex gap-2">
                <input
                  v-model="address"
                  type="text"
                  inputmode="text"
                  autocapitalize="none"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="ecash1q..."
                  class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
                />
                <button
                  type="button"
                  aria-label="Scan QR code"
                  class="shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 active:bg-gray-600"
                  @click="openScanner"
                >
                  Scan
                </button>
              </div>
              <p class="mt-2 text-xs leading-5 text-gray-600">
                QR scanning supports bare addresses and BIP-21 payment URIs.
              </p>
            </label>

            <label class="mt-5 block">
              <span class="mb-1 block text-sm font-semibold text-gray-300">
                Amount (eCash)
              </span>
              <input
                v-model="amount"
                type="text"
                inputmode="decimal"
                placeholder="0.00000000"
                class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
              />
            </label>

            <div class="mt-5 rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class="text-xs uppercase tracking-widest text-gray-500">
                    Fee policy
                  </p>
                  <p class="mt-1 text-sm font-semibold text-white">
                    {{ FEE_RATE_SAT_PER_VB }} sat/vB
                  </p>
                </div>
                <span class="rounded-full bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300">
                  Signet default
                </span>
              </div>
            </div>

            <button
              type="submit"
              :disabled="sending || !address || !amount"
              class="mt-6 w-full rounded-lg bg-ecash-600 px-6 py-3 text-sm font-black text-white hover:bg-ecash-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ sending ? "Building…" : "Review Transaction" }}
            </button>
          </div>
        </form>

        <aside class="space-y-4">
          <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Send safety
            </p>
            <h3 class="mt-2 text-xl font-black text-white">
              Review before broadcast
            </h3>
            <ul class="mt-5 space-y-3 text-sm text-gray-300">
              <li class="flex gap-2">
                <span class="text-ecash-400">✓</span>
                <span>Transaction is built and signed locally.</span>
              </li>
              <li class="flex gap-2">
                <span class="text-ecash-400">✓</span>
                <span>Broadcast happens only after review.</span>
              </li>
              <li class="flex gap-2">
                <span class="text-ecash-400">✓</span>
                <span>Change returns to your wallet index 0 key.</span>
              </li>
              <li class="flex gap-2">
                <span class="text-ecash-400">✓</span>
                <span>Invalid amounts fail before any network call.</span>
              </li>
            </ul>
          </div>

          <div class="rounded-xl border border-amber-500/40 bg-amber-950/10 p-6">
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-gray-950">
                PRO
              </span>
              <p class="text-xs font-black uppercase tracking-[0.2em] text-amber-400">
                Advanced
              </p>
            </div>
            <h3 class="mt-3 text-xl font-black text-white">
              Coin Control comes next
            </h3>
            <p class="mt-3 text-sm leading-6 text-gray-300">
              Manual UTXO selection will live in Advanced as a Sidecoin PRO
              power tool. Simple sends continue to use automatic coin selection.
            </p>
            <button
              type="button"
              class="mt-5 rounded-lg border border-amber-500/50 px-4 py-2 text-sm font-bold text-amber-300 hover:bg-amber-950/40"
              @click="selectedTab = 'advanced'"
            >
              Preview Advanced
            </button>
          </div>
        </aside>
      </div>

      <div v-else-if="selectedTab === 'advanced'" class="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div class="rounded-xl border border-gray-800 bg-gray-950 p-6">
          <div class="flex flex-wrap items-center gap-3">
            <h3 class="text-xl font-black text-white">Advanced send tools</h3>
            <span class="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-gray-950">
              PRO
            </span>
          </div>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-gray-400">
            Advanced tools are designed for power users who want explicit
            control over privacy, fees, UTXOs, and transaction review.
          </p>

          <div class="mt-6 rounded-xl border border-amber-500/40 bg-amber-950/10 p-5">
            <p class="text-xs font-black uppercase tracking-[0.25em] text-amber-400">
              Coin Control
            </p>
            <h4 class="mt-2 text-lg font-black text-white">
              Manual UTXO selection
            </h4>
            <p class="mt-3 text-sm leading-6 text-gray-300">
              Coin Control will let Sidecoin PRO users inspect coins, select
              exact UTXOs, review confirmations, and build advanced sends.
            </p>

            <div class="mt-5 overflow-x-auto rounded-xl border border-gray-800 bg-gray-950">
              <table class="w-full min-w-[720px] text-left text-sm">
                <thead class="text-xs uppercase tracking-widest text-gray-500">
                  <tr>
                    <th class="border-b border-gray-800 px-4 py-3">Select</th>
                    <th class="border-b border-gray-800 px-4 py-3">Amount</th>
                    <th class="border-b border-gray-800 px-4 py-3">Confirmations</th>
                    <th class="border-b border-gray-800 px-4 py-3">Label</th>
                    <th class="border-b border-gray-800 px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody class="text-gray-300">
                  <tr>
                    <td class="border-b border-gray-900 px-4 py-3">
                      <input disabled type="checkbox" class="rounded border-gray-700 bg-gray-900" />
                    </td>
                    <td class="border-b border-gray-900 px-4 py-3 font-mono text-amber-400">
                      PRO
                    </td>
                    <td class="border-b border-gray-900 px-4 py-3">—</td>
                    <td class="border-b border-gray-900 px-4 py-3">Manual selection</td>
                    <td class="border-b border-gray-900 px-4 py-3">Coming next</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mt-5 flex flex-wrap gap-3">
              <button
                disabled
                type="button"
                class="rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-gray-600"
              >
                Use selected coins
              </button>
              <button
                type="button"
                class="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
                @click="selectedTab = 'simple'"
              >
                Back to Simple Send
              </button>
            </div>
          </div>
        </div>

        <aside class="rounded-xl border border-gray-800 bg-gray-950 p-6">
          <p class="text-xs uppercase tracking-widest text-gray-500">
            Advanced warning
          </p>
          <h3 class="mt-2 text-xl font-black text-white">
            Power tools require care
          </h3>
          <p class="mt-3 text-sm leading-6 text-gray-400">
            Manual coin selection can affect privacy, fees, and change outputs.
            Sidecoin keeps this separate from Simple Send so everyday payments
            remain straightforward.
          </p>
          <ul class="mt-5 space-y-3 text-sm text-gray-300">
            <li class="flex gap-2">
              <span class="text-amber-400">✓</span>
              <span>Inspect confirmations before spending.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-amber-400">✓</span>
              <span>Keep automatic coin selection as the default.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-amber-400">✓</span>
              <span>Review all outputs before broadcast.</span>
            </li>
          </ul>
        </aside>
      </div>

      <div v-else class="mt-6">
        <div v-if="built && !receipt" class="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
          <!-- Review: built + signed locally, not yet broadcast. -->
          <div class="rounded-xl border border-gray-800 bg-gray-950 p-6 text-sm">
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Review transaction
            </p>
            <h3 class="mt-2 text-xl font-black text-white">
              Signed locally, ready to broadcast
            </h3>

            <div class="mt-6 grid gap-3 sm:grid-cols-2">
              <div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
                <p class="text-xs text-gray-500">Amount</p>
                <p class="mt-1 font-mono text-lg font-black text-ecash-400">
                  {{ satsToBtc(built.amountSatoshis) }}
                </p>
              </div>
              <div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
                <p class="text-xs text-gray-500">Fee</p>
                <p class="mt-1 font-mono text-lg font-black text-gray-200">
                  {{ satsToBtc(built.feeSatoshis) }}
                </p>
              </div>
              <div
                v-if="built.hasChange"
                class="rounded-lg border border-gray-800 bg-gray-900 p-4"
              >
                <p class="text-xs text-gray-500">Change</p>
                <p class="mt-1 font-mono text-lg font-black text-gray-200">
                  {{ satsToBtc(built.changeSatoshis) }}
                </p>
              </div>
              <div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
                <p class="text-xs text-gray-500">Size</p>
                <p class="mt-1 font-mono text-lg font-black text-gray-200">
                  {{ built.vsize }} vB
                </p>
              </div>
            </div>

            <div class="mt-5 rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p class="mb-2 text-xs uppercase tracking-widest text-gray-500">
                Txid
              </p>
              <p class="break-all font-mono text-xs text-ecash-400">
                {{ built.txid }}
              </p>
            </div>

            <div class="mt-5">
              <label class="mb-1 block text-xs uppercase tracking-widest text-gray-500">
                Signed transaction hex
              </label>
              <textarea
                readonly
                rows="5"
                class="w-full break-all rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-xs text-gray-300"
                :value="built.hex"
              ></textarea>
              <p class="mt-2 text-xs leading-5 text-gray-600">
                Optional: verify on your node before broadcasting with
                <code>testmempoolaccept</code>.
              </p>
            </div>

            <div class="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                :disabled="broadcasting"
                class="rounded-lg bg-ecash-600 px-6 py-3 text-sm font-black text-white hover:bg-ecash-500 disabled:cursor-not-allowed disabled:opacity-50"
                @click="broadcast"
              >
                {{ broadcasting ? "Broadcasting…" : "Broadcast" }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-gray-700 bg-gray-800 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-700"
                @click="cancel"
              >
                Back to edit
              </button>
            </div>
          </div>

          <aside class="rounded-xl border border-gray-800 bg-gray-950 p-6">
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Broadcast checklist
            </p>
            <h3 class="mt-2 text-xl font-black text-white">
              Confirm before sending
            </h3>
            <ul class="mt-5 space-y-3 text-sm text-gray-300">
              <li class="flex gap-2">
                <span class="text-ecash-400">✓</span>
                <span>Recipient address is correct.</span>
              </li>
              <li class="flex gap-2">
                <span class="text-ecash-400">✓</span>
                <span>Amount and fee are expected.</span>
              </li>
              <li class="flex gap-2">
                <span class="text-ecash-400">✓</span>
                <span>Signed transaction hex is available for node review.</span>
              </li>
              <li class="flex gap-2">
                <span class="text-ecash-400">✓</span>
                <span>Broadcast is a separate final action.</span>
              </li>
            </ul>
          </aside>
        </div>

        <!-- Broadcast receipt. -->
        <div
          v-else-if="receipt"
          class="grid gap-6 xl:grid-cols-[1fr_0.8fr]"
        >
          <div class="rounded-xl border border-green-800 bg-green-950/30 p-6 text-sm text-green-400">
            <p class="text-xs font-black uppercase tracking-[0.25em] text-green-300">
              Broadcast receipt
            </p>
            <h3 class="mt-2 text-xl font-black text-white">
              Broadcast {{ receipt.accepted ? "accepted" : "submitted" }}
            </h3>
            <p class="mt-5 break-all">
              Txid:
              <span class="font-mono">{{ receipt.txid }}</span>
            </p>
          </div>

          <aside class="rounded-xl border border-gray-800 bg-gray-950 p-6">
            <p class="text-xs uppercase tracking-widest text-gray-500">
              Next step
            </p>
            <h3 class="mt-2 text-xl font-black text-white">
              Track confirmation
            </h3>
            <p class="mt-3 text-sm leading-6 text-gray-400">
              Your transaction has been handed to the adapter for relay. Watch
              your wallet activity and node indexer for confirmation status.
            </p>
            <button
              type="button"
              class="mt-5 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
              @click="cancel"
            >
              Send another
            </button>
          </aside>
        </div>

        <div v-else class="rounded-xl border border-gray-800 bg-gray-950 p-6">
          <p class="text-xs uppercase tracking-widest text-gray-500">
            Review
          </p>
          <h3 class="mt-2 text-xl font-black text-white">
            No transaction built yet
          </h3>
          <p class="mt-3 text-sm leading-6 text-gray-400">
            Complete the Simple send form to build a locally signed transaction.
            You will review the amount, fee, change, txid, and signed hex before
            broadcasting.
          </p>
          <button
            type="button"
            class="mt-5 rounded-lg bg-ecash-600 px-4 py-2 text-sm font-bold text-white hover:bg-ecash-500"
            @click="selectedTab = 'simple'"
          >
            Open Simple Send
          </button>
        </div>
      </div>
    </section>

    <QrScanner
      v-if="showScanner"
      @decode="onScanDecode"
      @close="closeScanner"
    />
  </div>
</template>
