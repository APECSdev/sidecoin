<!-- packages/web/src/components/pro/PaymentFlow.vue -->

<script setup lang="ts">
/**
 * PaymentFlow
 *
 * Full-page, white-label crypto checkout flow. The user NEVER sees
 * NOWPayments — every call goes to OUR API (/v1/pay/*), and the
 * QR/address/timer/status are rendered here under Sidecoin branding.
 *
 * Temporary production policy:
 *   - Monthly checkout minimum is 2 months ($10) while NOWPayments outcome
 *     routing is still effectively XMR and $5 is below the processor minimum.
 *   - Yearly checkout remains 1 year ($36).
 *
 * Steps:
 *   1. details — identity public key (required), email disabled until Resend
 *      receipt wiring is complete, duration quantity, and pay currency
 *   2. status  — address + QR + price-lock timer + status polling
 */

import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import {
  PLANS,
  FEATURED_CURRENCIES,
  PaymentApiError,
  createPayment,
  getPaymentStatus,
  getAvailableCurrencies,
  buildPaymentURI,
} from "@/lib/nowpayments";
import type { Plan, PaymentResponse, PaymentStatus } from "@/lib/nowpayments";

// ─── Configuration ───────────────────────────────────────────

const STATUS_POLL_INTERVAL_MS = 10_000;
const MAX_QUANTITY = 12;
const MIN_MONTHLY_QUANTITY = 2;
const MIN_YEARLY_QUANTITY = 1;
const MAX_SEARCH_RESULTS = 24;

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
// TODO: Wire receipt email through Resend before enabling this field.
const email = ref<string>("");
const quantity = ref<number>(MIN_MONTHLY_QUANTITY);
const selectedCurrency = ref<string>(FEATURED_CURRENCIES[0] ?? "");
const currencySearch = ref<string>("");

const allCurrencies = ref<string[]>([]);
const currenciesLoading = ref(false);

const paymentData = ref<PaymentResponse | null>(null);
const paymentStatus = ref<PaymentStatus | null>(null);
const paymentError = ref<string | null>(null);
const paymentLoading = ref(false);

const errorDialogOpen = ref(false);
const errorDialogTitle = ref("Payment could not be created");
const errorDialogMessage = ref("");

const priceLockCountdown = ref("");

let statusPollTimer: ReturnType<typeof setInterval> | null = null;
let priceLockTimer: ReturnType<typeof setInterval> | null = null;

// ─── Computed ────────────────────────────────────────────────

const normalizedAvailableCurrencies = computed(() => {
  return new Set(allCurrencies.value.map((cur) => cur.toLowerCase()));
});

const displayCurrencies = computed(() => {
  // Before live currencies load, show the curated temporary-safe list.
  if (normalizedAvailableCurrencies.value.size === 0) {
    return [...FEATURED_CURRENCIES];
  }

  return [...FEATURED_CURRENCIES].filter((cur) =>
    normalizedAvailableCurrencies.value.has(cur),
  );
});

const featuredCurrencySet = computed(() => {
  return new Set(FEATURED_CURRENCIES.map((cur) => cur.toLowerCase()));
});

const searchedCurrencies = computed(() => {
  const q = currencySearch.value.trim().toLowerCase();

  if (q.length < 2) return [];

  return allCurrencies.value
    .filter((cur) => !featuredCurrencySet.value.has(cur))
    .filter((cur) => {
      const label = currencyLabels[cur] ?? cur.toUpperCase();
      return cur.includes(q) || label.toLowerCase().includes(q);
    })
    .slice(0, MAX_SEARCH_RESULTS);
});

const selectedCurrencyKnown = computed(() => {
  if (!selectedCurrency.value) return false;
  if (displayCurrencies.value.includes(selectedCurrency.value)) return true;
  if (normalizedAvailableCurrencies.value.size === 0) return true;
  return normalizedAvailableCurrencies.value.has(selectedCurrency.value);
});

const currencyLabels: Record<string, string> = {
  btc: "Bitcoin (BTC)",
  eth: "Ethereum (ETH)",
  ltc: "Litecoin (LTC)",
  xmr: "Monero (XMR)",
  usdterc20: "USDT (Ethereum)",
  dash: "Dash",
  trx: "TRON (TRX)",
  xlm: "Stellar (XLM)",
  xrp: "XRP",
  bch: "Bitcoin Cash (BCH)",
  doge: "Dogecoin (DOGE)",
  maticmainnet: "Polygon (MATIC)",
  bnbbsc: "BNB Smart Chain",
  usdttrc20: "USDT (TRC-20)",
  usdcsol: "USDC (Solana)",
};

