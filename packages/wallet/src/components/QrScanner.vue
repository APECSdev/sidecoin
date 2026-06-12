<!-- packages/wallet/src/components/QrScanner.vue -->

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import QrScanner from "qr-scanner";

const emit = defineEmits<{
  (e: "decode", value: string): void;
  (e: "close"): void;
}>();

// qr-scanner renders the live feed into this <video> element and overlays its
// OWN highlight canvas as a sibling. We give it a ref rather than letting a
// wrapper component manage the stream, so the decoder worker (bundled by Vite)
// is the single, device-independent detection path — no BarcodeDetector.
const video = ref<HTMLVideoElement | null>(null);
const errorMsg = ref<string | null>(null);
const loading = ref(true);

let scanner: QrScanner | null = null;
// Guard so a multi-frame detection only emits once before the modal closes.
let handled = false;

onMounted(async () => {
  const el = video.value;
  if (!el) return;

  scanner = new QrScanner(
    el,
    (result) => {
      if (handled) return;
      handled = true;
      emit("decode", result.data);
    },
    {
      // Rear camera on phones; falls back to the only camera on a laptop.
      preferredCamera: "environment",
      // Built-in viewfinder + green outline on detection (mobile-friendly UX).
      highlightScanRegion: true,
      highlightCodeOutline: true,
      // Give the callback { data, cornerPoints } instead of a bare string.
      returnDetailedScanResult: true,
    },
  );

  try {
    await scanner.start();
    loading.value = false;
    errorMsg.value = null;
  } catch (err) {
    loading.value = false;
    mapError(err);
  }
});

onBeforeUnmount(() => {
  // Release the camera + worker; leaking the stream keeps the LED on and can
  // block the camera for other apps until the tab is closed.
  scanner?.stop();
  scanner?.destroy();
  scanner = null;
});

/**
 * Map start()/getUserMedia failures to clear, mobile-relevant guidance. The
 * two that bite most often on phones are a denied permission and a non-secure
 * (plain-HTTP) context — both surfaced explicitly here.
 */
function mapError(err: unknown): void {
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      errorMsg.value =
        "Camera permission denied. Allow camera access and try again.";
      return;
    case "NotFoundError":
    case "OverconstrainedError":
      errorMsg.value = "No usable camera found on this device.";
      return;
    case "NotReadableError":
      errorMsg.value = "Camera is already in use by another app.";
      return;
  }

  // qr-scanner reports a missing camera / insecure context as a plain message.
  if (/camera not found|no camera/i.test(msg)) {
    errorMsg.value = "No usable camera found on this device.";
  } else if (/secure|https/i.test(msg)) {
    errorMsg.value =
      "Camera needs a secure (HTTPS) connection. Open this page over " +
      "HTTPS or on localhost to scan.";
  } else {
    errorMsg.value = msg || "Could not start the camera.";
  }
}

function close(): void {
  emit("close");
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
      <video
        ref="video"
        class="h-full w-full object-cover"
        muted
        playsinline
      ></video>

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
