<!-- packages/wallet/src/components/QrScanner.vue -->

<script setup lang="ts">
import { ref } from "vue";
import { QrcodeStream } from "vue-qrcode-reader";

const emit = defineEmits<{
  (e: "decode", value: string): void;
  (e: "close"): void;
}>();

const errorMsg = ref<string | null>(null);
const loading = ref(true);
// Guard so a multi-frame detection only emits once before the modal closes.
let handled = false;

function onDetect(codes: { rawValue: string }[]): void {
  if (handled || codes.length === 0) return;
  handled = true;
  emit("decode", codes[0].rawValue);
}

function onCameraOn(): void {
  loading.value = false;
  errorMsg.value = null;
}

/**
 * Map the stream's DOMException-style errors to clear, mobile-relevant
 * guidance. The two that bite most often on phones are a denied permission
 * and a non-secure (plain-HTTP) context — both surfaced explicitly here.
 */
function onError(err: Error): void {
  loading.value = false;
  switch (err.name) {
    case "NotAllowedError":
      errorMsg.value =
        "Camera permission denied. Allow camera access and try again.";
      break;
    case "NotFoundError":
    case "OverconstrainedError":
      errorMsg.value = "No usable camera found on this device.";
      break;
    case "NotSupportedError":
    case "InsecureContextError":
      errorMsg.value =
        "Camera needs a secure (HTTPS) connection. Open this page over " +
        "HTTPS or on localhost to scan.";
      break;
    case "NotReadableError":
      errorMsg.value = "Camera is already in use by another app.";
      break;
    case "StreamApiNotSupportedError":
      errorMsg.value = "This browser does not support camera scanning.";
      break;
    default:
      errorMsg.value = err.message || "Could not start the camera.";
  }
}

function close(): void {
  emit("close");
}

/** Draw a green outline around a detected code for visual feedback. */
function paintOutline(
  detectedCodes: { cornerPoints: { x: number; y: number }[] }[],
  ctx: CanvasRenderingContext2D,
): void {
  for (const code of detectedCodes) {
    const [first, ...rest] = code.cornerPoints;
    if (!first) continue;
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    ctx.lineTo(first.x, first.y);
    ctx.closePath();
    ctx.stroke();
  }
}
</script>

<template>
  <!-- Full-screen overlay: large tap targets, safe-area aware, fills the
       viewport so the camera feed is as big as possible on a phone. -->
  <div
    class="fixed inset-0 z-50 flex flex-col bg-black"
    style="padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);"
  >
    <div class="flex items-center justify-between p-4">
      <h3 class="text-lg font-semibold text-white">Scan address</h3>
      <button
        type="button"
        aria-label="Close scanner"
        class="rounded-full bg-gray-800 px-5 py-3 text-base font-semibold text-white active:bg-gray-700"
        @click="close"
      >
        Close
      </button>
    </div>

    <div class="relative flex-1 overflow-hidden">
      <QrcodeStream
        :constraints="{ facingMode: 'environment' }"
        :formats="['qr_code']"
        :track="paintOutline"
        class="h-full w-full object-cover"
        @detect="onDetect"
        @camera-on="onCameraOn"
        @error="onError"
      />

      <div
        v-if="loading && !errorMsg"
        class="absolute inset-0 flex items-center justify-center text-gray-300"
      >
        Starting camera…
      </div>

      <div
        v-if="errorMsg"
        class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center"
      >
        <p class="text-sm text-red-300">{{ errorMsg }}</p>
        <button
          type="button"
          class="rounded bg-gray-800 px-6 py-3 text-base font-semibold text-white active:bg-gray-700"
          @click="close"
        >
          Enter address manually
        </button>
      </div>
    </div>

    <p class="p-4 text-center text-xs text-gray-500">
      Point your camera at a Bitcoin / eCash QR code.
    </p>
  </div>
</template>
