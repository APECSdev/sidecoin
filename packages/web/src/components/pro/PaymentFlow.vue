<!-- packages/web/src/components/pro/PaymentFlow.vue -->

<script setup lang="ts">
/**
 * PaymentFlow
 *
 * Full-page, white-label crypto checkout flow. The user NEVER sees
 * NOWPayments — every call goes to OUR API (/v1/pay/*), and the
 * QR/address/timer/status are rendered here under Sidecoin branding.
 *
 * Steps:
 *   1. details — identity public key (required), email (optional), duration
 *      quantity, and pay currency
 *   2. status  — address + QR + price-lock timer + status polling
 *
 * The identity public key (66-char hex, m/44'/1237'/0'/0/0) is the canonical
 * Founder identity; it is embedded in the order on the server.
 */

import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import {
  PLANS,
  FEATURED_CURRENCIES,
  createPayment,
  getPaymentStatus,
  getAvailableCurrencies,
  buildPaymentURI,
} from "@/lib/nowpayments";
import type { Plan, PaymentResponse, PaymentStatus } from "@/lib/nowpayments";

// ─── Configuration ───────────────────────────────────────────

const STATUS_POLL_INTERVAL_MS = 10_000;
const MAX_QUANTITY = 12;

// ─── Debug Logging ───────────────────────────────────────────

const DEBUG = import.meta.env.DEV;

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log("[pro:payment]", ...args);
  }
}

function debugError(...args: unknown[]): void {
  console.error("[pro:payment]", ...args);
}

// ─── State ───────────────────────────────────────────────────

type Step = "details" | "status";

const step = ref<Step>("details");
const selectedPlan = ref<Plan | null>(PLANS.monthly);

const publicKey = ref<string>("");
const email = ref<string>("");
const quantity = ref<number>(1);
const selectedCurrency = ref<string>(FEATURED_CURRENCIES[0] ?? "");

const allCurrencies = ref<string[]>([]);
const showAllCurrencies = ref(false);
const currenciesLoading = ref(false);

const paymentData = ref<PaymentResponse | null>(null);
const paymentStatus = ref<PaymentStatus | null>(null);
const paymentError = ref<string | null>(null);
const paymentLoading = ref(false);

const priceLockCountdown = ref("");

let statusPollTimer: ReturnType<typeof setInterval> | null = null;
let priceLockTimer: ReturnType<typeof setInterval> | null = null;

// ─── Computed ────────────────────────────────────────────────

const normalizedAvailableCurrencies = computed(() => {
  return new Set(allCurrencies.value.map((cur) => cur.toLowerCase()));
});

const featuredAvailableCurrencies = computed(() => {
  // Before live currencies load, show the conservative hardcoded defaults.
  if (normalizedAvailableCurrencies.value.size === 0) {
    return [...FEATURED_CURRENCIES];
  }

  return [...FEATURED_CURRENCIES].filter((cur) =>
    normalizedAvailableCurrencies.value.has(cur),
  );
});

const displayCurrencies = computed(() => {
  if (showAllCurrencies.value) {
    return allCurrencies.value;
  }

  return featuredAvailableCurrencies.value;
});

const currencyLabels: Record<string, string> = {
  btc: "Bitcoin (BTC)",
  eth: "Ethereum (ETH)",
  usdcerc20: "USDC (ERC-20)",
  usdterc20: "USDT (ERC-20)",
  ltc: "Litecoin (LTC)",
  xec: "eCash (XEC)",
  sol: "Solana (SOL)",
};

// 66-char hex compressed secp256k1 identity public key.
const publicKeyValid = computed(() => /^[0-9a-fA-F]{66}$/.test(publicKey.value.trim()));

const emailValid = computed(() => {
  const v = email.value.trim();
  return v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
});

const unitLabel = computed(() => {
  if (!selectedPlan.value) return "";
  const u = selectedPlan.value.periodUnit;
  return quantity.value === 1 ? u : `${u}s`;
});

const totalUsd = computed(() => {
  if (!selectedPlan.value) return 0;
  return selectedPlan.value.priceUSD * quantity.value;
});

const canSubmit = computed(
  () =>
    publicKeyValid.value &&
    emailValid.value &&
    !!selectedCurrency.value &&
    !paymentLoading.value &&
    displayCurrencies.value.length > 0,
);

