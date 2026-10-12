// apps/mobile/tailwind.config.js
//
// Tailwind CSS configuration for NativeWind (React Native).
//
// NativeWind uses Tailwind's compiler to generate React Native-compatible
// styles from className strings. This config tells Tailwind which files to
// scan and extends the theme with the Sidecoin palette.
//
// SINGLE SOURCE OF TRUTH: the palette VALUES live in src/theme/colors.ts
// (ECASH / GRAY / SC), which the existing StyleSheet code consumes. This
// file mirrors them into Tailwind classes (bg-ecash-500, text-sc-danger, …)
// so both styling paths share one palette. src/__tests__/tailwindParity.test.ts
// FAILS if the two drift — update colors.ts first, then this file.

/** @type {import('tailwindcss').Config} */
module.exports = {
  // ────────────────────────────────────────────────────
  // content:
  //   Scan all TSX/JSX files in this app AND in the
  //   shared package (in case shared exports components
  //   or className strings in the future).
  // ────────────────────────────────────────────────────
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./App.tsx",
    // apps/mobile is a sibling of packages/shared.
    "../../packages/shared/src/**/*.{js,jsx,ts,tsx}",
  ],

  // ────────────────────────────────────────────────────
  // presets:
  //   NativeWind provides a preset that adjusts
  //   Tailwind's default theme for React Native
  //   (e.g. rem → px conversion, platform colors).
  // ────────────────────────────────────────────────────
  presets: [require("nativewind/preset")],

  theme: {
    extend: {
      // ──────────────────────────────────────────────────
      // Palette — mirrored from src/theme/colors.ts.
      // Parity enforced by src/__tests__/tailwindParity.test.ts.
      //
      //   ecash.*  — Bitcoin-orange ramp, 1:1 with apps/wallet's
      //              tailwind.config.js `ecash` scale (bg-ecash-400, …)
      //   gray.*   — Tailwind's default gray scale, OVERRIDDEN here to the
      //              same values the Vue views use (bg-gray-950, text-gray-400)
      //   sc-*     — React Native brand colors (bg-sc-bg, text-sc-danger, …)
      // ──────────────────────────────────────────────────
      colors: {
        ecash: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
          950: "#431407",
        },
        gray: {
          50: "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#6b7280",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827",
          950: "#030712",
        },
        "sc-primary": "#F7931A",
        "sc-secondary": "#4A90D9",
        "sc-bg": "#0D1117",
        "sc-surface": "#161B22",
        "sc-text": "#E6EDF3",
        "sc-text-muted": "#8B949E",
        "sc-success": "#3FB950",
        "sc-warning": "#D29922",
        "sc-danger": "#F85149",
      },

      fontFamily: {
        "sc-mono": ["SpaceMono", "Courier", "monospace"],
      },
    },
  },

  plugins: [],
};