const currencySymbols: Record<string, string> = {
  btc: "₿",
  eth: "Ξ",
  ltc: "Ł",
  xmr: "ɱ",
  usdterc20: "₮",
  dash: "D",
  trx: "T",
  xlm: "★",
  xrp: "X",
  bch: "Ƀ",
  doge: "Ð",
  maticmainnet: "M",
  bnbbsc: "B",
  usdttrc20: "₮",
  usdcsol: "$",
};

const currencyLogoClasses: Record<string, string> = {
  btc: "bg-orange-500 text-white",
  eth: "bg-indigo-500 text-white",
  ltc: "bg-slate-400 text-gray-950",
  xmr: "bg-orange-600 text-white",
  usdterc20: "bg-emerald-500 text-white",
  dash: "bg-blue-500 text-white",
  trx: "bg-red-600 text-white",
  xlm: "bg-gray-100 text-gray-950",
  xrp: "bg-gray-700 text-white",
  bch: "bg-green-500 text-white",
  doge: "bg-yellow-500 text-gray-950",
  maticmainnet: "bg-purple-500 text-white",
  bnbbsc: "bg-yellow-400 text-gray-950",
  usdttrc20: "bg-emerald-500 text-white",
  usdcsol: "bg-blue-600 text-white",
};

const currencyNetworkLabels: Record<string, string> = {
  usdterc20: "ETH",
  usdttrc20: "TRX",
  usdcsol: "SOL",
  maticmainnet: "Polygon",
  bnbbsc: "BSC",
};

const publicKeyValid = computed(() => /^[0-9a-fA-F]{66}$/.test(publicKey.value.trim()));

const emailValid = computed(() => {
  const v = email.value.trim();
  return v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
});

