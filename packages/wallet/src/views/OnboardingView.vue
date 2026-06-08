<!-- packages/wallet/src/views/OnboardingView.vue -->
<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { generateMnemonic, validateMnemonic } from "@sidecoin/shared";
import { saveWallet } from "../keystore";

const router = useRouter();
const mode = ref<"choose" | "generate" | "import">("choose");

// generate flow
const generated = ref("");
const savedConfirmed = ref(false);
const words = computed(() => generated.value.split(" "));

function startGenerate() {
  generated.value = generateMnemonic(128);
  savedConfirmed.value = false;
  mode.value = "generate";
}

// import flow
const imported = ref("");
const importValid = computed(() => validateMnemonic(imported.value));

const error = ref("");

function finish(mnemonic: string) {
  try {
    saveWallet(mnemonic);
    router.push({ name: "dashboard" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg">
    <h1 class="text-2xl font-bold text-ecash-400">Set up your wallet</h1>
    <p class="mt-1 text-sm text-gray-500">eCash Drivechains · Signet test wallet</p>

    <div
      class="mt-4 rounded border border-yellow-800/60 bg-yellow-950/30 p-3 text-xs text-yellow-300"
    >
      ⚠️ Signet test wallet. The recovery phrase is stored unencrypted in this
      browser. Do not use a real-funds phrase.
    </div>

    <!-- Choose -->
    <div v-if="mode === 'choose'" class="mt-6 space-y-3">
      <button
        class="w-full rounded bg-ecash-500 px-4 py-3 text-sm font-semibold text-gray-950 hover:bg-ecash-400"
        @click="startGenerate"
      >
        Generate a new phrase
      </button>
      <button
        class="w-full rounded border border-gray-700 px-4 py-3 text-sm text-gray-200 hover:bg-gray-800"
        @click="mode = 'import'"
      >
        Import an existing phrase
      </button>
    </div>

    <!-- Generate -->
    <div v-else-if="mode === 'generate'" class="mt-6 space-y-4">
      <ol class="grid grid-cols-3 gap-2 rounded bg-gray-900 p-4 text-sm">
        <li
          v-for="(w, i) in words"
          :key="i"
          class="rounded bg-gray-800 px-2 py-1 font-mono text-gray-200"
        >
          <span class="mr-1 text-gray-600">{{ i + 1 }}.</span>{{ w }}
        </li>
      </ol>
      <label class="flex items-center gap-2 text-sm text-gray-300">
        <input v-model="savedConfirmed" type="checkbox" />
        I have written down my recovery phrase.
      </label>
      <div class="flex gap-2">
        <button
          class="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
          @click="mode = 'choose'"
        >
          Back
        </button>
        <button
          class="flex-1 rounded bg-ecash-500 px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-40"
          :disabled="!savedConfirmed"
          @click="finish(generated)"
        >
          Continue
        </button>
      </div>
    </div>

    <!-- Import -->
    <div v-else class="mt-6 space-y-4">
      <textarea
        v-model="imported"
        rows="3"
        placeholder="Enter your 12 or 24 word phrase"
        class="w-full rounded bg-gray-900 p-3 font-mono text-sm text-gray-100 outline-none focus:ring-1 focus:ring-ecash-500"
      />
      <p v-if="imported && !importValid" class="text-xs text-red-400">
        Not a valid BIP-39 phrase.
      </p>
      <div class="flex gap-2">
        <button
          class="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
          @click="mode = 'choose'"
        >
          Back
        </button>
        <button
          class="flex-1 rounded bg-ecash-500 px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-40"
          :disabled="!importValid"
          @click="finish(imported)"
        >
          Import
        </button>
      </div>
    </div>

    <p v-if="error" class="mt-4 text-sm text-red-400">{{ error }}</p>
  </div>
</template>
