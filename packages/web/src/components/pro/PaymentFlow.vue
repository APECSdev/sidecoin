<!-- packages/web/src/components/pro/PaymentFlow.vue -->

<script setup lang="ts">
/**
 * PaymentFlow
 *
 * Multi-step crypto payment flow using NOWPayments API.
 *
 * Steps:
 *   1. Select plan (pre-selected via button click)
 *   2. Select cryptocurrency
 *   3. Payment details (address, QR, timer)
 *   4. Confirmation / status polling
 *
 * ⚠️  The actual payment creation (createPayment) MUST go through
 *     a server-side proxy that holds the NOWPayments API key.
 *     This component calls YOUR endpoint, not NOWPayments directly.
 */

import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import {
  PLANS,
  FEATURED_CURRENCIES,
  getEstimate,
  getAvailableCurrencies,
  buildPaymentURI,
} from "@/lib/nowpayments";
import type { Plan, PaymentResponse, PaymentStatus } from "@/lib/nowpayments";

// ─── Configuration ───────────────────────────────────────────

const PAYMENT_API_PROXY =
  import.meta.env.PUBLIC_PAYMENT_API_URL ?? "/api/payment";

const STATUS_POLL_INTERVAL_MS = 10_000;

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

type Step = "closed" | "plan" | "currency" | "payment" | "status";

const step = ref<Step>("closed");
const selectedPlan = ref<Plan | null>(null);
const selectedCurrency = ref<string>("");
const estimatedAmount = ref<number>(0);
const estimateLoading = ref(false);
const estimateError = ref<string | null>(null);

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

const displayCurrencies = computed(() => {
  if (showAllCurrencies.value) {
    return allCurrencies.value;
  }
  return [...FEATURED_CURRENCIES];
});

const currencyLabels: Record<string, string> = {
  btc: "Bitcoin (BTC)",
  eth: "Ethereum (ETH)",
  usdcerc20: "USDC (ERC-20)",
  ltc: "Litecoin (LTC)",
};

const isTerminalStatus = computed(() => {
  if (!paymentStatus.value) return false;
  return ["finished", "failed", "refunded", "expired"].includes(
    paymentStatus.value.payment_status,
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
  };
  return labels[paymentStatus.value.payment_status] ?? paymentStatus.value.payment_status;
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
  };
  return colors[paymentStatus.value.payment_status] ?? "text-gray-400";
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
  selectedCurrency.value = "";
  estimatedAmount.value = 0;
  estimateError.value = null;
  paymentData.value = null;
  paymentStatus.value = null;
  paymentError.value = null;
  step.value = "currency";
}

/** Close the payment flow */
function close(): void {
  debug("Closing payment flow");
  step.value = "closed";
  stopStatusPolling();
  stopPriceLockTimer();
}

/** Select a cryptocurrency and fetch estimate */
async function selectCurrency(currency: string): void {
  debug("Selected currency:", currency);
  selectedCurrency.value = currency;
  estimateError.value = null;
  estimateLoading.value = true;

  try {
    const est = await getEstimate(selectedPlan.value!.priceUSD, currency);
    estimatedAmount.value = est.estimated_amount;
    debug("Estimated amount:", est.estimated_amount, currency);
    step.value = "payment";
  } catch (err) {
    debugError("Estimate failed:", err);
    estimateError.value = "Failed to get price estimate. Please try again.";
  } finally {
    estimateLoading.value = false;
  }
}

