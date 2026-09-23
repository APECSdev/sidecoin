// apps/mobile/src/components/QrScanner.tsx
//
// Ported from apps/wallet/src/components/QrScanner.vue.
//
// The Vue scanner wrapped `qr-scanner` + a <video>/getUserMedia feed. React
// Native has no getUserMedia; the platform-idiomatic equivalent is
// react-native-vision-camera (already a declared mobile dependency), which
// renders the live feed and scans on-device via the platform code scanner. The
// screen contract is preserved 1:1: a full-screen overlay that emits one
// `decode(value)` then closes, plus the loading state, the error guidance, the
// "Enter address manually" fallback, and the footer hint.
//
// Mapping of the Vue behaviour:
//   • qr-scanner start()/getUserMedia failures -> camera permission hook +
//     VisionCamera onError mapping (denied / no camera / in use).
//   • multi-frame guard (`handled`) -> a ref set on the first decoded code so
//     only one emit happens before the modal closes.
//   • <video> muted playsinline -> <Camera> preview, no audio.
//   • rear camera (preferredCamera: "environment") -> position="back".

import React, { useCallback, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  type Code,
  type CameraRuntimeError,
} from "react-native-vision-camera";

export interface QrScannerProps {
  /** Called once with the decoded payload. The parent closes the overlay. */
  onDecode: (value: string) => void;
  /** Called when the user dismisses the overlay. */
  onClose: () => void;
}

export function QrScanner({ onDecode, onClose }: QrScannerProps): React.JSX.Element {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Guard so a multi-frame detection only emits once before the modal closes.
  const handled = useRef(false);

  // Request camera permission on first mount, mirroring qr-scanner.start().
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (hasPermission) return;
      try {
        const granted = await requestPermission();
        if (cancelled) return;
        if (!granted) {
          setLoading(false);
          setErrorMsg(
            "Camera permission denied. Allow camera access and try again.",
          );
        }
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        mapError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasPermission, requestPermission]);

  /**
   * Map start()/getUserMedia failures to clear, mobile-relevant guidance. The
   * two that bite most often on phones are a denied permission and a
   * non-secure (plain-HTTP) context — both surfaced explicitly here.
   */
  const mapError = useCallback((err: unknown) => {
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);

    switch (name) {
      case "NotAllowedError":
      case "SecurityError":
        setErrorMsg(
          "Camera permission denied. Allow camera access and try again.",
        );
        return;
      case "NotFoundError":
      case "OverconstrainedError":
        setErrorMsg("No usable camera found on this device.");
        return;
      case "NotReadableError":
        setErrorMsg("Camera is already in use by another app.");
        return;
    }

    // The web library reports a missing camera / insecure context as a plain
    // message; keep the same classification for any remaining error shapes.
    if (/camera not found|no camera/i.test(msg)) {
      setErrorMsg("No usable camera found on this device.");
    } else if (/secure|https/i.test(msg)) {
      setErrorMsg(
        "Camera needs a secure (HTTPS) connection. Open this page over " +
          "HTTPS or on localhost to scan.",
      );
    } else {
      setErrorMsg(msg || "Could not start the camera.");
    }
  }, []);

  const onError = useCallback(
    (error: CameraRuntimeError) => {
      setLoading(false);
      switch (error.code) {
        case "permission/camera-permission-denied":
        case "permission/microphone-permission-denied":
          setErrorMsg(
            "Camera permission denied. Allow camera access and try again.",
          );
          return;
        case "device/no-device":
        case "device/camera-not-available-on-simulator":
        case "system/camera-module-not-found":
        case "system/no-camera-manager":
          setErrorMsg("No usable camera found on this device.");
          return;
        case "device/camera-already-in-use":
        case "system/max-cameras-in-use":
          setErrorMsg("Camera is already in use by another app.");
          return;
        default:
          mapError(error);
      }
    },
    [mapError],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes: Code[]) => {
      if (handled.current) return;
      const value = codes.find((c) => c.value)?.value;
      if (!value) return;
      handled.current = true;
      onDecode(value);
    },
  });

  const showCamera = hasPermission && device != null && errorMsg == null;

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
        {showCamera ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            codeScanner={codeScanner}
            onInitialized={() => {
              setLoading(false);
              setErrorMsg(null);
            }}
            onError={onError}
          />
        ) : null}

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
    fontSize: 12,
    color: "#6b7280",
  },
});