const isTerminalStatus = computed(() => {
  if (!paymentStatus.value) return false;
  return ["finished", "failed", "refunded", "expired"].includes(
    paymentStatus.value.paymentStatus,
  );
});

const statusLabel = computed(() => {
  if (!paymentStatus.value) return "";
  const labels: Record<string, string> = {
    waiting: "Waiting for payment...",
    confirming: "Confirming transaction...",
    confirmed: "Payment confirmed!",
    sending: "Processing...",
    partially_paid: "Partial payment received",
    finished: "Payment complete! 🎉",
    failed: "Payment failed",
    refunded: "Payment refunded",
    expired: "Payment expired",
    unknown: "Waiting for payment...",
  };
  return labels[paymentStatus.value.paymentStatus] ?? paymentStatus.value.paymentStatus;
});

const statusColor = computed(() => {
  if (!paymentStatus.value) return "text-gray-400";
  const colors: Record<string, string> = {
    waiting: "text-amber-400",
    confirming: "text-amber-400",
    confirmed: "text-green-400",
    sending: "text-amber-400",
    partially_paid: "text-orange-400",
    finished: "text-green-400",
    failed: "text-red-400",
    refunded: "text-red-400",
    expired: "text-red-400",
    unknown: "text-gray-400",
  };
  return colors[paymentStatus.value.paymentStatus] ?? "text-gray-400";
});

// ─── Actions ─────────────────────────────────────────────────

