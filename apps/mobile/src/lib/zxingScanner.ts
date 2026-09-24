// apps/mobile/src/lib/zxingScanner.ts
//
// JS bridge to the FOSS ZXing QR scanner (CameraX + ZXing core).
//
// WHY THIS EXISTS:
//   The Vue port used react-native-vision-camera, whose Android core hard-
//   depends on Google MLKit (com.google.mlkit.vision.barcode in
//   CameraSession.kt / CameraView.kt). Both branches of its enableCodeScanner
//   flag pull a proprietary artifact, so an F-Droid build cannot use it.
//
//   apps/mobile/android/app/src/main/java/app/sidecoin/scanner/ now ships our
//   own scanner built from two Apache-2.0 pieces (androidx.camera + ZXing
//   core). This file is the only place JS touches that native module, so the
//   rest of the app keeps a plain async function.
//
// CONTRACT:
//   scanQrCode() resolves with the decoded payload, or null when the user
//   cancels. It rejects only when the native module is missing (a build that
//   predates the scanner) or there is no foreground Activity.

import { NativeModules, Platform } from "react-native";

interface ZxingQrScannerNativeModule {
  scan(): Promise<string | null>;
  isAvailable(): boolean;
}

/**
 * Resolve the native module, or null when it is not present in this build.
 * Absence is not fatal: the caller falls back to manual address entry, which
 * is the same affordance the old overlay showed on camera failure.
 */
function getNativeModule(): ZxingQrScannerNativeModule | null {
  if (Platform.OS !== "android") return null;

  const mod = NativeModules.ZxingQrScanner as
    | ZxingQrScannerNativeModule
    | undefined;

  if (!mod || typeof mod.scan !== "function") return null;
  return mod;
}

/** True when this build includes the FOSS scanner. */
export function isQrScannerAvailable(): boolean {
  return getNativeModule() !== null;
}

/**
 * Open the full-screen scanner and resolve with the first decoded QR payload.
 *
 * Resolves null when the user backs out. Rejects when the scanner is not
 * compiled into this build — callers should check isQrScannerAvailable() first
 * if they want to hide the affordance rather than surface an error.
 */
export async function scanQrCode(): Promise<string | null> {
  const mod = getNativeModule();
  if (!mod) {
    throw new Error(
      "QR scanning is not available in this build. Enter the address manually.",
    );
  }

  return mod.scan();
}