/** Create the payment via server-side proxy */
async function createPaymentInvoice(): Promise<void> {
  if (!selectedPlan.value || !selectedCurrency.value) return;

  debug("Creating payment invoice");
  paymentLoading.value = true;
  paymentError.value = null;

  try {
    const orderId = `pro-${selectedPlan.value.id}-${Date.now()}`;

    const res = await fetch(`${PAYMENT_API_PROXY}/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: selectedPlan.value.priceUSD,
        price_currency: "usd",
        pay_currency: selectedCurrency.value,
        order_id: orderId,
        order_description: selectedPlan.value.label,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      debugError("Payment creation failed:", res.status, body);
      throw new Error(`Payment creation failed: ${res.status}`);
    }

    paymentData.value = await res.json();
    debug("Payment created:", paymentData.value?.payment_id);

    step.value = "status";
    startStatusPolling();
    startPriceLockTimer();
  } catch (err) {
    debugError("createPaymentInvoice error:", err);
    paymentError.value = "Failed to create payment. Please try again.";
  } finally {
    paymentLoading.value = false;
  }
}

/** Poll payment status */
async function pollStatus(): Promise<void> {
  if (!paymentData.value) return;

  try {
    const res = await fetch(
      `${PAYMENT_API_PROXY}/status/${paymentData.value.payment_id}`,
    );

    if (!res.ok) {
      debugError("Status poll failed:", res.status);
      return;
    }

    paymentStatus.value = await res.json();
    debug("Payment status:", paymentStatus.value?.payment_status);

    if (isTerminalStatus.value) {
      debug("Terminal status reached, stopping polling");
      stopStatusPolling();
      stopPriceLockTimer();
    }
  } catch (err) {
    debugError("pollStatus error:", err);
  }
}

/** Load all available currencies */
async function loadAllCurrencies(): Promise<void> {
  if (allCurrencies.value.length > 0) {
    showAllCurrencies.value = true;
    return;
  }

  currenciesLoading.value = true;
  try {
    allCurrencies.value = await getAvailableCurrencies();
    showAllCurrencies.value = true;
    debug("Loaded", allCurrencies.value.length, "currencies");
  } catch (err) {
    debugError("Failed to load currencies:", err);
  } finally {
    currenciesLoading.value = false;
  }
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

  if (!paymentData.value?.expiration_estimate_date) return;

  const expiresAt = new Date(paymentData.value.expiration_estimate_date).getTime();

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
  <!-- Modal overlay -->
  <Teleport to="body">
    <div
      v-if="step !== 'closed'"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      @click.self="close"
    >
      <div class="relative mx-4 w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-950 p-8 shadow-2xl">

        <!-- Close button -->
        <button
          class="absolute right-4 top-4 text-gray-500 hover:text-white transition-colors"
          @click="close"
          aria-label="Close payment flow"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- ─── Step: Currency Selection ──────────────── -->
        <div v-if="step === 'currency'">
          <h3 class="text-xl font-bold text-white">Select Payment Currency</h3>
          <p class="mt-1 text-sm text-gray-400">
            {{ selectedPlan?.label }} — ${{ selectedPlan?.priceUSD }} USD
          </p>

          <!-- Featured currencies -->
          <div class="mt-6 grid grid-cols-2 gap-3">
            <button
              v-for="cur in displayCurrencies"
              :key="cur"
              class="rounded-xl border border-gray-800 bg-gray-900 px-4 py-4 text-center text-sm font-semibold text-white transition-all hover:border-amber-700 hover:bg-gray-800"
              :class="{ 'border-amber-500 bg-amber-950/20': selectedCurrency === cur }"
              @click="selectCurrency(cur)"
            >
              <span class="block text-lg uppercase">{{ cur }}</span>
              <span class="block text-xs text-gray-500 mt-1">
                {{ currencyLabels[cur] ?? cur.toUpperCase() }}
              </span>
            </button>
          </div>

          <!-- More options -->
          <div class="mt-4 text-center" v-if="!showAllCurrencies">
            <button
              class="text-sm text-amber-400 hover:text-amber-300 transition-colors"
              :disabled="currenciesLoading"
              @click="loadAllCurrencies"
            >
              {{ currenciesLoading ? "Loading..." : "More options →" }}
            </button>
          </div>

          <!-- Estimate loading -->
          <div v-if="estimateLoading" class="mt-6 text-center">
            <div class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-amber-400"></div>
            <p class="mt-2 text-sm text-gray-400">Fetching price...</p>
          </div>

          <!-- Estimate error -->
          <div v-if="estimateError" class="mt-4 rounded-lg bg-red-950/30 border border-red-900/50 p-3">
            <p class="text-sm text-red-400">{{ estimateError }}</p>
          </div>
        </div>

        <!-- ─── Step: Payment Details ─────────────────── -->
        <div v-if="step === 'payment'">
          <h3 class="text-xl font-bold text-white">Confirm Payment</h3>
          <p class="mt-1 text-sm text-gray-400">
            {{ selectedPlan?.label }}
          </p>

          <!-- Amount summary -->
          <div class="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-6 text-center">
            <p class="text-xs uppercase tracking-widest text-gray-500">Amount Due</p>
            <p class="mt-2 text-3xl font-bold text-white font-mono">
              {{ estimatedAmount }}
              <span class="text-lg text-amber-400 uppercase">{{ selectedCurrency }}</span>
            </p>
            <p class="mt-1 text-xs text-gray-500">
              ≈ ${{ selectedPlan?.priceUSD }} USD
            </p>
          </div>

          <!-- Confirm button -->
          <button
            class="mt-6 w-full rounded-lg bg-amber-500 py-3.5 text-sm font-bold text-gray-950 transition-all hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="paymentLoading"
            @click="createPaymentInvoice"
          >
            {{ paymentLoading ? "Creating Invoice..." : "Generate Payment Address" }}
          </button>

          <!-- Back -->
          <button
            class="mt-3 w-full text-center text-sm text-gray-500 hover:text-white transition-colors"
            @click="step = 'currency'"
          >
            ← Change currency
          </button>

          <!-- Payment error -->
          <div v-if="paymentError" class="mt-4 rounded-lg bg-red-950/30 border border-red-900/50 p-3">
            <p class="text-sm text-red-400">{{ paymentError }}</p>
          </div>
        </div>

        <!-- ─── Step: Status / QR Code ────────────────── -->
        <div v-if="step === 'status' && paymentData">
          <h3 class="text-xl font-bold text-white">Send Payment</h3>

          <!-- QR code (address URI) -->
          <div class="mt-6 flex flex-col items-center gap-4">
            <!-- Address QR — uses a client-side QR generator or image fallback -->
            <div class="rounded-xl border border-gray-800 bg-white p-4">
              <img
                :src="`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(buildPaymentURI(selectedCurrency, paymentData.pay_address, paymentData.pay_amount))}`"
                :alt="`QR code for ${selectedCurrency} payment`"
                class="h-48 w-48"
                loading="eager"
              />
            </div>

            <!-- Amount -->
            <div class="text-center">
              <p class="text-xs uppercase tracking-widest text-gray-500">Send exactly</p>
              <p class="mt-1 text-2xl font-bold text-white font-mono">
                {{ paymentData.pay_amount }}
                <span class="text-sm text-amber-400 uppercase">{{ paymentData.pay_currency }}</span>
              </p>
            </div>

            <!-- Address -->
            <div class="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
              <p class="text-xs text-gray-500 mb-1">To address:</p>
              <p class="break-all font-mono text-xs text-gray-300 select-all">
                {{ paymentData.pay_address }}
              </p>
            </div>

            <!-- Price lock timer -->
            <div v-if="priceLockCountdown" class="text-center">
              <p class="text-xs text-gray-500">Price locked for</p>
              <p class="font-mono text-lg font-bold" :class="priceLockCountdown === 'Expired' ? 'text-red-400' : 'text-amber-400'">
                {{ priceLockCountdown }}
              </p>
            </div>
          </div>

          <!-- Status -->
          <div class="mt-6 rounded-lg border border-gray-800 bg-gray-900 p-4 text-center">
            <p class="text-xs uppercase tracking-widest text-gray-500 mb-2">Status</p>

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
              v-if="paymentStatus?.payment_status === 'partially_paid'"
              class="mt-2 text-xs text-orange-400"
            >
              Received {{ paymentStatus.actually_paid }} / {{ paymentStatus.pay_amount }}
              {{ paymentStatus.pay_currency?.toUpperCase() }}
            </p>
          </div>

          <!-- Success message -->
          <div
            v-if="paymentStatus?.payment_status === 'finished'"
            class="mt-6 rounded-lg border border-green-900/50 bg-green-950/20 p-4 text-center"
          >
            <p class="text-sm text-green-400">
              Your Founding Member status has been activated.
              Welcome to Sidecoin Pro!
            </p>
          </div>

          <!-- Failure message -->
          <div
            v-if="paymentStatus?.payment_status === 'failed' || paymentStatus?.payment_status === 'expired'"
            class="mt-4 text-center"
          >
            <button
              class="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-bold text-gray-950 transition-all hover:bg-amber-400"
              @click="step = 'currency'"
            >
              Try Again
            </button>
          </div>

          <!-- Payment ID (debug) -->
          <p class="mt-4 text-center text-xs text-gray-600">
            Payment ID: {{ paymentData.payment_id }}
          </p>
        </div>

      </div>
    </div>
  </Teleport>
</template>
