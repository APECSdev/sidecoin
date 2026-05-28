// packages/mobile/tailwind.config.js
//
// Tailwind CSS configuration for NativeWind.
//
// NativeWind uses Tailwind's JIT compiler to generate
// React Native-compatible styles. This config tells
// Tailwind which files to scan for className usage.

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
    "../shared/src/**/*.{js,jsx,ts,tsx}",
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
      // ──────────────────────────────────────────────
      // Sidecoin brand colors.
      // These are provisional — update with final
      // brand palette before launch.
      // ──────────────────────────────────────────────
      colors: {
        "sc-primary": "#F7931A",    // Bitcoin orange — eCash inherits the vibe
        "sc-secondary": "#4A90D9",  // Sidechain blue
        "sc-bg": "#0D1117",         // Dark background (matches ecash.com aesthetic)
        "sc-surface": "#161B22",    // Card/surface background
        "sc-text": "#E6EDF3",       // Primary text on dark
        "sc-text-muted": "#8B949E", // Secondary/muted text
        "sc-success": "#3FB950",    // Confirmed / success states
        "sc-warning": "#D29922",    // Pending / caution states
        "sc-danger": "#F85149",     // Error / failed states
      },

      fontFamily: {
        "sc-mono": ["SpaceMono", "Courier", "monospace"],
      },
    },
  },

  plugins: [],
};
