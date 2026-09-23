// apps/mobile/src/__tests__/DashboardScreen.test.tsx
//
// Tests for the Dashboard screen.
//
// These assertions were moved verbatim out of App.test.tsx when App.tsx
// became a provider shell (Phase 2). The content they cover — branding, the
// fork countdown, chain info, the sidechain list, and workspace validation —
// now lives in ./screens/DashboardScreen.tsx, which was relocated 1:1 from the
// pre-shell App body so nothing regresses.

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { LAUNCH_SIDECHAINS } from "@sidecoin/shared/sidechains";
import { DashboardScreen } from "../screens/DashboardScreen";

// react-native-safe-area-context — the dashboard reads insets for padding.
jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const View = require("react-native").View;
  return {
    SafeAreaProvider: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
    SafeAreaView: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
    useSafeAreaInsets: () => inset,
    SafeAreaInsetsContext: {
      Consumer: ({ children }: any) => children(inset),
    },
    initialWindowMetrics: { frame: { x: 0, y: 0, width: 0, height: 0 }, insets: inset },
  };
});

describe("DashboardScreen", () => {
  it("should render without crashing", () => {
    const { toJSON } = render(<DashboardScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it("should display the app title 'SidΞcoin'", () => {
    render(<DashboardScreen />);
    expect(screen.getByText("SidΞcoin")).toBeTruthy();
  });

  it("should display the subtitle 'eCash Drivechain Wallet'", () => {
    render(<DashboardScreen />);
    expect(screen.getByText("eCash Drivechain Wallet")).toBeTruthy();
  });

  it("should display 'Fork Countdown' section", () => {
    render(<DashboardScreen />);
    expect(screen.getByText("Fork Countdown")).toBeTruthy();
  });

  it("should display the fork activation timestamp", () => {
    render(<DashboardScreen />);
    expect(screen.getByText("2026-10-31T15:00:00Z")).toBeTruthy();
  });

  it("should display 'Chain' section", () => {
    render(<DashboardScreen />);
    expect(screen.getByText("Chain")).toBeTruthy();
  });

  it("should display PoW algorithm as sha256d", () => {
    render(<DashboardScreen />);
    expect(screen.getByText("PoW: sha256d")).toBeTruthy();
  });

  it("should display BIP-300 status", () => {
    render(<DashboardScreen />);
    expect(screen.getByText("BIP-300: Active")).toBeTruthy();
  });

  it("should display BIP-301 status", () => {
    render(<DashboardScreen />);
    expect(screen.getByText("BIP-301: Active")).toBeTruthy();
  });

  it("should display the Sidechains section with count", () => {
    render(<DashboardScreen />);
    expect(screen.getByText(`Sidechains (${LAUNCH_SIDECHAINS.length})`)).toBeTruthy();
  });

  it("should display Thunder Network sidechain", () => {
    render(<DashboardScreen />);
    expect(screen.getByText(/#9 Thunder Network/)).toBeTruthy();
  });

  it("should display zSide sidechain", () => {
    render(<DashboardScreen />);
    expect(screen.getByText(/#98 zSide/)).toBeTruthy();
  });

  it("should display BitNames sidechain", () => {
    render(<DashboardScreen />);
    expect(screen.getByText(/#2 BitNames/)).toBeTruthy();
  });

  it("should display BitAssets sidechain", () => {
    render(<DashboardScreen />);
    expect(screen.getByText(/#4 BitAssets/)).toBeTruthy();
  });

  it("should display Photon sidechain", () => {
    render(<DashboardScreen />);
    expect(screen.getByText(/#99 Photon/)).toBeTruthy();
  });

  it("should display Truthcoin sidechain", () => {
    render(<DashboardScreen />);
    expect(screen.getByText(/#13 Truthcoin/)).toBeTruthy();
  });

  it("should display CoinShift sidechain", () => {
    render(<DashboardScreen />);
    expect(screen.getByText(/#255 CoinShift/)).toBeTruthy();
  });

  it("should display the active RISCy sidechain slot", () => {
    render(<DashboardScreen />);
    expect(screen.getByText(/#3 RISCy/)).toBeTruthy();
  });

  it("should display the coming-soon Elements Plus sidechain without a fake slot", () => {
    render(<DashboardScreen />);
    expect(screen.getByText(/Slot TBD Elements Plus/)).toBeTruthy();
  });

  it("should display workspace validation success", () => {
    render(<DashboardScreen />);
    expect(screen.getByText("Workspace")).toBeTruthy();
    expect(screen.getByText("✅ @sidecoin/shared linked and working")).toBeTruthy();
  });

  it("should display the block height estimate", () => {
    render(<DashboardScreen />);
    // Block ~973,728 formatted with toLocaleString
    expect(screen.getByText(/973/)).toBeTruthy();
  });
});
