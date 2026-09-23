// packages/mobile/src/theme/colors.ts
//
// Sidecoin color palette for the React Native wallet.
//
// Values are ported 1:1 from packages/wallet:
//   • ecash.*      — packages/wallet/tailwind.config.js (the `ecash` scale)
//   • gray.*       — Tailwind's default gray scale, used directly by the
//                    Vue views via utility classes (bg-gray-950, text-gray-400, …)
//   • sc*          — packages/mobile/tailwind.config.js (React Native brand)
//
// Themes (default / rose / cypherpunk) are defined in packages/wallet/src/themes.css
// as CSS overrides of these same utility classes. React Native has no CSS
// cascade, so theme support is deferred to a later phase; the DEFAULT palette
// below is the source of truth until then.

export const ECASH = {
  50: "#f0fdf4",
  100: "#dcfce7",
  200: "#bbf7d0",
  300: "#86efac",
  400: "#4ade80",
  500: "#22c55e",
  600: "#16a34a",
  700: "#15803d",
  800: "#166534",
  900: "#14532d",
  950: "#052e16",
} as const;

// Tailwind default gray — the wizard's neutral scale.
export const GRAY = {
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
} as const;

/** React Native brand colors (packages/mobile/tailwind.config.js). */
export const SC = {
  primary: "#F7931A",
  secondary: "#4A90D9",
  bg: "#0D1117",
  surface: "#161B22",
  text: "#E6EDF3",
  textMuted: "#8B949E",
  success: "#3FB950",
  warning: "#D29922",
  danger: "#F85149",
} as const;
