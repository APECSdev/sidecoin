<!-- packages/wallet/src/views/HardwareWalletView.vue -->

<script setup lang="ts">
import { ref, computed } from "vue";
import type {
  HardwareWallet,
  HardwareAccount,
  HardwareSignRequest,
} from "../hardware/types";
import { OneKeyHardwareWallet } from "../hardware/onekey";
import ProGate from "../components/pro/ProGate.vue";
import { loadWallet } from "../keystore";
import { toSpendableUtxo, parseCoinsToSats } from "../send";
import {
  getL1Balance,
  getL1Utxos,
  broadcastTransaction,
  satsToBtc,
  L1_CHAIN_ID,
  ApiError,
  type BroadcastReceipt,
} from "../api";
import { selectCoins, type NetworkId } from "@sidecoin/shared";
import { address as btcAddress, networks as btcNetworks } from "bitcoinjs-lib";

const props = defineProps<{ wallet?: HardwareWallet }>();
const wallet: HardwareWallet = props.wallet ?? new OneKeyHardwareWallet();

// Network-aware defaults: derive path + coin id from the wallet's stored
// network so the hardware address matches the software wallet's index-0 key.
// Signet -> m/84'/1'/0'/0/0 + coin "test" (tb1... address). Previously these
// were hardcoded to mainnet (m/84'/0'/0'/0/0 + "btc"), which produced a bc1...
// address that could NOT receive signet funds.
const stored = loadWallet();
const isMainnet = stored?.network === "mainnet";
const coinType = isMainnet ? 0 : 1;
const walletNetwork: NetworkId = (stored?.network as NetworkId) ?? "signet";

const status = ref<"idle" | "connecting" | "connected" | "error">("idle");
const busy = ref(false);
const error = ref("");
const path = ref(`m/84'/${coinType}'/0'/0/0`);
const coin = ref(isMainnet ? "btc" : "test");
const showOnDevice = ref(true);
const account = ref<HardwareAccount | null>(null);
const balanceSats = ref<bigint | null>(null);

const quickStart = [
  "Connect your OneKey over WebUSB",
  "Choose a derivation path",
  "Confirm the address on-device",
];

