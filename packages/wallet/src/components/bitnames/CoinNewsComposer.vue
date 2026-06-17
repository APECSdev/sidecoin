<!-- packages/wallet/src/components/bitnames/CoinNewsComposer.vue -->

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  ApiError,
  L1_CHAIN_ID,
  broadcastTransaction,
  getL1Utxos,
  satsToBtc,
  type BroadcastReceipt,
} from "../../api";
import { loadWallet } from "../../keystore";
import { toSpendableUtxo } from "../../send";
import {
  buildAndSignOpReturnTransaction,
  buildOpReturnScript,
  deriveSigningKey,
  encodeCoinNewsV2,
  selectCoinsForOpReturn,
  type CoinNewsFeedSlug,
  type SignedOpReturnTransaction,
} from "@sidecoin/shared";

const FEE_RATE_SAT_PER_VB = 1;
const MAX_COIN_NEWS_FIELD_BYTES = 255;
const textEncoder = new TextEncoder();

const feedOptions: { value: CoinNewsFeedSlug; label: string }[] = [
  { value: "us-weekly", label: "US Weekly" },
  { value: "japan-weekly", label: "Japan Weekly" },
  { value: "nascar", label: "NASCAR" },
  { value: "nostr", label: "Nostr" },
];

interface BuiltCoinNewsTransaction extends SignedOpReturnTransaction {
  feed: CoinNewsFeedSlug;
  title: string;
  link: string | null;
  body: string | null;
  payloadBytes: number;
  payloadHex: string;
  opReturnScriptBytes: number;
}

const feed = ref<CoinNewsFeedSlug>("us-weekly");
const title = ref("");
const link = ref("");
const body = ref("");
const building = ref(false);
const broadcasting = ref(false);
const error = ref<string | null>(null);
const built = ref<BuiltCoinNewsTransaction | null>(null);
const receipt = ref<BroadcastReceipt | null>(null);

const titleBytes = computed(() => utf8ByteLength(title.value.trim()));
const linkBytes = computed(() => utf8ByteLength(link.value.trim()));
const bodyBytes = computed(() => utf8ByteLength(body.value.trim()));

const canBuild = computed(() => {
  return title.value.trim().length > 0 && !building.value && !broadcasting.value;
});

function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizedOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatCoins(sats: bigint): string {
  return `${satsToBtc(sats)} eCash`;
}

async function buildNewsTransaction() {
  building.value = true;
  error.value = null;
  built.value = null;
  receipt.value = null;

  try {
    const wallet = loadWallet();
    if (!wallet) {
      error.value = "No wallet found. Complete wallet setup first.";
      return;
    }

    const draftTitle = title.value.trim();
    const draftLink = normalizedOptional(link.value);
    const draftBody = normalizedOptional(body.value);

    const payload = encodeCoinNewsV2({
      feed: feed.value,
      title: draftTitle,
      link: draftLink,
      body: draftBody,
    });
    const opReturnScript = buildOpReturnScript(payload);

    const key = deriveSigningKey(wallet.mnemonic, wallet.network, 0);
    const utxoSet = await getL1Utxos(key.address);

    if (utxoSet.truncated) {
      error.value =
        "The UTXO set was truncated upstream; refusing to build from an " +
        "incomplete set. Please try again shortly.";
      return;
    }

    const spendable = utxoSet.utxos.map(toSpendableUtxo);
    const selection = selectCoinsForOpReturn({
      utxos: spendable,
      opReturnScriptLength: opReturnScript.length,
      feeRateSatPerVb: FEE_RATE_SAT_PER_VB,
    });

    const signed = buildAndSignOpReturnTransaction({
      network: wallet.network,
      selectedUtxos: selection.selectedUtxos,
      opReturnScript,
      feeSatoshis: selection.feeSatoshis,
      changeScriptPubKey: key.scriptPubKey,
      signingKeys: [key],
    });

    built.value = {
      ...signed,
      feed: feed.value,
      title: draftTitle,
      link: draftLink,
      body: draftBody,
      payloadBytes: payload.length,
      payloadHex: bytesToHex(payload),
      opReturnScriptBytes: opReturnScript.length,
    };
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    building.value = false;
  }
}

