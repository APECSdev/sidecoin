// packages/wallet/src/theme.ts
//
// Wallet appearance theme helper.
//
// Themes are display-only preferences. They must never affect signing,
// addresses, balances, transaction construction, entitlement checks, swaps,
// coin splitting, settlement, or broadcast.

export type WalletTheme = "default" | "rose" | "cypherpunk";

export interface WalletThemeOption {
  id: WalletTheme;
  label: string;
  description: string;
}

export const THEME_STORAGE_KEY = "sidecoin-wallet-theme";
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

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isWalletTheme(value: string | null): value is WalletTheme {
  return value === "default" || value === "rose" || value === "cypherpunk";
}

export function getWalletTheme(): WalletTheme {
  const stored = getStorage()?.getItem(THEME_STORAGE_KEY) ?? null;
  return isWalletTheme(stored) ? stored : "default";
}

export function setWalletTheme(theme: WalletTheme): void {
  const storage = getStorage();

  if (storage) {
    if (theme === "default") {
      storage.removeItem(THEME_STORAGE_KEY);
    } else {
      storage.setItem(THEME_STORAGE_KEY, theme);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(THEME_EVENT, {
        detail: { theme },
      }),
    );
  }
}

export function walletThemeClass(theme: WalletTheme): string {
  return `theme-${theme}`;
}
