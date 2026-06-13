// packages/wallet/src/__tests__/demo.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_DASHBOARD_ROWS,
  DEMO_MODE_EVENT,
  DEMO_MODE_STORAGE_KEY,
  isDemoModeEnabled,
  setDemoMode,
  toggleDemoMode,
} from "../demo";

describe("demo.ts", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("should be disabled by default", () => {
    expect(isDemoModeEnabled()).toBe(false);
  });

  it("should enable Demo Mode in localStorage", () => {
    setDemoMode(true);
    expect(localStorage.getItem(DEMO_MODE_STORAGE_KEY)).toBe("1");
    expect(isDemoModeEnabled()).toBe(true);
  });

  it("should disable Demo Mode by clearing localStorage", () => {
    setDemoMode(true);
    setDemoMode(false);

    expect(localStorage.getItem(DEMO_MODE_STORAGE_KEY)).toBeNull();
    expect(isDemoModeEnabled()).toBe(false);
  });

  it("should toggle Demo Mode", () => {
    expect(toggleDemoMode()).toBe(true);
    expect(isDemoModeEnabled()).toBe(true);

    expect(toggleDemoMode()).toBe(false);
    expect(isDemoModeEnabled()).toBe(false);
  });

  it("should dispatch an event when Demo Mode changes", () => {
    const listener = vi.fn();
    window.addEventListener(DEMO_MODE_EVENT, listener);

    setDemoMode(true);

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(DEMO_MODE_EVENT, listener);
  });

  it("should include screenshot-ready dashboard rows", () => {
    expect(DEMO_DASHBOARD_ROWS.length).toBeGreaterThanOrEqual(7);
    expect(DEMO_DASHBOARD_ROWS.some((row) => row.id === "thunder")).toBe(true);
    expect(DEMO_DASHBOARD_ROWS.some((row) => row.id === "bitnames")).toBe(true);
    expect(DEMO_DASHBOARD_ROWS.some((row) => row.id === "riscy")).toBe(true);
  });
});
