<!-- packages/wallet/src/views/ToolboxView.vue -->

<script setup lang="ts">
import { computed, ref } from "vue";

const activeStep = ref(0);
const copied = ref(false);

const mockBtcAddress = "bc1q-sidecoin-split-staging-address-preview";

const tools = [
  {
    name: "Coin Split Helper",
    status: "Featured",
    description:
      "Guided BTC/eCash fork split flow using a wallet-generated BTC staging address and the current eCash wallet.",
  },
  {
    name: "Address Inspector",
    status: "Planned",
    description:
      "Inspect address format, network, and derivation assumptions before sending.",
  },
  {
    name: "Transaction Decoder",
    status: "Planned",
    description:
      "Paste raw transaction hex to decode outputs, fees, and chain assumptions.",
  },
];

const wizardSteps = [
  {
    title: "Generate BTC staging address",
    eyebrow: "Step 1",
    summary: "Create a wallet-controlled BTC address for the coins you want to split.",
  },
  {
    title: "Detect funding",
    eyebrow: "Step 2",
    summary: "Track confirmations and prepare selected UTXOs for review.",
  },
  {
    title: "Confirm destinations",
    eyebrow: "Step 3",
    summary: "Send eCash to this wallet and BTC to a return address you control.",
  },
  {
    title: "Review split plan",
    eyebrow: "Step 4",
    summary: "Review outputs, fees, labels, and raw transaction details.",
  },
  {
    title: "Sign and export",
    eyebrow: "Step 5",
    summary: "Sign locally, export transaction hex, and broadcast when ready.",
  },
];

const currentStep = computed(() => wizardSteps[activeStep.value]);

function goToStep(index: number) {
  activeStep.value = index;
}

function nextStep() {
  activeStep.value = Math.min(activeStep.value + 1, wizardSteps.length - 1);
}

function previousStep() {
  activeStep.value = Math.max(activeStep.value - 1, 0);
}

