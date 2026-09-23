// apps/mobile/src/theme/index.ts
//
// Wallet appearance theme helper — ported from apps/wallet/src/theme.ts.
//
// Themes are display-only preferences. They must never affect signing,
// addresses, balances, transaction construction, entitlement checks, swaps,
// coin splitting, settlement, or broadcast.
//
// PORT NOTE: the Vue original reads localStorage synchronously and broadcasts
// a `window` CustomEvent. React Native has neither. AsyncStorage is async, so
// readWalletTheme() returns a Promise and setWalletTheme() is async. The
// CustomEvent is replaced by an in-memory listener set so mounted components
// can re-render without a global event bus. This preserves the original
// behaviour (theme changes propagate live) with an async-shaped API.

import AsyncStorage from "@react-native-async-storage/async-storage";

export type WalletTheme = "default" | "rose" | "cypherpunk";

export interface WalletThemeOption {
  id: WalletTheme;
  label: string;
  description: string;
}

export const THEME_STORAGE_KEY = "sidecoin-wallet-theme";

// The Vue original names a DOM event; RN has no DOM. Keep the constant name
// for parity so callers that reference it still compile, but it is unused.
export const THEME_EVENT = "sidecoin-theme-changed";

export const WALLET_THEMES: WalletThemeOption[] = [
  {
    id: "default",
    label: "Default",
    description: "Sidecoin green for the Drivechains Financial Hub.",
  },
  {
    id: "rose",
    label: "Rosé",
    description: "Soft pinks, pastels, and a friendlier wallet feel.",
  },
  {
    id: "cypherpunk",
    label: "Cypherpunk",
    description: "Neon yellow, cyan, magenta, and high-contrast energy.",
  },
];

export function isWalletTheme(value: string | null): value is WalletTheme {
  return value === "default" || value === "rose" || value === "cypherpunk";
}

// ──────────────────────────────────────────────────────
// In-memory listener set — the RN replacement for the
// `window` CustomEvent dispatched by the Vue original.
// ──────────────────────────────────────────────────────
type ThemeListener = (theme: WalletTheme) => void;
const listeners = new Set<ThemeListener>();

/** Subscribe to theme changes. Returns an unsubscribe function. */
export function subscribeWalletTheme(listener: ThemeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitWalletTheme(theme: WalletTheme): void {
  for (const listener of listeners) {
    listener(theme);
  }
}

export async function getWalletTheme(): Promise<WalletTheme> {
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // storage unavailable — fall through to the default
    stored = null;
  }
  return isWalletTheme(stored) ? stored : "default";
}

export async function setWalletTheme(theme: WalletTheme): Promise<void> {
  try {
    if (theme === "default") {
      await AsyncStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // persist failure is non-fatal — the in-memory emit below still runs
  }
  emitWalletTheme(theme);
}

export function walletThemeClass(theme: WalletTheme): string {
  return `theme-${theme}`;
}
