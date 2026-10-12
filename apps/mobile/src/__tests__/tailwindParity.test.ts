// apps/mobile/src/__tests__/tailwindParity.test.ts
//
// Palette parity guard: tailwind.config.js mirrors the color VALUES from
// src/theme/colors.ts (the single source of truth, consumed by the existing
// StyleSheet code) into Tailwind classes for NativeWind. If someone edits
// one side without the other, this test fails.
//
// tailwind.config.js is CommonJS (Tailwind loads it with require), so this
// test requires it the same way instead of importing it.

import { ECASH, GRAY, SC } from "../theme/colors";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const tailwindConfig = require("../../tailwind.config.js");

describe("tailwind.config.js ↔ src/theme/colors.ts parity", () => {
  it("ecash scale matches ECASH (1:1 with apps/wallet's ecash scale)", () => {
    expect(tailwindConfig.theme.extend.colors.ecash).toEqual(ECASH);
  });

  it("gray scale matches GRAY (the Vue views' neutral scale)", () => {
    expect(tailwindConfig.theme.extend.colors.gray).toEqual(GRAY);
  });

  it("sc-* brand colors match SC", () => {
    const colors = tailwindConfig.theme.extend.colors;
    expect(colors["sc-primary"]).toBe(SC.primary);
    expect(colors["sc-secondary"]).toBe(SC.secondary);
    expect(colors["sc-bg"]).toBe(SC.bg);
    expect(colors["sc-surface"]).toBe(SC.surface);
    expect(colors["sc-text"]).toBe(SC.text);
    expect(colors["sc-text-muted"]).toBe(SC.textMuted);
    expect(colors["sc-success"]).toBe(SC.success);
    expect(colors["sc-warning"]).toBe(SC.warning);
    expect(colors["sc-danger"]).toBe(SC.danger);
  });

  it("scans every source tree that can contain className", () => {
    expect(tailwindConfig.content).toContain("./src/**/*.{js,jsx,ts,tsx}");
    expect(tailwindConfig.content).toContain("./App.tsx");
  });
});