async function connect() {
  if (busy.value || status.value === "connecting") return;

  error.value = "";
  status.value = "connecting";
  try {
    await wallet.connect();
    status.value = "connected";
  } catch (e) {
    status.value = "error";
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function fetchAddress() {
  if (busy.value) return;

  busy.value = true;
  error.value = "";
  balanceSats.value = null;
  try {
    account.value = await wallet.getAddress(path.value, {
      coin: coin.value,
      showOnDevice: showOnDevice.value,
    });

    // Read the L1/signet balance for the derived address so the test flow
    // (fund -> wait 1 block -> confirm balance) is visible in-UI. Unknown
    // addresses return totalSats 0n, so this is safe before funding.
    try {
      const bal = await getL1Balance(account.value.address);
      balanceSats.value = bal.totalSats;
    } catch {
      // Balance read is best-effort; do not block address display on it.
      balanceSats.value = null;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

// ---- hardware signing (Step 4) ----------------------------------------
// Signing is FREE for everyone (hardware:signing is in BASIC_FEATURES). The
// flow: fetch UTXOs -> coin-select -> build HardwareSignRequest -> sign on
// device -> review -> broadcast. No private key material ever leaves the device.

/** Flat signet fee rate (matches the software Send view). */
const FEE_RATE_SAT_PER_VB = 1;

const sendAddress = ref("");
const sendAmount = ref("");
const signing = ref(false);
const broadcasting = ref(false);
const signError = ref<string | null>(null);
const receipt = ref<BroadcastReceipt | null>(null);

interface HwBuiltTx {
  hex: string;
  txid: string;
  amountSatoshis: bigint;
  feeSatoshis: bigint;
}
const built = ref<HwBuiltTx | null>(null);

/** bitcoinjs-lib network object for the wallet's network (signet == testnet). */
const networkObj = computed(() =>
  walletNetwork === "mainnet"
    ? btcNetworks.bitcoin
    : walletNetwork === "regtest"
      ? btcNetworks.regtest
      : btcNetworks.testnet,
);

async function handleSign() {
  signing.value = true;
  signError.value = null;
  built.value = null;
  receipt.value = null;
  try {
    if (!account.value) {
      signError.value = "Connect and derive an address first.";
      return;
    }

    const amountSatoshis = parseCoinsToSats(sendAmount.value);

    // Fetch the full UTXO set for the derived address. If the adapter truncated
    // the set, refuse to build — coin selection from a partial set could
    // produce a transaction that fails to broadcast (missing inputs).
    const utxoSet = await getL1Utxos(account.value.address);
    if (utxoSet.truncated) {
      signError.value =
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

    // Change returns to the same key's P2WPKH scriptPubKey. We derive it from
    // the device-confirmed address (not from a host-side key) so the change
    // path is guaranteed to match what the device will sign for.
    const changeScriptPubKey = btcAddress
      .toOutputScript(account.value.address, networkObj.value)
      .toString("hex");

    const req: HardwareSignRequest = {
      network: walletNetwork,
      derivationPath: account.value.path,
      inputs: selection.selectedUtxos.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        amountSatoshis: u.amountSatoshis,
        scriptPubKey: u.scriptPubKey,
      })),
      toAddress: sendAddress.value.trim(),
      amountSatoshis,
      feeSatoshis: selection.feeSatoshis,
      changeScriptPubKey,
    };

    const signed = await wallet.signTransaction(req);
    built.value = {
      hex: signed.hex,
      txid: signed.txid,
      amountSatoshis,
      feeSatoshis: selection.feeSatoshis,
    };
  } catch (e) {
    signError.value = e instanceof Error ? e.message : String(e);
  } finally {
    signing.value = false;
  }
}

async function broadcast() {
  if (!built.value) return;
  broadcasting.value = true;
  signError.value = null;
  try {
    receipt.value = await broadcastTransaction(L1_CHAIN_ID, built.value.hex);
  } catch (e) {
    if (e instanceof ApiError) {
      signError.value = `Broadcast failed (${e.code}): ${e.message}`;
    } else {
      signError.value = e instanceof Error ? e.message : String(e);
    }
  } finally {
    broadcasting.value = false;
  }
}

function resetSign() {
  built.value = null;
  receipt.value = null;
  signError.value = null;
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <section class="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-xs uppercase tracking-widest text-ecash-500">OneKey integration</p>
          <h2 class="mt-1 text-3xl font-black">Hardware Wallet</h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
            Verify receive addresses directly on your OneKey device and prepare
            for higher-assurance signing workflows across the Drivechains
            Financial Hub.
          </p>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4 lg:w-72">
          <p class="text-xs uppercase tracking-widest text-gray-500">Device status</p>
          <div class="mt-3 flex items-center justify-between">
            <span class="text-sm font-semibold text-white">{{ wallet.name }}</span>
            <span
              class="rounded-full px-3 py-1 text-xs font-semibold"
              :class="{
                'bg-gray-800 text-gray-400': status === 'idle',
                'bg-yellow-900 text-yellow-300': status === 'connecting',
                'bg-ecash-900 text-ecash-400': status === 'connected',
                'bg-red-900 text-red-300': status === 'error',
              }"
            >
              {{ status }}
            </span>
          </div>
          <button
            class="mt-4 w-full rounded-lg bg-ecash-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-ecash-400 disabled:opacity-40"
            :disabled="busy || status === 'connecting'"
            @click="connect"
          >
            {{ status === "connected" ? "Reconnect OneKey" : "Connect OneKey" }}
          </button>
        </div>
      </div>
    </section>

    <section class="mt-5 grid gap-4 md:grid-cols-3">
      <div
        v-for="(item, i) in quickStart"
        :key="item"
        class="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-ecash-600 text-sm font-black text-white">
          {{ i + 1 }}
        </span>
        <p class="mt-3 text-sm font-semibold text-white">{{ item }}</p>
      </div>
    </section>

    <section class="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h3 class="font-semibold text-white">Address verification</h3>
        <p class="mt-1 text-xs text-gray-500">
          Chromium + HTTPS or localhost - WebUSB required
        </p>

        <div class="mt-5 space-y-4 rounded-lg border border-gray-800 bg-gray-950 p-4">
          <label class="block text-xs uppercase tracking-wide text-gray-500">
            Derivation path
            <input
              v-model="path"
              class="mt-1 w-full rounded bg-gray-800 p-2 font-mono text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-ecash-500"
            />
          </label>

          <label class="block text-xs uppercase tracking-wide text-gray-500">
            OneKey coin id
            <input
              v-model="coin"
              class="mt-1 w-full rounded bg-gray-800 p-2 font-mono text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-ecash-500"
            />
          </label>

          <label class="flex items-center gap-2 text-sm text-gray-300">
            <input v-model="showOnDevice" type="checkbox" />
            Show address on device for confirmation
          </label>

          <button
            class="rounded border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-40"
            :disabled="status !== "connected" || busy"
            @click="fetchAddress"
          >
            {{ busy ? "Waiting for device..." : "Show address" }}
          </button>
        </div>

        <div
          v-if="account"
          class="mt-5 rounded-lg border border-gray-800 bg-gray-950 p-4"
          data-test="hw-address"
        >
          <p class="mb-1 text-xs uppercase tracking-wide text-gray-500">Derived address</p>
          <p class="break-all font-mono text-sm text-ecash-400">{{ account.address }}</p>
          <p class="mt-2 break-all font-mono text-xs text-gray-600">{{ account.path }}</p>

          <div class="mt-3 flex items-center gap-2 border-t border-gray-800 pt-3">
            <span class="text-xs uppercase tracking-wide text-gray-500">Balance</span>
            <span class="font-mono text-sm font-semibold text-white">
              {{ balanceSats !== null ? satsToBtc(balanceSats) : "…" }}
            </span>
            <span class="text-xs text-gray-600">sBTC (signet)</span>
          </div>
        </div>

        <p v-if="error" class="mt-4 text-sm text-red-400" data-test="hw-error">
          {{ error }}
        </p>
      </div>

      <div class="space-y-5">
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h3 class="font-semibold text-white">Basic hardware tools</h3>
          <ul class="mt-3 space-y-2 text-sm text-gray-400">
            <li>[x] Device discovery</li>
            <li>[x] Address derivation</li>
            <li>[x] On-device address confirmation</li>
            <li>[x] Hardware signing (free for everyone)</li>
          </ul>
        </div>

        <ProGate
          title="Advanced hardware workflows with PRO"
          description="Sidecoin PRO adds multi-key policies, hardware-based split review, and historical signing analytics. Basic hardware signing is free for everyone."
          :benefits="[
            'Multi-key signing policies',
            'Hardware-based split review',
            'Historical signing analytics',
            'Platform-aware signing screens',
          ]"
          cta="Upgrade for advanced hardware tools"
        />
      </div>
    </section>

    <!-- Step 4: hardware sign + broadcast -->
    <section class="mt-5 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h3 class="font-semibold text-white">Sign &amp; send (hardware)</h3>
      <p class="mt-1 text-xs text-gray-500">
        Build and sign a transaction on the connected OneKey, then broadcast.
      </p>

      <div v-if="signError" class="mt-4 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
        {{ signError }}
      </div>

      <div v-if="!built" class="mt-5 grid gap-4 md:grid-cols-2">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-gray-300">Recipient Address</span>
          <input
            v-model="sendAddress"
            type="text"
            autocapitalize="none"
            autocomplete="off"
            spellcheck="false"
            placeholder="tb1q..."
            class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-gray-300">Amount (sBTC)</span>
          <input
            v-model="sendAmount"
            type="text"
            inputmode="decimal"
            placeholder="0.00000000"
            class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white placeholder-gray-600 focus:border-ecash-500 focus:outline-none"
          />
        </label>
      </div>

      <div v-if="!built" class="mt-5">
        <button
          type="button"
          :disabled="signing || !account || !sendAddress || !sendAmount"
          class="rounded-lg bg-ecash-600 px-6 py-3 text-sm font-black text-white hover:bg-ecash-500 disabled:cursor-not-allowed disabled:opacity-50"
          @click="handleSign"
        >
          {{ signing ? "Confirm on device…" : "Sign on device" }}
        </button>
        <p v-if="!account" class="mt-2 text-xs text-gray-500">
          Connect and derive an address first.
        </p>
      </div>

      <div v-else class="mt-5">
        <div v-if="!receipt" class="rounded-xl border border-gray-800 bg-gray-950 p-4 text-sm">
          <p class="text-xs uppercase tracking-widest text-gray-500">Review transaction</p>
          <h4 class="mt-2 text-lg font-black text-white">Signed on device, ready to broadcast</h4>
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <div class="rounded-lg border border-gray-800 bg-gray-900 p-3">
              <p class="text-xs text-gray-500">Amount</p>
              <p class="mt-1 font-mono font-black text-ecash-400">{{ satsToBtc(built.amountSatoshis) }}</p>
            </div>
            <div class="rounded-lg border border-gray-800 bg-gray-900 p-3">
              <p class="text-xs text-gray-500">Fee</p>
              <p class="mt-1 font-mono font-black text-gray-200">{{ satsToBtc(built.feeSatoshis) }}</p>
            </div>
          </div>
          <div v-if="built.txid" class="mt-3 rounded-lg border border-gray-800 bg-gray-900 p-3">
            <p class="mb-1 text-xs uppercase tracking-widest text-gray-500">Txid</p>
            <p class="break-all font-mono text-xs text-ecash-400">{{ built.txid }}</p>
          </div>
          <div class="mt-3">
            <label class="mb-1 block text-xs uppercase tracking-widest text-gray-500">
              Signed transaction hex
            </label>
            <textarea
              readonly
              rows="4"
              class="w-full break-all rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-xs text-gray-300"
              :value="built.hex"
            ></textarea>
          </div>
          <div class="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              :disabled="broadcasting"
              class="rounded-lg bg-ecash-600 px-6 py-3 text-sm font-black text-white hover:bg-ecash-500 disabled:opacity-50"
              @click="broadcast"
            >
              {{ broadcasting ? "Broadcasting…" : "Broadcast" }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-gray-700 bg-gray-800 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-700"
              @click="resetSign"
            >
              Back to edit
            </button>
          </div>
        </div>

        <div v-else class="rounded-xl border border-green-800 bg-green-950/30 p-4 text-sm text-green-400">
          <p class="text-xs font-black uppercase tracking-[0.25em] text-green-300">Broadcast receipt</p>
          <h4 class="mt-2 text-lg font-black text-white">
            Broadcast {{ receipt.accepted ? "accepted" : "submitted" }}
          </h4>
          <p class="mt-3 break-all">
            Txid: <span class="font-mono">{{ receipt.txid }}</span>
          </p>
          <button
            type="button"
            class="mt-4 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
            @click="resetSign"
          >
            Send another
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
