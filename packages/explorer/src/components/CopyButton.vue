<!-- packages/explorer/src/components/CopyButton.vue -->

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

const props = withDefaults(
  defineProps<{
    value: string;
    label?: string;
  }>(),
  {
    label: "Copy",
  },
);

const copied = ref(false);
const failed = ref(false);
let timeout: ReturnType<typeof setTimeout> | null = null;

function clearResetTimer() {
  if (timeout != null) {
    clearTimeout(timeout);
    timeout = null;
  }
}

function scheduleReset() {
  clearResetTimer();
  timeout = setTimeout(() => {
    copied.value = false;
    failed.value = false;
    timeout = null;
  }, 1_600);
}

function fallbackCopy(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";

  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

async function copyValue() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(props.value);
    } else {
      fallbackCopy(props.value);
    }

    copied.value = true;
    failed.value = false;
    scheduleReset();
  } catch {
    copied.value = false;
    failed.value = true;
    scheduleReset();
  }
}

onBeforeUnmount(clearResetTimer);
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-black uppercase tracking-wide transition"
    :class="
      copied
        ? 'border-ecash-700 bg-ecash-950/50 text-ecash-300'
        : failed
          ? 'border-red-800 bg-red-950/40 text-red-300'
          : 'border-gray-800 bg-gray-950/70 text-gray-400 hover:border-yellow-500/70 hover:text-yellow-200'
    "
    :aria-label="`${label}: ${value}`"
    @click="copyValue"
  >
    <span v-if="copied">Copied</span>
    <span v-else-if="failed">Failed</span>
    <span v-else>{{ label }}</span>
  </button>
</template>
