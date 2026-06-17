<!-- packages/smarthub/src/App.vue -->

<script setup lang="ts">
import QrcodeVue from "qrcode.vue";

const HUB_ORIGIN = "https://hub.sidecoin.app";
const CHALLENGE_NONCE = "coming-soon";
const challengeUri =
  `sidecoin://hub/challenge?hub=${encodeURIComponent(HUB_ORIGIN)}` +
  `&nonce=${encodeURIComponent(CHALLENGE_NONCE)}`;
</script>

<template>
  <main class="min-h-screen overflow-hidden bg-transparent text-white">
    <section class="grid min-h-screen lg:grid-cols-2">
      <!-- ── QR Challenge ──────────────────────────────────── -->
      <div class="relative flex min-h-[50vh] items-center justify-center border-b border-white/10 px-6 py-12 lg:min-h-screen lg:border-b-0 lg:border-r lg:border-white/10">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.16),transparent_32rem)]"></div>

        <div class="relative w-full max-w-md rounded-3xl border border-ecash-400/20 bg-gray-950/70 p-6 text-center shadow-2xl shadow-ecash-950/40 backdrop-blur">
          <div class="mx-auto flex h-72 w-72 items-center justify-center rounded-2xl border border-ecash-300/30 bg-white p-5 shadow-xl shadow-black/40">
            <QrcodeVue
              :value="challengeUri"
              :size="232"
              level="M"
              render-as="svg"
              foreground="#052e16"
              background="#ffffff"
            />
          </div>

          <p class="mt-6 text-sm font-black uppercase tracking-[0.28em] text-ecash-400">
            SCAN with your Sidecoin app
          </p>

          <p class="mx-auto mt-3 max-w-sm text-sm leading-6 text-gray-300">
            Scan this secure portal challenge with your Sidecoin app to prepare
            a wallet-based Smart Hub login.
          </p>

          <div class="mt-5 rounded-xl border border-gray-800 bg-black/40 px-4 py-3 text-left">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Challenge
            </p>
            <p class="mt-1 break-all font-mono text-xs leading-5 text-gray-300">
              {{ challengeUri }}
            </p>
          </div>
        </div>
      </div>

      <!-- ── Coming Soon ───────────────────────────────────── -->
      <div class="relative flex min-h-[50vh] items-center justify-center px-6 py-12 lg:min-h-screen">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.16),transparent_30rem)]"></div>
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.12),transparent_28rem)]"></div>

        <div class="relative w-full max-w-xl">
          <h1
            class="text-5xl font-extrabold tracking-tight md:text-7xl"
            aria-label="Sidecoin Smart Hub"
          >
            <span
              class="bg-gradient-to-br from-ecash-300 via-ecash-500 to-ecash-600 bg-clip-text text-transparent"
              aria-hidden="true"
            >SidΞcoin</span>
            <span class="block text-white">Smart Hub</span>
          </h1>

          <div class="mt-8 inline-flex rounded-full border border-ecash-400/30 bg-ecash-950/50 px-5 py-2 text-sm font-black uppercase tracking-[0.22em] text-ecash-300 shadow-lg shadow-ecash-950/40">
            Coming Soon...
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
