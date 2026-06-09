<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";

// This component runs ON the wallet's own origin (wallet.sidecoin.app), so the
// native beforeinstallprompt fires directly — no cross-origin fallbacks needed.
// If the wallet is already installed, the browser never fires the event, so the
// banner simply stays hidden.

type State = "hidden" | "install" | "ios";
const state = ref<State>("hidden");

// Stashed beforeinstallprompt event (Chromium only).
let deferredPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari legacy flag
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isMobile(): boolean {
  return window.matchMedia("(max-width: 768px)").matches;
}

function isIos(): boolean {
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !("MSStream" in window);
}

function onBeforeInstallPrompt(e: Event) {
  // Prevent the mini-infobar; we drive the prompt from our own button.
  e.preventDefault();
  deferredPrompt = e as typeof deferredPrompt;
  state.value = "install";
}

function onAppInstalled() {
  // Installed during this session — hide the prompt.
  deferredPrompt = null;
  state.value = "hidden";
}

async function handleInstall() {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === "accepted") state.value = "hidden";
  deferredPrompt = null;
}

function dismiss() {
  state.value = "hidden";
}

onMounted(() => {
  if (!isMobile() || isStandalone()) return; // desktop or already launched as app

  if (isIos()) {
    state.value = "ios"; // Safari: manual Add to Home Screen
    return;
  }

  // Chromium: the event only fires if the PWA is installable AND not already
  // installed. We stay hidden until then.
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onAppInstalled);
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.removeEventListener("appinstalled", onAppInstalled);
});
</script>

<template>
  <!-- bottom-16 keeps the banner clear of the 64px-tall mobile tab bar. -->
  <div
    v-if="state !== 'hidden'"
    class="fixed inset-x-0 bottom-16 z-50 border-t border-gray-800 bg-gray-900/95 px-4 py-4 backdrop-blur md:hidden"
    role="dialog"
    aria-label="Install Sidecoin Wallet"
  >
    <div class="mx-auto flex max-w-md items-start gap-3">
      <div class="mt-0.5 text-2xl">📱</div>

      <div class="flex-1">
        <!-- Android / Chromium install -->
        <template v-if="state === 'install'">
          <p class="text-sm font-semibold text-white">Install the Sidecoin Wallet app</p>
          <p class="mt-1 text-xs text-gray-400">
            Add the wallet to your home screen for offline access and a native feel.
          </p>
          <button
            class="mt-3 w-full rounded-lg bg-ecash-600 px-4 py-2 text-sm font-semibold text-white hover:bg-ecash-500"
            @click="handleInstall"
          >
            Install Wallet
          </button>
        </template>

        <!-- iOS manual instructions -->
        <template v-else-if="state === 'ios'">
          <p class="text-sm font-semibold text-white">Install on iPhone / iPad</p>
          <p class="mt-1 text-xs text-gray-400">
            Tap the <span class="font-semibold text-white">Share</span> icon in Safari,
            then choose <span class="font-semibold text-white">“Add to Home Screen”</span>.
          </p>
        </template>
      </div>

      <button
        class="rounded-lg p-1 text-gray-500 hover:text-white"
        aria-label="Dismiss"
        @click="dismiss"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>
