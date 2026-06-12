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

/** A built+signed tx plus the recipient amount, for the Review panel. */
interface BuiltTx extends SignedTransaction {
  amountSatoshis: bigint;
}

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
}
</script>

<template>
  <div>
    <h2 class="mb-6 text-2xl font-bold">Send eCash</h2>

    <form class="max-w-lg space-y-4" @submit.prevent="handleSend">
      <div>
        <label class="mb-1 block text-sm text-gray-400">Recipient Address</label>
        <div class="flex gap-2">
          <input
            v-model="address"
            type="text"
            inputmode="text"
            autocapitalize="none"
            autocomplete="off"
            spellcheck="false"
            placeholder="ecash1q..."
            class="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
          />
          <button
            type="button"
            aria-label="Scan QR code"
            class="shrink-0 rounded border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 active:bg-gray-600"
            @click="openScanner"
          >
            Scan
          </button>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-sm text-gray-400">Amount (eCash)</label>
        <input
          v-model="amount"
          type="text"
          inputmode="decimal"
          placeholder="0.00000000"
          class="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        :disabled="sending || !address || !amount"
        class="rounded bg-ecash-600 px-6 py-2 text-sm font-semibold text-white hover:bg-ecash-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ sending ? "Sending…" : "Send" }}
      </button>
    </form>

    <div
      v-if="error"
      class="mt-4 max-w-lg rounded border border-red-800 bg-red-950/30 p-3 text-sm text-red-400"
    >
      {{ error }}
    </div>

    <!-- Review: built + signed locally, not yet broadcast. -->
    <div
      v-if="built && !receipt"
      class="mt-6 max-w-lg space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4 text-sm"
    >
      <p class="font-semibold text-white">Review transaction (signet)</p>

      <div class="space-y-1 text-gray-400">
        <p>Amount: <span class="text-gray-200">{{ satsToBtc(built.amountSatoshis) }}</span></p>
        <p>Fee: <span class="text-gray-200">{{ satsToBtc(built.feeSatoshis) }}</span></p>
        <p v-if="built.hasChange">
          Change: <span class="text-gray-200">{{ satsToBtc(built.changeSatoshis) }}</span>
        </p>
        <p>Size: <span class="text-gray-200">{{ built.vsize }} vB</span></p>
        <p class="break-all">Txid: <span class="font-mono text-ecash-400">{{ built.txid }}</span></p>
      </div>

      <div>
        <label class="mb-1 block text-xs text-gray-500">Signed transaction hex</label>
        <textarea
          readonly
          rows="4"
          class="w-full break-all rounded border border-gray-700 bg-gray-950 p-2 font-mono text-xs text-gray-300"
          :value="built.hex"
        ></textarea>
        <p class="mt-1 text-xs text-gray-600">
          Optional: verify on your node before broadcasting with
          <code>testmempoolaccept</code>.
        </p>
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          :disabled="broadcasting"
          class="rounded bg-ecash-600 px-6 py-2 text-sm font-semibold text-white hover:bg-ecash-500 disabled:cursor-not-allowed disabled:opacity-50"
          @click="broadcast"
        >
          {{ broadcasting ? "Broadcasting…" : "Broadcast" }}
        </button>
        <button
          type="button"
          class="rounded border border-gray-700 bg-gray-800 px-6 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          @click="cancel"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Broadcast receipt. -->
    <div
      v-if="receipt"
      class="mt-6 max-w-lg space-y-1 rounded-lg border border-green-800 bg-green-950/30 p-4 text-sm text-green-400"
    >
      <p class="font-semibold">
        Broadcast {{ receipt.accepted ? "accepted" : "submitted" }}.
      </p>
      <p class="break-all">Txid: <span class="font-mono">{{ receipt.txid }}</span></p>
    </div>

    <QrScanner
      v-if="showScanner"
      @decode="onScanDecode"
      @close="closeScanner"
    />
  </div>
</template>
