// apps/mobile/src/__tests__/AlphaMeter.test.tsx
//
// Component tests for the AlphaMeter pill: live ticking, the tap-to-explain
// sheet, and the unlimited-plan/F-Droid short-circuits (null render).
//
// Regression covered: the meter must visibly count down while a PRO session
// runs. The engine settles lazily and reads do NOT emit, so without the
// ALPHA_TICK_MS interval calling tickAlpha() the pill froze at its mount
// value until a blur/navigation forced a settle (found on-device).

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { AlphaMeter } from "../components/AlphaMeter";
import {
  ALPHA_TICK_MS,
  beginProSession,
  claimAlphaGrant,
  endProSession,
  getAlphaBalance,
  getAlphaState,
} from "../alpha";
import { CURRENT_ENTITLEMENTS } from "../entitlements";

describe("AlphaMeter", () => {
  afterEach(() => {
    endProSession();
    jest.useRealTimers();
  });

  it("renders the balance and gauge for the metered free tier", () => {
    render(<AlphaMeter />);
    expect(screen.getByText(String(Math.floor(getAlphaBalance())))).toBeTruthy();
  });

  it("counts down on the ALPHA_TICK_MS interval while a PRO session runs", () => {
    jest.useFakeTimers();
    render(<AlphaMeter />);
    const rawStart = getAlphaBalance();
    expect(Math.floor(rawStart)).toBeGreaterThan(2); // fresh tank

    let t = 1_000_000_000_000;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => t);
    beginProSession("platform:zside");

    // Three ticks at 20 s each = 60 s = 100/60 ≈ 1.667 Alpha drained.
    for (let i = 0; i < 3; i += 1) {
      t += ALPHA_TICK_MS;
      act(() => {
        jest.advanceTimersByTime(ALPHA_TICK_MS);
      });
    }

    expect(getAlphaBalance()).toBeCloseTo(rawStart - 100 / 60, 5);
    const displayed = String(Math.floor(rawStart - 100 / 60));
    expect(screen.getByText(displayed)).toBeTruthy();
    expect(screen.queryByText(String(Math.floor(rawStart)))).toBeNull();
    nowSpy.mockRestore();
  });

  it("opens the tap-to-explain sheet with grants and the PRO footer", () => {
    render(<AlphaMeter />);
    fireEvent.press(screen.getByTestId("alpha-meter"));
    expect(screen.getByText("How it works")).toBeTruthy();
    expect(screen.getByText(/First L1 deposit received/)).toBeTruthy();
    expect(screen.getByText(/never\s*drain|never\s+drain/)).toBeTruthy();
  });

  it("renders nothing for unlimited (paid) plans", () => {
    // isProPlan requires a paid plan AND an active/grace status; the basic
    // default is already status "active", so flipping the plan is enough.
    const savedPlan = CURRENT_ENTITLEMENTS.plan;
    const savedStatus = CURRENT_ENTITLEMENTS.status;
    CURRENT_ENTITLEMENTS.plan = "pro";
    CURRENT_ENTITLEMENTS.status = "active";
    try {
      const { toJSON } = render(<AlphaMeter />);
      expect(toJSON()).toBeNull();
    } finally {
      CURRENT_ENTITLEMENTS.plan = savedPlan;
      CURRENT_ENTITLEMENTS.status = savedStatus;
    }
  });

  it("keeps rendering for the metered basic plan", () => {
    const { toJSON } = render(<AlphaMeter />);
    expect(toJSON()).not.toBeNull();
  });

  it("marks claimed grants in the explainer", () => {
    claimAlphaGrant("grant:first-broadcast");
    render(<AlphaMeter />);
    fireEvent.press(screen.getByTestId("alpha-meter"));
    expect(screen.getByText(/First transaction broadcast/)).toBeTruthy();
    expect(screen.getByText("claimed")).toBeTruthy();
    expect(getAlphaState().claimedGrants).toContain("grant:first-broadcast");
  });
});
