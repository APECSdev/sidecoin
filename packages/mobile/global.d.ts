// packages/mobile/global.d.ts
//
// Global type declarations for the Sidecoin React Native app.
//
// These declarations fill gaps where community @types packages
// are missing or incomplete, and set up the NativeWind className
// prop for all React Native core components.

// ──────────────────────────────────────────────────────
// NativeWind className prop
//
// This enables <View className="flex-1 bg-sc-bg"> syntax
// across all React Native core components.
// ──────────────────────────────────────────────────────
/// <reference types="nativewind/types" />

// ──────────────────────────────────────────────────────
// SVG imports (used by react-native-svg / qrcode-svg)
// ──────────────────────────────────────────────────────
declare module "*.svg" {
  import React from "react";
  import { SvgProps } from "react-native-svg";
  const content: React.FC<SvgProps>;
  export default content;
}

// ──────────────────────────────────────────────────────
// Image imports
// ──────────────────────────────────────────────────────
declare module "*.png" {
  const value: number;
  export default value;
}

declare module "*.jpg" {
  const value: number;
  export default value;
}

declare module "*.jpeg" {
  const value: number;
  export default value;
}

declare module "*.gif" {
  const value: number;
  export default value;
}

declare module "*.webp" {
  const value: number;
  export default value;
}

// ──────────────────────────────────────────────────────
// Node.js polyfill globals
//
// These are injected by Metro via extraNodeModules and
// the polyfills loaded in src/polyfills.ts. We declare
// them globally so TypeScript doesn't complain.
// ──────────────────────────────────────────────────────
declare var Buffer: typeof import("buffer").Buffer;
declare var process: typeof import("process");