const minQuantity = computed(() => {
  if (selectedPlan.value?.id === "yearly") return MIN_YEARLY_QUANTITY;
  return MIN_MONTHLY_QUANTITY;
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
    selectedCurrencyKnown.value &&
    !paymentLoading.value,
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

// ─── Helpers ─────────────────────────────────────────────────

function minQuantityForPlan(plan: Plan): number {
  return plan.id === "yearly" ? MIN_YEARLY_QUANTITY : MIN_MONTHLY_QUANTITY;
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

function currencyDisplayCode(currency: string): string {
  if (currency === "usdterc20") return "USDT";
  if (currency === "usdttrc20") return "USDT";
  if (currency === "usdcsol") return "USDC";
  if (currency === "maticmainnet") return "MATIC";
  if (currency === "bnbbsc") return "BNB";
  return currency.toUpperCase();
}

function currencySymbol(currency: string): string {
  return currencySymbols[currency] ?? currency.slice(0, 1).toUpperCase();
}

function currencyLogoClass(currency: string): string {
  return currencyLogoClasses[currency] ?? "bg-gray-700 text-white";
}

function openErrorDialog(message: string, title = "Payment could not be created"): void {
  errorDialogTitle.value = title;
  errorDialogMessage.value = message;
  errorDialogOpen.value = true;
}

function closeErrorDialog(): void {
  errorDialogOpen.value = false;
}

function userMessageForPaymentError(err: unknown): string {
  if (err instanceof PaymentApiError) {
    if (err.code === "amount_below_minimum") {
      return err.message;
    }

    if (err.code === "unsupported_currency") {
      return err.message;
    }

    if (err.code === "payment_provider_error") {
      return "The crypto payment processor could not create this payment. Please try another currency or try again in a few minutes.";
    }

    return err.message;
  }

  if (err instanceof Error) {
    return err.message;
  }

  return "Failed to create payment. Please try again.";
}

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
  quantity.value = minQuantityForPlan(plan);
  paymentData.value = null;
  paymentStatus.value = null;
  paymentError.value = null;
  priceLockCountdown.value = "";
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

/** Select a cryptocurrency */
function selectCurrency(currency: string): void {
  debug("Selected currency:", currency);
  selectedCurrency.value = currency;
  paymentError.value = null;
}

/** Clamp the duration quantity into [minQuantity, MAX_QUANTITY] */
function bumpQuantity(delta: number): void {
  const next = quantity.value + delta;
  quantity.value = Math.min(MAX_QUANTITY, Math.max(minQuantity.value, next));
}

async function loadAvailableCurrencies(): Promise<void> {
  currenciesLoading.value = true;

  try {
    allCurrencies.value = normalizeCurrencyList(await getAvailableCurrencies());
    ensureSelectedCurrency();
    debug("Loaded", allCurrencies.value.length, "available currencies");
  } catch (err) {
    debugError("Failed to load available currencies:", err);
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
    });
    debug("Payment created:", paymentData.value?.paymentId);

    step.value = "status";
    startStatusPolling();
    startPriceLockTimer();
  } catch (err) {
    debugError("createPaymentInvoice error:", err);
    const message = userMessageForPaymentError(err);
    paymentError.value = message;
    openErrorDialog(message);
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

// ─── Timers ──────────────────────────────────────────────────

function startStatusPolling(): void {
  stopStatusPolling();
  pollStatus();
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
  <!-- Error popup -->
  <Teleport to="body">
    <div
      v-if="errorDialogOpen"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      @click.self="closeErrorDialog"
    >
      <div class="w-full max-w-md rounded-2xl border border-red-900/60 bg-gray-950 p-6 shadow-2xl">
        <div class="flex items-start gap-4">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-950 text-red-300">
            !
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-lg font-bold text-white">{{ errorDialogTitle }}</h3>
            <p class="mt-2 text-sm leading-6 text-gray-300">
              {{ errorDialogMessage }}
            </p>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-gray-500 hover:text-white"
            @click="closeErrorDialog"
          >
            Close
          </button>
          <button
            class="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-gray-950 transition hover:bg-amber-400"
            @click="closeErrorDialog"
          >
            Choose another option
          </button>
        </div>
      </div>
    </div>
  </Teleport>

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

          <!-- Identity public key -->
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

          <!-- Email -->
          <div class="mt-4">
            <label class="block text-sm font-semibold text-white">
              Email <span class="font-normal text-gray-500">(coming later)</span>
            </label>
            <p class="mt-1 text-xs text-gray-500">
              Receipt emails will be enabled after Resend is wired in.
            </p>
            <input
              v-model="email"
              type="email"
              autocomplete="off"
              disabled
              placeholder="Receipt email coming later"
              class="mt-2 w-full cursor-not-allowed rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2.5 text-sm text-gray-500 placeholder-gray-600 opacity-70 focus:outline-none"
            />
          </div>

          <!-- Duration quantity -->
          <div class="mt-4">
            <label class="block text-sm font-semibold text-white">Duration</label>
            <div class="mt-2 flex items-center gap-4">
              <div class="flex items-center rounded-lg border border-gray-800 bg-gray-900">
                <button
                  class="px-4 py-2 text-lg text-gray-400 hover:text-white disabled:opacity-40"
                  :disabled="quantity <= minQuantity"
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

            <div
              v-if="selectedPlan?.id === 'monthly'"
              class="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3"
            >
              <p class="text-xs leading-5 text-amber-200">
                2-month minimum for crypto processing.
              </p>
            </div>
          </div>

          <!-- Currency selection -->
          <div class="mt-6">
            <div class="flex items-center justify-between gap-3">
              <label class="block text-sm font-semibold text-white">Pay with</label>
              <span v-if="currenciesLoading" class="text-xs text-gray-500">
                Checking availability…
              </span>
            </div>

            <div v-if="displayCurrencies.length > 0" class="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <button
                v-for="cur in displayCurrencies"
                :key="cur"
                class="relative rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-all"
                :class="
                  selectedCurrency === cur
                    ? 'border-amber-400 bg-amber-500/15 text-white shadow-lg shadow-amber-950/40 ring-2 ring-amber-400/70'
                    : 'border-gray-800 bg-gray-900 text-white hover:border-amber-700 hover:bg-gray-800'
                "
                @click="selectCurrency(cur)"
              >
                <span
                  v-if="selectedCurrency === cur"
                  class="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-xs font-black text-gray-950"
                  aria-hidden="true"
                >
                  ✓
                </span>
                <span class="flex items-center gap-3">
                  <span
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-black"
                    :class="currencyLogoClass(cur)"
                    aria-hidden="true"
                  >
                    {{ currencySymbol(cur) }}
                  </span>
                  <span class="min-w-0">
                    <span class="block uppercase">{{ currencyDisplayCode(cur) }}</span>
                    <span class="mt-0.5 block truncate text-[10px] text-gray-500">
                      {{ currencyLabels[cur] ?? cur.toUpperCase() }}
                    </span>
                    <span
                      v-if="currencyNetworkLabels[cur]"
                      class="mt-1 inline-flex rounded-full border border-gray-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-gray-400"
                    >
                      {{ currencyNetworkLabels[cur] }}
                    </span>
                  </span>
                </span>
              </button>
            </div>

            <div v-else class="mt-2 rounded-lg border border-red-900/50 bg-red-950/30 p-3">
              <p class="text-sm text-red-400">
                No supported crypto payment currencies are available right now.
                Please try again in a few minutes.
              </p>
            </div>

            <div class="mt-5 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <label class="block text-xs font-semibold uppercase tracking-widest text-gray-500">
                More currencies
              </label>
              <input
                v-model="currencySearch"
                type="search"
                autocomplete="off"
                spellcheck="false"
                placeholder="Search provider-supported currencies..."
                class="mt-2 w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:border-amber-600 focus:outline-none"
              />
              <p class="mt-2 text-xs leading-5 text-gray-500">
                Additional currencies may have higher processor minimums. If one
                fails, choose a featured option or increase duration.
              </p>

              <div v-if="searchedCurrencies.length > 0" class="mt-3 max-h-56 overflow-y-auto rounded-lg border border-gray-800">
                <button
                  v-for="cur in searchedCurrencies"
                  :key="cur"
                  class="flex w-full items-center gap-3 border-b border-gray-800 px-3 py-2.5 text-left text-sm transition last:border-b-0"
                  :class="
                    selectedCurrency === cur
                      ? 'bg-amber-500/15 text-white'
                      : 'bg-gray-950 text-gray-300 hover:bg-gray-900 hover:text-white'
                  "
                  @click="selectCurrency(cur)"
                >
                  <span
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
                    :class="currencyLogoClass(cur)"
                    aria-hidden="true"
                  >
                    {{ currencySymbol(cur) }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block font-semibold uppercase">
                      {{ currencyDisplayCode(cur) }}
                    </span>
                    <span class="block truncate text-xs text-gray-500">
                      {{ currencyLabels[cur] ?? cur.toUpperCase() }}
                    </span>
                  </span>
                  <span
                    v-if="selectedCurrency === cur"
                    class="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-black text-gray-950"
                  >
                    Selected
                  </span>
                </button>
              </div>

              <p
                v-if="currencySearch.trim().length >= 2 && searchedCurrencies.length === 0"
                class="mt-3 text-xs text-gray-500"
              >
                No matching provider-supported currencies found.
              </p>
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

          <!-- Payment error inline backup -->
          <div v-if="paymentError" class="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 p-3">
            <p class="text-sm text-red-400">{{ paymentError }}</p>
          </div>
        </div>

        <!-- ─── Step: Status / QR Code ────────────────── -->
        <div v-if="step === 'status' && paymentData">
          <h3 class="text-xl font-bold text-white">Send Payment</h3>

          <div class="mt-6 flex flex-col items-center gap-4">
            <div class="rounded-xl border border-gray-800 bg-white p-4">
              <img
                :src="`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(buildPaymentURI(paymentData.payCurrency, paymentData.payAddress, paymentData.payAmount, paymentData.payinExtraId))}`"
                :alt="`QR code for ${paymentData.payCurrency} payment`"
                class="h-48 w-48"
                loading="eager"
              />
            </div>

            <div class="text-center">
              <p class="text-xs uppercase tracking-widest text-gray-500">Send exactly</p>
              <p class="mt-1 font-mono text-2xl font-bold text-white">
                {{ paymentData.payAmount }}
                <span class="text-sm uppercase text-amber-400">{{ paymentData.payCurrency }}</span>
              </p>
              <p class="mt-1 text-xs text-gray-500">≈ ${{ paymentData.priceAmountUsd }} USD</p>
            </div>

            <div class="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
              <p class="mb-1 text-xs text-gray-500">To address:</p>
              <p class="select-all break-all font-mono text-xs text-gray-300">
                {{ paymentData.payAddress }}
              </p>
            </div>

            <div
              v-if="paymentData.payinExtraId"
              class="w-full rounded-lg border border-amber-900/60 bg-amber-950/20 p-3"
            >
              <p class="mb-1 text-xs font-semibold uppercase tracking-widest text-amber-300">
                Payment ID / Memo / Tag required
              </p>
              <p class="select-all break-all font-mono text-sm font-bold text-amber-100">
                {{ paymentData.payinExtraId }}
              </p>
              <p class="mt-2 text-xs leading-5 text-amber-200">
                Include this value with your payment. Missing or incorrect memo/tag
                information can prevent the payment from being credited.
              </p>
            </div>

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

          <div class="mt-6 rounded-lg border border-gray-800 bg-gray-900 p-4 text-center">
            <p class="mb-2 text-xs uppercase tracking-widest text-gray-500">Status</p>

            <div v-if="!paymentStatus" class="flex items-center justify-center gap-2">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-amber-400"></div>
              <span class="text-sm text-gray-400">Waiting for payment...</span>
            </div>

            <p v-else class="text-lg font-semibold" :class="statusColor">
              {{ statusLabel }}
            </p>

            <p
              v-if="paymentStatus?.paymentStatus === 'partially_paid'"
              class="mt-2 text-xs text-orange-400"
            >
              Received {{ paymentStatus.actuallyPaid }} / {{ paymentStatus.payAmount }}
              {{ paymentStatus.payCurrency?.toUpperCase() }}
            </p>
          </div>

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

          <p class="mt-4 text-center text-xs text-gray-600">
            Payment ID: {{ paymentData.paymentId }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
