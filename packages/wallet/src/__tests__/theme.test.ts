// packages/wallet/src/__tests__/theme.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_EVENT,
  THEME_STORAGE_KEY,
  WALLET_THEMES,
  getWalletTheme,
  isWalletTheme,
  setWalletTheme,
  walletThemeClass,
} from "../theme";

describe("theme.ts", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("should default to the default theme", () => {
    expect(getWalletTheme()).toBe("default");
  });

  it("should expose Default, Rosé, and Cypherpunk themes", () => {
    expect(WALLET_THEMES.map((theme) => theme.id)).toEqual([
      "default",
      "rose",
      "cypherpunk",
    ]);
    expect(WALLET_THEMES.map((theme) => theme.label)).toContain("Rosé");
  });

  it("should validate theme ids", () => {
    expect(isWalletTheme("default")).toBe(true);
    expect(isWalletTheme("rose")).toBe(true);
    expect(isWalletTheme("cypherpunk")).toBe(true);
    expect(isWalletTheme("unknown")).toBe(false);
    expect(isWalletTheme(null)).toBe(false);
  });

  it("should persist the Rosé theme", () => {
    setWalletTheme("rose");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("rose");
    expect(getWalletTheme()).toBe("rose");
  });

  it("should persist the Cypherpunk theme", () => {
    setWalletTheme("cypherpunk");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("cypherpunk");
    expect(getWalletTheme()).toBe("cypherpunk");
  });

  it("should clear storage for the default theme", () => {
    setWalletTheme("rose");
    setWalletTheme("default");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(getWalletTheme()).toBe("default");
  });

  it("should ignore unknown stored theme values", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "not-a-theme");

    expect(getWalletTheme()).toBe("default");
  });

  it("should dispatch an event when the theme changes", () => {
    const listener = vi.fn();
    window.addEventListener(THEME_EVENT, listener);

    setWalletTheme("cypherpunk");

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(THEME_EVENT, listener);
  });

  it("should return theme class names", () => {
    expect(walletThemeClass("default")).toBe("theme-default");
    expect(walletThemeClass("rose")).toBe("theme-rose");
    expect(walletThemeClass("cypherpunk")).toBe("theme-cypherpunk");
  });
});
