<!-- packages/wallet/src/views/ToolboxView.vue -->

<script setup lang="ts">
const splitSteps = [
  {
    title: "Generate BTC staging address",
    body:
      "The wallet will show a BTC address and QR code. The user sends the coins they want to split to this address.",
  },
  {
    title: "Wait for funding",
    body:
      "The future implementation will watch for confirmations before enabling the split review flow.",
  },
  {
    title: "Confirm current eCash wallet",
    body:
      "The eCash side of the split should be sent directly into the wallet currently registered in this app.",
  },
  {
    title: "Choose BTC return destination",
    body:
      "The user should confirm a BTC return address. A detected source address can be shown as a suggestion, but exchanges and change addresses must be handled carefully.",
  },
  {
    title: "Review split plan",
    body:
      "Before anything is broadcast, show both outputs, fees, raw transaction previews, and clear chain labels.",
  },
];

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

const mockBtcAddress = "bc1q-sidecoin-split-staging-address-preview";
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
            Guided wallet-native split workflow. The future
            engineered version should use this wallet's local keystore,
            wallet-controlled UTXOs, explicit coin selection, and full
            transaction review.
          </p>
        </div>
        <span class="rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-gray-400">
          Guided
        </span>
      </div>

      <!-- Mock BTC receive/staging card -->
      <div class="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p class="text-xs uppercase tracking-widest text-gray-500">
            Step 1 · BTC staging address
          </p>

          <div class="mt-4 flex h-44 items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-900">
            <div class="text-center">
              <div class="mx-auto flex h-28 w-28 items-center justify-center rounded bg-white text-xs font-bold text-gray-950">
                QR Preview
              </div>
              <p class="mt-2 text-xs text-gray-500">Scan to fund split address</p>
            </div>
          </div>

          <p class="mt-4 break-all rounded border border-gray-800 bg-gray-900 p-3 font-mono text-xs text-ecash-400">
            {{ mockBtcAddress }}
          </p>

          <button
            type="button"
            disabled
            class="mt-3 w-full rounded bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-500"
          >
            Copy address
          </button>
        </div>

        <div class="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p class="text-xs uppercase tracking-widest text-gray-500">
            Split destinations
          </p>

          <div class="mt-4 space-y-4">
            <label class="block">
              <span class="text-sm text-gray-400">eCash destination</span>
              <input
                disabled
                value="Current Sidecoin wallet"
                class="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-400"
              />
              <span class="mt-1 block text-xs text-gray-600">
                Future implementation must verify a current wallet exists before
                continuing.
              </span>
            </label>

            <label class="block">
              <span class="text-sm text-gray-400">BTC return address</span>
              <input
                disabled
                placeholder="Optional/custom BTC return address"
                class="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-500 placeholder-gray-600"
              />
              <span class="mt-1 block text-xs text-gray-600">
                Recommended for exchange users. Detected source addresses should
                be treated as suggestions, not automatic return targets.
              </span>
            </label>

            <div class="rounded-lg border border-yellow-800 bg-yellow-950/30 p-3 text-xs text-yellow-500">
              Do not silently return BTC to the apparent source address. The
              sender may be an exchange, custodian, or change address.
            </div>
          </div>
        </div>
      </div>

      <ol class="mt-6 space-y-3">
        <li
          v-for="(step, i) in splitSteps"
          :key="step.title"
          class="flex gap-3 rounded-lg border border-gray-800 bg-gray-950/70 p-3"
        >
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ecash-600 text-sm font-bold text-white">
            {{ i + 1 }}
          </span>
          <div>
            <p class="font-semibold text-white">{{ step.title }}</p>
            <p class="mt-1 text-sm leading-6 text-gray-400">{{ step.body }}</p>
          </div>
        </li>
      </ol>

      <div class="mt-3 rounded-lg border border-yellow-800 bg-yellow-950/30 p-3 text-xs text-yellow-500">
        Coin splitting should use this wallet's local keystore, wallet-controlled
        UTXOs, explicit coin selection, and full transaction review. Do not
        paste your seed phrase into a separate website or third-party tool.
      </div>
    </section>
  </div>
</template>
