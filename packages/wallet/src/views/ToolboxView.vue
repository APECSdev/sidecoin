<!-- packages/wallet/src/views/ToolboxView.vue -->

<script setup lang="ts">
const splitSteps = [
  "Wait for the fork activation block to pass and for both networks to stabilize.",
  "Avoid spending the same pre-fork coins on both networks until they are safely split.",
  "Receive a small post-fork coin on one side, then combine it with your old coins.",
  "Broadcast the split transaction on that network first.",
  "Verify the original coins no longer replay cleanly before spending on the other side.",
];

const tools = [
  {
    name: "Coin Split Helper",
    status: "Guide ready",
    description:
      "Step-by-step safety checklist for separating BTC/eCash coins after the fork.",
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
</script>

<template>
  <div>
    <div class="mb-6">
      <p class="text-xs uppercase tracking-widest text-ecash-500">Wallet utilities</p>
      <h2 class="mt-1 text-2xl font-bold">Toolbox</h2>
      <p class="mt-2 max-w-2xl text-sm text-gray-400">
        Practical tools for fork safety, address inspection, and transaction
        workflows. The first priority is helping users split coins safely after
        the BTC/eCash fork.
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
            :class="tool.status === 'Guide ready' ? 'bg-ecash-900 text-ecash-400' : 'bg-gray-800 text-gray-500'"
          >
            {{ tool.status }}
          </span>
        </div>
        <p class="mt-2 text-sm text-gray-400">{{ tool.description }}</p>
      </div>
    </div>

    <section class="mt-8 rounded-xl border border-ecash-800/60 bg-ecash-950/20 p-5">
      <h3 class="text-lg font-bold text-ecash-400">Coin Split Helper</h3>
      <p class="mt-2 text-sm text-gray-400">
        This guide is intentionally conservative. Actual split transaction
        building should only be enabled after fork rules, replay behavior, and
        coin-control support are fully validated.
      </p>

      <ol class="mt-5 space-y-3">
        <li
          v-for="(step, i) in splitSteps"
          :key="step"
          class="flex gap-3 rounded-lg border border-gray-800 bg-gray-950/70 p-3"
        >
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ecash-600 text-sm font-bold text-white">
            {{ i + 1 }}
          </span>
          <p class="text-sm leading-6 text-gray-300">{{ step }}</p>
        </li>
      </ol>

      <div class="mt-5 rounded-lg border border-yellow-800 bg-yellow-950/30 p-3 text-xs text-yellow-500">
        Never paste seed phrases or private keys into a web tool. Coin splitting
        should use wallet-controlled UTXOs and explicit transaction review.
      </div>
    </section>
  </div>
</template>
