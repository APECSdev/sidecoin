// apps/mobile/src/components/QrScanner.tsx
//
// Ported from apps/wallet/src/components/QrScanner.vue.
//
// The Vue scanner wrapped `qr-scanner` + a <video>/getUserMedia feed. React
// Native has no getUserMedia, so the port shipped react-native-vision-camera.
// That library hard-depends on Google MLKit (its Kotlin core imports
// com.google.mlkit.vision.barcode in CameraSession.kt / CameraView.kt, and
// both branches of its enableCodeScanner flag pull a proprietary artifact), so
// it cannot ship in an F-Droid build. It has been replaced by our own scanner:
//   • native: android/app/src/main/java/app/sidecoin/scanner/ (CameraX + ZXing)
//   • bridge: ../lib/zxingScanner.ts
//
// The screen contract is preserved 1:1: a full-screen overlay that emits one
// `decode(value)` then closes, plus the loading state, the error guidance, the
// "Enter address manually" fallback, and the footer hint.
//
// Mapping of the Vue behaviour:
//   • qr-scanner start()/getUserMedia failures -> scanQrCode() rejection mapped
//     to the same denied / no-camera / in-use guidance.
//   • multi-frame guard (`handled`) -> enforced natively (the Activity stops
//     analysing on the first decode and finishes), so only one emit happens.
//   • <video> muted playsinline -> the native CameraX preview, no audio.
//   • rear camera (preferredCamera: "environment") -> DEFAULT_BACK_CAMERA.

import React, { useCallback, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { isQrScannerAvailable, scanQrCode } from "../lib/zxingScanner";

export interface QrScannerProps {
  /** Called once with the decoded payload. The parent closes the overlay. */
  onDecode: (value: string) => void;
  /** Called when the user dismisses the overlay. */
  onClose: () => void;
}

export function QrScanner({ onDecode, onClose }: QrScannerProps): React.JSX.Element {
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Guard so a double resolve (or a resolve after unmount) cannot emit twice.
  // The native side already enforces single-shot, but the JS boundary keeps
  // its own latch so onDecode is called at most once per mount.
  const handled = useRef(false);

  // Guard so the native scanner is launched EXACTLY ONCE per mount.
  //
  // onDecode/onClose are passed down as plain functions and get a new identity
  // on every parent render. If the effect depended on them directly, any
  // unrelated re-render of the parent would re-run it and launch a second
  // Activity while the first is still open — the native module would reject it
  // with E_BUSY and the user would lose the live camera. A ref latch makes the
  // launch independent of prop identity.
  const launched = useRef(false);

  /**
   * Map native failures to clear, mobile-relevant guidance — unchanged copy
   * from the previous implementation. The native module rejects with
   * E_NO_ACTIVITY / E_BUSY / E_START_FAILED codes; anything else is classified
   * by message so unexpected platform text still lands somewhere sensible.
   */
  const mapError = useCallback((err: unknown) => {
    const code = (err as { code?: string })?.code ?? "";
    const msg = err instanceof Error ? err.message : String(err);

    switch (code) {
      case "E_NO_ACTIVITY":
        setErrorMsg("Camera is already in use by another app.");
        return;
      case "E_BUSY":
        setErrorMsg("A scan is already in progress.");
        return;
    }

    if (/permission/i.test(msg)) {
      setErrorMsg(
        "Camera permission denied. Allow camera access and try again.",
      );
    } else if (/no usable camera|no camera/i.test(msg)) {
      setErrorMsg("No usable camera found on this device.");
    } else {
      setErrorMsg(msg || "Could not start the camera.");
    }
  }, []);

  // Launch the native scanner on first mount, mirroring qr-scanner.start().
  //
  // The effect intentionally has an EMPTY dependency list: it must run once per
  // mount, not once per prop identity (see the `launched` ref above). The
  // latest onDecode/onClose are read through refs so a re-render mid-scan
  // cannot restart the camera while still resolving against fresh callbacks.
  const onDecodeRef = useRef(onDecode);
  const onCloseRef = useRef(onClose);
  onDecodeRef.current = onDecode;
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (launched.current) return;
    launched.current = true;

    let cancelled = false;

    (async () => {
      // Feature-detect first: a build without the scanner should show the
      // manual-entry fallback, not an import-time crash.
      if (!isQrScannerAvailable()) {
        if (cancelled) return;
        setLoading(false);
        setErrorMsg(
          "QR scanning is not available in this build. Enter the address manually.",
        );
        return;
      }

      try {
        const value = await scanQrCode();
        if (cancelled) return;

        // null means the user backed out of the native Activity.
        if (value == null) {
          onCloseRef.current();
          return;
        }

        if (handled.current) return;
        handled.current = true;
        onDecodeRef.current(value);
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        mapError(err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapError]);

  return (
    <View style={styles.overlay}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scan address</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
          onPress={onClose}
          style={styles.closeButton}
        >
          <Text style={styles.closeButtonText}>Close</Text>
        </Pressable>
      </View>

      <View style={styles.feed}>
        {loading && !errorMsg ? (
          <View style={styles.centerOverlay}>
            <Text style={styles.loadingText}>Starting camera…</Text>
          </View>
        ) : null}

        {errorMsg ? (
          <View style={[styles.centerOverlay, styles.errorOverlay]}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={styles.manualButton}
            >
              <Text style={styles.manualButtonText}>Enter address manually</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Text style={styles.footer}>
        Point your camera at a Bitcoin / eCash QR code.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
  },
  closeButton: {
    borderRadius: 9999,
    backgroundColor: "#1f2937",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  feed: {
    flex: 1,
    overflow: "hidden",
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#d1d5db",
  },
  errorOverlay: {
    backgroundColor: "rgba(0,0,0,0.8)",
    padding: 24,
    gap: 16,
  },
  errorText: {
    fontSize: 14,
    color: "#fca5a5",
    textAlign: "center",
  },
  manualButton: {
    borderRadius: 6,
    backgroundColor: "#1f2937",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  manualButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  footer: {
    padding: 16,
    textAlign: "center",
    color: "#9ca3af",
  },
});
