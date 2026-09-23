// apps/mobile/src/theme/colors.ts
//
// Sidecoin color palette for the React Native wallet.
//
// Values are ported 1:1 from apps/wallet:
//   • ecash.*      — apps/wallet/tailwind.config.js (the `ecash` scale)
//   • gray.*       — Tailwind's default gray scale, used directly by the
//                    Vue views via utility classes (bg-gray-950, text-gray-400, …)
//   • sc*          — apps/mobile/tailwind.config.js (React Native brand)
//
// Themes (default / rose / cypherpunk) are defined in apps/wallet/src/themes.css
// as CSS overrides of these same utility classes. React Native has no CSS
// cascade, so theme support is deferred to a later phase; the DEFAULT palette
// below is the source of truth until then.
//
// ─── ECASH SCALE = BITCOIN ORANGE (operator directive) ───
// The scale below is Tailwind's `orange` ramp, whose hue (~33°) is the same as
// Bitcoin orange #F7931A. It replaces the green ramp the Vue wallet shipped
// (Tailwind `green`), so the whole app reads as Bitcoin orange rather than
// green. Every consumer indexes this object by shade (ECASH[400], ECASH[600],
// …), so redefining the ramp here recolors all 70+ call sites at once and
// keeps them 1:1 with the original shade selection.
//
// Shade-anchoring: the previous ramp's 400 (#4ade80, L 56%) and 500 (#22c55e,
// L 47%) were the accent pair. The matching orange shades are 400 (#fb923c,
// L 61%) and 500 (#f97316, L 53%), which bracket Bitcoin orange's own L 53.5%
// so the existing foreground/background pairings keep their contrast ratio.
export const ECASH = {
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

/** React Native brand colors (apps/mobile/tailwind.config.js). */
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