async function broadcastNewsTransaction() {
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

function resetComposer() {
  built.value = null;
  receipt.value = null;
  error.value = null;
}
</script>

<template>
  <section class="rounded-2xl border border-blue-800/40 bg-blue-950/10 p-5">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p class="text-xs font-black uppercase tracking-[0.25em] text-blue-400">
          Local OP_RETURN signing
        </p>
        <h3 class="mt-2 text-2xl font-black text-white">
          Compose Coin News
        </h3>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
          Build a v2 Coin News OP_RETURN transaction locally, review the signed
          hex, then broadcast explicitly. SupaQt only indexes the post after
          the wallet broadcasts it.
        </p>
      </div>

      <span class="w-fit rounded-full border border-ecash-500/30 bg-ecash-950/40 px-3 py-1 text-xs font-black uppercase tracking-wide text-ecash-300">
        Signet
      </span>
    </div>

    <div
      v-if="error"
      class="mt-5 rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-400"
    >
      {{ error }}
    </div>

    <form class="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]" @submit.prevent="buildNewsTransaction">
      <div class="space-y-4">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-gray-300">
            Feed
          </span>
          <select
            v-model="feed"
            class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white focus:border-ecash-500 focus:outline-none"
          >
            <option
              v-for="option in feedOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-gray-300">
            Title
          </span>
          <input
            v-model="title"
            type="text"
            autocomplete="off"
            placeholder="Introducing SidΞcoin"
            class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
          />
          <p class="mt-2 text-xs leading-5 text-gray-600">
            Required. Encoded as UTF-8 with a one-byte length prefix.
            {{ titleBytes }} / {{ MAX_COIN_NEWS_FIELD_BYTES }} bytes.
          </p>
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-gray-300">
            Link
          </span>
          <input
            v-model="link"
            type="url"
            autocomplete="off"
            placeholder="https://sidecoin.app/markets"
            class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
          />
          <p class="mt-2 text-xs leading-5 text-gray-600">
            Optional TLV 0x01.
            {{ linkBytes }} / {{ MAX_COIN_NEWS_FIELD_BYTES }} bytes.
          </p>
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-gray-300">
            Body
          </span>
          <textarea
            v-model="body"
            rows="5"
            placeholder="Short public post body..."
            class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
          ></textarea>
          <p class="mt-2 text-xs leading-5 text-gray-600">
            Optional TLV 0x02.
            {{ bodyBytes }} / {{ MAX_COIN_NEWS_FIELD_BYTES }} bytes. Do not post secrets.
          </p>
        </label>
      </div>

      <aside class="rounded-xl border border-gray-800 bg-gray-950 p-5">
        <p class="text-xs uppercase tracking-widest text-gray-500">
          Posting safety
        </p>
        <h4 class="mt-2 text-xl font-black text-white">
          Public and permanent
        </h4>
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
            <span>Author is not encoded in Phase 1.</span>
          </li>
          <li class="flex gap-2">
            <span class="text-ecash-400">✓</span>
            <span>Flag byte is omitted unless protocol semantics are defined.</span>
          </li>
          <li class="flex gap-2">
            <span class="text-ecash-400">✓</span>
            <span>Title, link, and body are each capped at 255 UTF-8 bytes.</span>
          </li>
        </ul>

        <button
          type="submit"
          :disabled="!canBuild"
          class="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ building ? "Building…" : "Build Signed News Transaction" }}
        </button>

        <button
          v-if="built"
          type="button"
          class="mt-3 w-full rounded-lg border border-gray-700 px-4 py-3 text-sm font-bold text-gray-300 hover:border-gray-600 hover:text-white"
          @click="resetComposer"
        >
          Edit draft
        </button>
      </aside>
    </form>

    <section
      v-if="built"
      class="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-5"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="text-xs uppercase tracking-widest text-gray-500">
            Review before broadcast
          </p>
          <h4 class="mt-2 text-xl font-black text-white">
            Signed locally, ready to broadcast
          </h4>
        </div>

        <button
          type="button"
          :disabled="broadcasting"
          class="w-fit rounded-lg bg-ecash-600 px-4 py-2 text-sm font-black text-white hover:bg-ecash-500 disabled:cursor-not-allowed disabled:opacity-50"
          @click="broadcastNewsTransaction"
        >
          {{ broadcasting ? "Broadcasting…" : "Broadcast News Transaction" }}
        </button>
      </div>

      <dl class="mt-5 grid gap-4 md:grid-cols-3">
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <dt class="text-xs uppercase tracking-widest text-gray-500">Feed</dt>
          <dd class="mt-2 font-mono text-sm text-white">{{ built.feed }}</dd>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <dt class="text-xs uppercase tracking-widest text-gray-500">Fee</dt>
          <dd class="mt-2 font-mono text-sm text-ecash-400">
            {{ formatCoins(built.feeSatoshis) }}
          </dd>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <dt class="text-xs uppercase tracking-widest text-gray-500">Change</dt>
          <dd class="mt-2 font-mono text-sm text-white">
            {{ formatCoins(built.changeSatoshis) }}
          </dd>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <dt class="text-xs uppercase tracking-widest text-gray-500">Payload</dt>
          <dd class="mt-2 font-mono text-sm text-white">
            {{ built.payloadBytes }} bytes
          </dd>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <dt class="text-xs uppercase tracking-widest text-gray-500">OP_RETURN script</dt>
          <dd class="mt-2 font-mono text-sm text-white">
            {{ built.opReturnScriptBytes }} bytes
          </dd>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <dt class="text-xs uppercase tracking-widest text-gray-500">TxID</dt>
          <dd class="mt-2 break-all font-mono text-xs text-white">
            {{ built.txid }}
          </dd>
        </div>
      </dl>

      <label class="mt-5 block">
        <span class="mb-1 block text-sm font-semibold text-gray-300">
          Coin News payload hex
        </span>
        <textarea
          readonly
          rows="3"
          :value="built.payloadHex"
          class="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-3 font-mono text-xs text-gray-300"
        ></textarea>
      </label>

      <label class="mt-5 block">
        <span class="mb-1 block text-sm font-semibold text-gray-300">
          Signed transaction hex
        </span>
        <textarea
          readonly
          rows="5"
          :value="built.hex"
          class="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-3 font-mono text-xs text-gray-300"
        ></textarea>
      </label>

      <div
        v-if="receipt"
        class="mt-5 rounded-xl border border-ecash-800 bg-ecash-950/30 p-4 text-sm text-ecash-300"
      >
        <p class="font-black text-white">Broadcast receipt</p>
        <p class="mt-2">
          {{ receipt.accepted ? "Accepted" : "Submitted" }} on {{ receipt.chainId }}.
        </p>
        <p class="mt-2 break-all font-mono text-xs">{{ receipt.txid }}</p>
      </div>
    </section>
  </section>
</template>