async function copyAddress() {
  try {
    await navigator.clipboard.writeText(mockBtcAddress);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (e) {
    console.error("[ToolboxView] Failed to copy split staging address:", e);
  }
}
</script>

<template>
  <div>
    <div class="mb-6">
      <p class="text-xs uppercase tracking-widest text-ecash-500">Wallet utilities</p>
      <h2 class="mt-1 text-2xl font-bold">Toolbox</h2>
      <p class="mt-2 max-w-2xl text-sm text-gray-400">
        Practical wallet-native tools for fork safety, address inspection, and
        transaction workflows. The first priority is helping users split coins
        safely after the BTC/eCash fork.
      </p>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <div
        v-for="tool in tools"
        :key="tool.name"
        class="rounded-lg border border-gray-800 bg-gray-900 p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <h3 class="font-semibold text-white">{{ tool.name }}</h3>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            :class="tool.status === 'Featured' ? 'bg-ecash-900 text-ecash-400' : 'bg-gray-800 text-gray-500'"
          >
            {{ tool.status }}
          </span>
        </div>
        <p class="mt-2 text-sm text-gray-400">{{ tool.description }}</p>
      </div>
    </div>

    <section class="mt-8 rounded-xl border border-ecash-800/60 bg-ecash-950/20 p-5">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 class="text-lg font-bold text-ecash-400">Coin Split Helper</h3>
          <p class="mt-2 max-w-3xl text-sm text-gray-400">
            Guided wallet-native split workflow using this wallet's local
            keystore, wallet-controlled UTXOs, explicit coin selection, and full
            transaction review.
          </p>
        </div>
        <span class="rounded-full bg-ecash-900 px-3 py-1 text-xs font-semibold text-ecash-400">
          Guided
        </span>
      </div>

      <div class="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <!-- Wizard nav -->
        <nav class="space-y-2" aria-label="Coin split steps">
          <button
            v-for="(step, i) in wizardSteps"
            :key="step.title"
            type="button"
            class="w-full rounded-xl border p-4 text-left transition-colors"
            :class="activeStep === i ? 'border-ecash-600 bg-ecash-950/60' : 'border-gray-800 bg-gray-950 hover:border-gray-700'"
            @click="goToStep(i)"
          >
            <div class="flex items-center gap-3">
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black"
                :class="activeStep === i ? 'bg-ecash-500 text-gray-950' : 'bg-gray-800 text-gray-400'"
              >
                {{ i + 1 }}
              </span>
              <div>
                <p class="text-xs uppercase tracking-widest text-gray-500">{{ step.eyebrow }}</p>
                <p class="mt-1 text-sm font-semibold text-white">{{ step.title }}</p>
              </div>
            </div>
            <p class="mt-3 text-xs leading-5 text-gray-500">{{ step.summary }}</p>
          </button>
        </nav>

        <!-- Wizard panel -->
        <div class="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <p class="text-xs uppercase tracking-widest text-ecash-500">
            {{ currentStep.eyebrow }}
          </p>
          <h4 class="mt-1 text-xl font-black text-white">{{ currentStep.title }}</h4>
          <p class="mt-2 text-sm leading-6 text-gray-400">{{ currentStep.summary }}</p>

          <!-- Step 1 -->
          <div v-if="activeStep === 0" class="mt-5 grid gap-4 md:grid-cols-[0.8fr_1fr]">
            <div class="flex h-52 items-center justify-center rounded-lg border border-gray-800 bg-gray-900">
              <div class="text-center">
                <div class="mx-auto flex h-32 w-32 items-center justify-center rounded bg-white text-xs font-black text-gray-950">
                  Funding QR
                </div>
                <p class="mt-2 text-xs text-gray-500">Scan to fund split address</p>
              </div>
            </div>

            <div>
              <p class="text-xs uppercase tracking-widest text-gray-500">
                BTC staging address
              </p>
              <p class="mt-3 break-all rounded border border-gray-800 bg-gray-900 p-3 font-mono text-xs text-ecash-400">
                {{ mockBtcAddress }}
              </p>
              <button
                type="button"
                class="mt-3 rounded bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-700"
                @click="copyAddress"
              >
                {{ copied ? "Copied ✓" : "Copy address" }}
              </button>
            </div>
          </div>

          <!-- Step 2 -->
          <div v-else-if="activeStep === 1" class="mt-5 grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs text-gray-500">Funding status</p>
              <p class="mt-2 font-semibold text-white">Watching address</p>
            </div>
            <div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs text-gray-500">Confirmations</p>
              <p class="mt-2 font-semibold text-white">Tracked automatically</p>
            </div>
            <div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs text-gray-500">UTXO selection</p>
              <p class="mt-2 font-semibold text-white">User controlled</p>
            </div>
          </div>

          <!-- Step 3 -->
          <div v-else-if="activeStep === 2" class="mt-5 space-y-4">
            <label class="block">
              <span class="text-sm text-gray-400">eCash destination</span>
              <input
                disabled
                value="Current eCash wallet"
                class="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-400"
              />
              <span class="mt-1 block text-xs text-gray-600">
                The eCash side of the split is directed into the current wallet.
              </span>
            </label>

            <label class="block">
              <span class="text-sm text-gray-400">BTC return address</span>
              <input
                disabled
                placeholder="BTC address you control"
                class="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-500 placeholder-gray-600"
              />
              <span class="mt-1 block text-xs text-gray-600">
                Confirm a BTC return address you control before continuing.
              </span>
            </label>

            <div class="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-400">
              If funds came from an exchange, custodian, or change output,
              choose a safe BTC destination before continuing.
            </div>
          </div>

          <!-- Step 4 -->
          <div v-else-if="activeStep === 3" class="mt-5 grid gap-3 sm:grid-cols-2">
            <div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Review</p>
              <ul class="mt-3 space-y-2 text-sm text-gray-300">
                <li>✓ Selected inputs</li>
                <li>✓ BTC return output</li>
                <li>✓ eCash wallet output</li>
                <li>✓ Network fees</li>
              </ul>
            </div>
            <div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs uppercase tracking-widest text-gray-500">Safety</p>
              <ul class="mt-3 space-y-2 text-sm text-gray-300">
                <li>✓ Chain labels</li>
                <li>✓ Destination confirmation</li>
                <li>✓ Raw transaction preview</li>
                <li>✓ Replay checks</li>
              </ul>
            </div>
          </div>

          <!-- Step 5 -->
          <div v-else class="mt-5 rounded-lg border border-gray-800 bg-gray-900 p-4">
            <p class="font-semibold text-white">Ready for local signing</p>
            <p class="mt-2 text-sm leading-6 text-gray-400">
              The final step signs locally, lets the user export raw transaction
              hex, and provides broadcast status through the configured adapter.
            </p>
          </div>

          <div class="mt-6 flex items-center justify-between border-t border-gray-800 pt-4">
            <button
              type="button"
              class="rounded border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="activeStep === 0"
              @click="previousStep"
            >
              Previous
            </button>
            <button
              type="button"
              class="rounded bg-ecash-600 px-4 py-2 text-sm font-bold text-white hover:bg-ecash-500 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="activeStep === wizardSteps.length - 1"
              @click="nextStep"
            >
              Next step
            </button>
          </div>
        </div>
      </div>

      <div class="mt-5 rounded-lg border border-yellow-800 bg-yellow-950/30 p-3 text-xs text-yellow-500">
        Coin splitting should use this wallet's local keystore, wallet-controlled
        UTXOs, explicit coin selection, and full transaction review. Do not
        paste your seed phrase into a separate website or third-party tool.
      </div>
    </section>
  </div>
</template>