/** Open the payment flow with a specific plan */
function openWithPlan(planId: string): void {
  const plan = PLANS[planId];
  if (!plan) {
    debugError("Unknown plan:", planId);
    return;
  }

  debug("Opening payment flow for plan:", planId);
  selectedPlan.value = plan;
  quantity.value = 1;
  paymentData.value = null;
  paymentStatus.value = null;
  paymentError.value = null;
  step.value = "details";
  ensureSelectedCurrency();

  nextTick(() => {
    document.getElementById("pro-checkout")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

/** Reset the full-page checkout back to the details step */
function resetCheckout(): void {
  debug("Resetting payment flow");
  paymentData.value = null;
  paymentStatus.value = null;
  paymentError.value = null;
  priceLockCountdown.value = "";
  step.value = "details";
  stopStatusPolling();
  stopPriceLockTimer();
}

/** Select a cryptocurrency (no network — amount is set at create time) */
function selectCurrency(currency: string): void {
  debug("Selected currency:", currency);
  selectedCurrency.value = currency;
  paymentError.value = null;
}

/** Clamp the duration quantity into [1, MAX_QUANTITY] */
function bumpQuantity(delta: number): void {
  const next = quantity.value + delta;
  quantity.value = Math.min(MAX_QUANTITY, Math.max(1, next));
}

function normalizeCurrencyList(currencies: string[]): string[] {
  return Array.from(
    new Set(
      currencies
        .map((cur) => cur.trim().toLowerCase())
        .filter((cur) => /^[a-z0-9]+$/.test(cur)),
    ),
  ).sort();
}

function ensureSelectedCurrency(): void {
  const available = displayCurrencies.value;

  if (available.length === 0) {
    selectedCurrency.value = "";
    return;
  }

  if (!available.includes(selectedCurrency.value)) {
    selectedCurrency.value = available[0];
  }
}

async function loadAvailableCurrencies(): Promise<void> {
  currenciesLoading.value = true;

  try {
    allCurrencies.value = normalizeCurrencyList(await getAvailableCurrencies());
    ensureSelectedCurrency();
    debug("Loaded", allCurrencies.value.length, "available currencies");
  } catch (err) {
    debugError("Failed to load available currencies:", err);
    // Keep conservative defaults if the currency endpoint is temporarily down.
    ensureSelectedCurrency();
  } finally {
    currenciesLoading.value = false;
  }
}

/** Create the payment via our API, then move to the status step */
async function createPaymentInvoice(): Promise<void> {
  if (!selectedPlan.value || !canSubmit.value) return;

  debug("Creating payment invoice");
  paymentLoading.value = true;
  paymentError.value = null;

  try {
    paymentData.value = await createPayment({
      plan: selectedPlan.value.id,
      quantity: quantity.value,
      publicKey: publicKey.value.trim().toLowerCase(),
      payCurrency: selectedCurrency.value,
      email: email.value.trim() || undefined,
    });
    debug("Payment created:", paymentData.value?.paymentId);

    step.value = "status";
    startStatusPolling();
    startPriceLockTimer();
  } catch (err) {
    debugError("createPaymentInvoice error:", err);
    paymentError.value =
      err instanceof Error
        ? err.message
        : "Failed to create payment. Please try again.";
  } finally {
    paymentLoading.value = false;
  }
}

/** Poll payment status */
async function pollStatus(): Promise<void> {
  if (!paymentData.value) return;

  try {
    paymentStatus.value = await getPaymentStatus(paymentData.value.paymentId);
    debug("Payment status:", paymentStatus.value?.paymentStatus);

    if (isTerminalStatus.value) {
      debug("Terminal status reached, stopping polling");
      stopStatusPolling();
      stopPriceLockTimer();
    }
  } catch (err) {
    debugError("pollStatus error:", err);
  }
}

/** Load all available currencies (proxied through our API) */
async function loadAllCurrencies(): Promise<void> {
  if (allCurrencies.value.length === 0) {
    await loadAvailableCurrencies();
  }

  showAllCurrencies.value = true;
  ensureSelectedCurrency();
}

// ─── Timers ──────────────────────────────────────────────────

function startStatusPolling(): void {
  stopStatusPolling();
  pollStatus(); // immediate first poll
  statusPollTimer = setInterval(pollStatus, STATUS_POLL_INTERVAL_MS);
  debug("Status polling started");
}

function stopStatusPolling(): void {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
    debug("Status polling stopped");
  }
}

function startPriceLockTimer(): void {
  stopPriceLockTimer();

  if (!paymentData.value?.expiresAt) return;

  const expiresAt = new Date(paymentData.value.expiresAt).getTime();

  function tick(): void {
    const diff = expiresAt - Date.now();
    if (diff <= 0) {
      priceLockCountdown.value = "Expired";
      stopPriceLockTimer();
      return;
    }
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    priceLockCountdown.value = `${m}:${s.toString().padStart(2, "0")}`;
  }

  tick();
  priceLockTimer = setInterval(tick, 1000);
  debug("Price lock timer started");
}

function stopPriceLockTimer(): void {
  if (priceLockTimer) {
    clearInterval(priceLockTimer);
    priceLockTimer = null;
    debug("Price lock timer stopped");
  }
}

// ─── Global Event Listener ───────────────────────────────────

/**
 * Listen for plan selection events from PricingCard buttons.
 * Buttons dispatch a custom event with the plan ID.
 */
function handlePlanSelect(event: Event): void {
  const target = event.target as HTMLElement;
  const button = target.closest("[data-action='select-plan']") as HTMLElement | null;
  if (button?.dataset.plan) {
    openWithPlan(button.dataset.plan);
  }
}

onMounted(() => {
  document.addEventListener("click", handlePlanSelect);
  loadAvailableCurrencies();
  debug("PaymentFlow mounted, listening for plan selections");
});

onUnmounted(() => {
  document.removeEventListener("click", handlePlanSelect);
  stopStatusPolling();
  stopPriceLockTimer();
  debug("PaymentFlow unmounted");
});
</script>

<template>
  <!-- Full-page checkout section -->
  <section id="pro-checkout" class="border-y border-gray-800 bg-gray-950/80">
    <div class="mx-auto max-w-5xl px-6 py-16">
      <div class="mx-auto max-w-2xl rounded-2xl border border-gray-800 bg-gray-950 p-8 shadow-2xl">
        <div class="mb-6 text-center">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            Checkout
          </p>
          <h2 class="mt-2 text-3xl font-bold text-white">
            Complete your Sidecoin Pro upgrade
          </h2>
          <p class="mt-2 text-sm text-gray-400">
            Crypto payment, no account required. Your public key is your Founder identity.
          </p>
        </div>

        <!-- ─── Step: Details ─────────────────────────── -->
        <div v-if="step === 'details'">
          <h3 class="text-xl font-bold text-white">Upgrade to Sidecoin Pro</h3>
          <p class="mt-1 text-sm text-gray-400">
            {{ selectedPlan?.label }} — ${{ selectedPlan?.priceUSD }} USD / {{ selectedPlan?.periodUnit }}
          </p>

          <!-- Identity public key (required) -->
          <div class="mt-6">
            <label class="block text-sm font-semibold text-white">
              Identity public key
            </label>
            <p class="mt-1 text-xs text-gray-500">
              Your Sidecoin identity key (Wallet → Settings). This is your
              permanent Founder identity.
            </p>
            <input
              v-model="publicKey"
              type="text"
              spellcheck="false"
              autocomplete="off"
              placeholder="02… (66 hex characters)"
              class="mt-2 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2.5 font-mono text-xs text-gray-200 placeholder-gray-600 focus:border-amber-600 focus:outline-none"
              :class="{ 'border-red-700': publicKey && !publicKeyValid }"
            />
            <p v-if="publicKey && !publicKeyValid" class="mt-1 text-xs text-red-400">
              Must be exactly 66 hexadecimal characters.
            </p>
          </div>

          <!-- Email (optional) -->
          <div class="mt-4">
            <label class="block text-sm font-semibold text-white">
              Email <span class="font-normal text-gray-500">(optional)</span>
            </label>
            <p class="mt-1 text-xs text-gray-500">
              For your receipt only. Never used as your identity.
            </p>
            <input
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              class="mt-2 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:border-amber-600 focus:outline-none"
              :class="{ 'border-red-700': email && !emailValid }"
            />
            <p v-if="email && !emailValid" class="mt-1 text-xs text-red-400">
              Please enter a valid email address.
            </p>
          </div>

          <!-- Duration quantity -->
          <div class="mt-4">
            <label class="block text-sm font-semibold text-white">Duration</label>
            <div class="mt-2 flex items-center gap-4">
              <div class="flex items-center rounded-lg border border-gray-800 bg-gray-900">
                <button
                  class="px-4 py-2 text-lg text-gray-400 hover:text-white disabled:opacity-40"
                  :disabled="quantity <= 1"
                  @click="bumpQuantity(-1)"
                  aria-label="Decrease duration"
                >−</button>
                <span class="w-10 text-center font-mono text-white">{{ quantity }}</span>
                <button
                  class="px-4 py-2 text-lg text-gray-400 hover:text-white disabled:opacity-40"
                  :disabled="quantity >= MAX_QUANTITY"
                  @click="bumpQuantity(1)"
                  aria-label="Increase duration"
                >+</button>
              </div>
              <span class="text-sm text-gray-400">{{ unitLabel }}</span>
              <span class="ml-auto text-right">
                <span class="text-2xl font-bold text-white">${{ totalUsd }}</span>
                <span class="text-xs text-gray-500"> USD total</span>
              </span>
            </div>
          </div>

          <!-- Currency selection -->
          <div class="mt-6">
            <div class="flex items-center justify-between gap-3">
              <label class="block text-sm font-semibold text-white">Pay with</label>
              <span v-if="currenciesLoading" class="text-xs text-gray-500">
                Checking live availability…
              </span>
            </div>

            <div v-if="displayCurrencies.length > 0" class="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <button
                v-for="cur in displayCurrencies"
                :key="cur"
                class="rounded-xl border border-gray-800 bg-gray-900 px-3 py-3 text-center text-sm font-semibold text-white transition-all hover:border-amber-700 hover:bg-gray-800"
                :class="{ 'border-amber-500 bg-amber-950/20': selectedCurrency === cur }"
                @click="selectCurrency(cur)"
              >
                <span class="block uppercase">{{ cur }}</span>
                <span class="mt-0.5 block text-[10px] text-gray-500">
                  {{ currencyLabels[cur] ?? cur.toUpperCase() }}
                </span>
              </button>
            </div>

            <div v-else class="mt-2 rounded-lg border border-red-900/50 bg-red-950/30 p-3">
              <p class="text-sm text-red-400">
                No supported crypto payment currencies are available right now.
                Please try again in a few minutes.
              </p>
            </div>

            <!-- More options -->
            <div class="mt-3 text-center" v-if="!showAllCurrencies">
              <button
                class="text-sm text-amber-400 transition-colors hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="currenciesLoading"
                @click="loadAllCurrencies"
              >
                {{ currenciesLoading ? "Loading..." : "More options →" }}
              </button>
            </div>
          </div>

          <!-- Submit -->
          <button
            class="mt-6 w-full rounded-lg bg-amber-500 py-3.5 text-sm font-bold text-gray-950 transition-all hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canSubmit"
            @click="createPaymentInvoice"
          >
            {{ paymentLoading ? "Creating Invoice..." : "Generate Payment Address" }}
          </button>

          <!-- Payment error -->
          <div v-if="paymentError" class="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 p-3">
            <p class="text-sm text-red-400">{{ paymentError }}</p>
          </div>
        </div>

        <!-- ─── Step: Status / QR Code ────────────────── -->
        <div v-if="step === 'status' && paymentData">
          <h3 class="text-xl font-bold text-white">Send Payment</h3>

          <!-- QR code (address URI) -->
          <div class="mt-6 flex flex-col items-center gap-4">
            <!-- NOTE: QR rendered via a generic QR image service (NOT
                 NOWPayments). Consider a client-side QR lib later to avoid
                 sending the pay address to a third party. -->
            <div class="rounded-xl border border-gray-800 bg-white p-4">
              <img
                :src="`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(buildPaymentURI(paymentData.payCurrency, paymentData.payAddress, paymentData.payAmount))}`"
                :alt="`QR code for ${paymentData.payCurrency} payment`"
                class="h-48 w-48"
                loading="eager"
              />
            </div>

            <!-- Amount -->
            <div class="text-center">
              <p class="text-xs uppercase tracking-widest text-gray-500">Send exactly</p>
              <p class="mt-1 font-mono text-2xl font-bold text-white">
                {{ paymentData.payAmount }}
                <span class="text-sm uppercase text-amber-400">{{ paymentData.payCurrency }}</span>
              </p>
              <p class="mt-1 text-xs text-gray-500">≈ ${{ paymentData.priceAmountUsd }} USD</p>
            </div>

            <!-- Address -->
            <div class="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
              <p class="mb-1 text-xs text-gray-500">To address:</p>
              <p class="select-all break-all font-mono text-xs text-gray-300">
                {{ paymentData.payAddress }}
              </p>
            </div>

            <!-- Price lock timer -->
            <div v-if="priceLockCountdown" class="text-center">
              <p class="text-xs text-gray-500">Price locked for</p>
              <p
                class="font-mono text-lg font-bold"
                :class="priceLockCountdown === 'Expired' ? 'text-red-400' : 'text-amber-400'"
              >
                {{ priceLockCountdown }}
              </p>
            </div>
          </div>

          <!-- Status -->
          <div class="mt-6 rounded-lg border border-gray-800 bg-gray-900 p-4 text-center">
            <p class="mb-2 text-xs uppercase tracking-widest text-gray-500">Status</p>

            <!-- Loading spinner while no status yet -->
            <div v-if="!paymentStatus" class="flex items-center justify-center gap-2">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-amber-400"></div>
              <span class="text-sm text-gray-400">Waiting for payment...</span>
            </div>

            <!-- Status display -->
            <p v-else class="text-lg font-semibold" :class="statusColor">
              {{ statusLabel }}
            </p>

            <!-- Partial payment info -->
            <p
              v-if="paymentStatus?.paymentStatus === 'partially_paid'"
              class="mt-2 text-xs text-orange-400"
            >
              Received {{ paymentStatus.actuallyPaid }} / {{ paymentStatus.payAmount }}
              {{ paymentStatus.payCurrency?.toUpperCase() }}
            </p>
          </div>

          <!-- Success message -->
          <div
            v-if="paymentStatus?.paymentStatus === 'finished'"
            class="mt-6 rounded-lg border border-green-900/50 bg-green-950/20 p-4 text-center"
          >
            <p class="text-sm text-green-400">
              Welcome to Sidecoin Pro!
              <template v-if="paymentStatus.founderNumber">
                You are Founder #{{ paymentStatus.founderNumber }}.
              </template>
            </p>
            <a
              href="/founders"
              class="mt-3 inline-block rounded-lg bg-green-600 px-5 py-2 text-sm font-bold text-white transition-all hover:bg-green-500"
            >
              View the Founders Leaderboard →
            </a>
          </div>

          <!-- Failure message -->
          <div
            v-if="paymentStatus?.paymentStatus === 'failed' || paymentStatus?.paymentStatus === 'expired'"
            class="mt-4 text-center"
          >
            <button
              class="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-bold text-gray-950 transition-all hover:bg-amber-400"
              @click="resetCheckout"
            >
              Try Again
            </button>
          </div>

          <!-- Payment ID (debug) -->
          <p class="mt-4 text-center text-xs text-gray-600">
            Payment ID: {{ paymentData.paymentId }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
